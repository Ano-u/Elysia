import type { PoolClient, QueryResult } from "pg";
import type { ViolationType } from "./moderation.js";

type SqlExecutor = Pick<PoolClient, "query">;

export type QueueTargetType = "record" | "media" | "user" | "access_application" | "appeal";
export type QueueType = "moderation" | "second_review" | "risk_control" | "access_application" | "appeal" | "media_review";

export async function enqueueModerationQueue(
  client: SqlExecutor,
  args: {
    targetType: QueueTargetType;
    targetId: string;
    queueType: QueueType;
    reason: string;
    priority?: number;
    payload?: Record<string, unknown>;
    targetRevisionNo?: number | null;
    slaHours?: number;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO moderation_queue (
        target_type,
        target_id,
        target_revision_no,
        priority,
        queue_type,
        reason,
        payload,
        sla_due_at
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        NOW() + ($8::text || ' hour')::interval
      WHERE NOT EXISTS (
        SELECT 1
        FROM moderation_queue mq
        WHERE mq.target_type = $1
          AND mq.target_id = $2
          AND mq.queue_type = $5
          AND (
            ($3::int IS NULL AND mq.target_revision_no IS NULL)
            OR mq.target_revision_no = $3::int
          )
          AND mq.queue_status IN ('open', 'claimed')
      )
    `,
    [
      args.targetType,
      args.targetId,
      args.targetRevisionNo ?? null,
      args.priority ?? 5,
      args.queueType,
      args.reason,
      JSON.stringify(args.payload ?? {}),
      args.slaHours ?? 24,
    ],
  );
}

export async function activateRiskControl(
  client: SqlExecutor,
  args: {
    userId: string;
    recordId?: string | null;
    reason: string;
    riskLevel: "medium" | "elevated" | "high" | "very_high";
    triggerSource: "auto_text" | "auto_ai" | "manual";
    triggerIpHash?: string | null;
    payload?: Record<string, unknown>;
    durationHours?: number;
  },
): Promise<{ eventId: string; endsAt: string }> {
  const hours = args.durationHours ?? 24;
  const inserted = (await client.query<{ id: string; ends_at: string }>(
    `
      INSERT INTO risk_control_events (
        user_id,
        record_id,
        trigger_source,
        risk_level,
        reason,
        trigger_ip_hash,
        ends_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7::text || ' hour')::interval, $8::jsonb)
      RETURNING id, ends_at
    `,
    [
      args.userId,
      args.recordId ?? null,
      args.triggerSource,
      args.riskLevel,
      args.reason,
      args.triggerIpHash ?? null,
      hours,
      JSON.stringify(args.payload ?? {}),
    ],
  )) as QueryResult<{ id: string; ends_at: string }>;

  const event = inserted.rows[0];

  await client.query(
    `
      UPDATE users
      SET
        risk_control_until = GREATEST(COALESCE(risk_control_until, NOW()), $2::timestamptz),
        risk_control_reason = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [args.userId, event.ends_at, args.reason],
  );

  return {
    eventId: event.id,
    endsAt: event.ends_at,
  };
}

export async function createBanEvent(
  client: SqlExecutor,
  args: {
    userId: string;
    ipHash?: string | null;
    source: "risk_auto" | "admin_manual" | "report";
    violationType: ViolationType;
    reason: string;
    isPermanent: boolean;
    createdBy?: string | null;
    banHours?: number | null;
  },
): Promise<{ banEventId: string }> {
  const mappedViolationType = args.violationType === "privacy" ? "other" : args.violationType;
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO ban_events (
        user_id,
        ip_hash,
        source,
        violation_type,
        reason,
        is_permanent,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [args.userId, args.ipHash ?? null, args.source, mappedViolationType, args.reason, args.isPermanent, args.createdBy ?? null],
  );

  if (args.isPermanent) {
    await client.query(
      `
        UPDATE users
        SET is_banned = TRUE, ban_until = NULL, updated_at = NOW()
        WHERE id = $1
      `,
      [args.userId],
    );
  } else {
    const hours = args.banHours ?? 24;
    await client.query(
      `
        UPDATE users
        SET is_banned = TRUE, ban_until = NOW() + ($2::text || ' hour')::interval, updated_at = NOW()
        WHERE id = $1
      `,
      [args.userId, hours],
    );
  }

  if (args.ipHash) {
    await client.query(
      `
        INSERT INTO ip_bans (ip_hash, reason, is_permanent, banned_until, source_ban_event_id, created_by)
        VALUES ($1, $2, $3, CASE WHEN $3 THEN NULL ELSE NOW() + INTERVAL '24 hour' END, $4, $5)
        ON CONFLICT (ip_hash)
        DO UPDATE SET
          reason = EXCLUDED.reason,
          is_permanent = EXCLUDED.is_permanent,
          banned_until = EXCLUDED.banned_until,
          source_ban_event_id = EXCLUDED.source_ban_event_id,
          created_by = EXCLUDED.created_by,
          lifted_at = NULL,
          lifted_by = NULL,
          lift_reason = NULL
      `,
      [args.ipHash, args.reason, args.isPermanent, inserted.rows[0].id, args.createdBy ?? null],
    );
  }

  return { banEventId: inserted.rows[0].id };
}

export function isRiskControlActive(riskControlUntil: string | null): boolean {
  if (!riskControlUntil) {
    return false;
  }
  return new Date(riskControlUntil).getTime() > Date.now();
}

export function canSubmitAppeal(existingAppealStatus: "pending" | "approved" | "rejected" | null): {
  ok: boolean;
  code: "APPEAL_PENDING" | "APPEAL_USED" | null;
  message: string | null;
} {
  if (existingAppealStatus === "pending") {
    return {
      ok: false,
      code: "APPEAL_PENDING",
      message: "申诉已提交，请勿重复提交",
    };
  }

  if (existingAppealStatus === "approved" || existingAppealStatus === "rejected") {
    return {
      ok: false,
      code: "APPEAL_USED",
      message: "该封禁事件仅允许一次申诉",
    };
  }

  return {
    ok: true,
    code: null,
    message: null,
  };
}

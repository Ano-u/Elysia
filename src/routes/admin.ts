import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { writeAuditLog } from "../lib/audit.js";
import { activateRiskControl, createBanEvent, enqueueModerationQueue } from "../lib/risk-control.js";
import { buildAiReviewCsv, callAiReview, validateAiBaseUrl, type AiEndpointType } from "../lib/ai-review.js";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/secrets.js";
import type { ViolationType } from "../lib/moderation.js";

type SqlClient = Pick<PoolClient, "query">;

type QueueType =
  | "moderation"
  | "second_review"
  | "risk_control"
  | "access_application"
  | "appeal"
  | "media_review"
  | "custom_mood_review";
type QueueStatus = "open" | "claimed" | "resolved";
type RiskEventStatus = "active" | "released" | "warned" | "banned";

type AiDecisionApply = {
  publicationStatus: "published" | "pending_manual" | "pending_second_review" | "risk_control_24h";
  isPublic: boolean;
  queueType: QueueType | null;
  triggerRiskControl: boolean;
};

const moderationQueueTypeSchema = z.enum([
  "moderation",
  "second_review",
  "risk_control",
  "access_application",
  "appeal",
  "media_review",
  "custom_mood_review",
]);
const moderationQueueStatusSchema = z.enum(["open", "claimed", "resolved"]);

function normalizeViolationType(value: unknown): ViolationType {
  if (value === "political" || value === "gore_violence" || value === "extremism" || value === "privacy") {
    return value;
  }
  return "other";
}

function aiDecisionToApply(
  level: string,
  args?: { visibilityIntent?: "private" | "public"; isCustomMood?: boolean },
): AiDecisionApply {
  if (args?.isCustomMood) {
    if (level === "very_high") {
      return {
        publicationStatus: "risk_control_24h",
        isPublic: false,
        queueType: "risk_control",
        triggerRiskControl: true,
      };
    }

    return {
      publicationStatus: "pending_manual",
      isPublic: false,
      queueType: "custom_mood_review",
      triggerRiskControl: false,
    };
  }

  switch (level) {
    case "very_low":
    case "low":
      return {
        publicationStatus: "published",
        isPublic: true,
        queueType: null,
        triggerRiskControl: false,
      };
    case "medium":
    case "elevated":
      return {
        publicationStatus: "pending_manual",
        isPublic: false,
        queueType: "moderation",
        triggerRiskControl: false,
      };
    case "high":
      return {
        publicationStatus: "pending_second_review",
        isPublic: false,
        queueType: "second_review",
        triggerRiskControl: false,
      };
    case "very_high":
    default:
      return {
        publicationStatus: "risk_control_24h",
        isPublic: false,
        queueType: "risk_control",
        triggerRiskControl: true,
      };
  }
}

function queuePriorityFromRisk(level: string): number {
  switch (level) {
    case "very_high":
      return 1;
    case "high":
      return 2;
    case "elevated":
      return 3;
    case "medium":
      return 5;
    case "low":
      return 7;
    case "very_low":
    default:
      return 8;
  }
}

function mapRecordDecision(args: {
  decision: "approve" | "reject" | "needs_changes" | "second_review" | "risk_control";
  visibilityIntent: "private" | "public";
}): {
  publicationStatus: string;
  isPublic: boolean;
  reviewDecision: "pass" | "reject" | "escalate";
  queueType: QueueType | null;
  triggerRiskControl: boolean;
} {
  switch (args.decision) {
    case "approve":
      return {
        publicationStatus: args.visibilityIntent === "public" ? "published" : "private",
        isPublic: args.visibilityIntent === "public",
        reviewDecision: "pass",
        queueType: null,
        triggerRiskControl: false,
      };
    case "reject":
      return {
        publicationStatus: "rejected",
        isPublic: false,
        reviewDecision: "reject",
        queueType: null,
        triggerRiskControl: false,
      };
    case "needs_changes":
      return {
        publicationStatus: "needs_changes",
        isPublic: false,
        reviewDecision: "reject",
        queueType: null,
        triggerRiskControl: false,
      };
    case "second_review":
      return {
        publicationStatus: "pending_second_review",
        isPublic: false,
        reviewDecision: "escalate",
        queueType: "second_review",
        triggerRiskControl: false,
      };
    case "risk_control":
    default:
      return {
        publicationStatus: "risk_control_24h",
        isPublic: false,
        reviewDecision: "escalate",
        queueType: "risk_control",
        triggerRiskControl: true,
      };
  }
}

async function resolveModerationQueue(
  client: SqlClient,
  args: {
    adminId: string;
    targetType?: string;
    targetId?: string;
    queueType?: QueueType;
    payloadField?: string;
    payloadValue?: string;
  },
): Promise<void> {
  await client.query(
    `
      UPDATE moderation_queue
      SET queue_status = 'resolved', assigned_to = $1, updated_at = NOW()
      WHERE queue_status <> 'resolved'
        AND ($2::text IS NULL OR target_type = $2)
        AND ($3::uuid IS NULL OR target_id = $3::uuid)
        AND ($4::text IS NULL OR queue_type = $4)
        AND (
          $5::text IS NULL
          OR $6::text IS NULL
          OR payload ->> $5 = $6
        )
    `,
    [
      args.adminId,
      args.targetType ?? null,
      args.targetId ?? null,
      args.queueType ?? null,
      args.payloadField ?? null,
      args.payloadValue ?? null,
    ],
  );
}

function safeDecrypt(value: string): string {
  try {
    return decryptSecret(value);
  } catch {
    return value;
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/records/deleted", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(80),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      user_id: string;
      mood_phrase: string;
      visibility_intent: "private" | "public";
      publication_status: string;
      deleted_at: string;
      created_at: string;
      updated_at: string;
      display_name: string;
      username: string;
    }>(
      `
        SELECT
          r.id,
          r.user_id,
          r.mood_phrase,
          r.visibility_intent,
          r.publication_status,
          r.deleted_at,
          r.created_at,
          r.updated_at,
          u.display_name,
          u.username
        FROM records r
        JOIN users u ON u.id = r.user_id
        WHERE r.deleted_at IS NOT NULL
        ORDER BY r.deleted_at DESC
        LIMIT $1
      `,
      [q.limit],
    );

    return {
      items: rows.rows,
    };
  });

  app.post("/admin/records/:id/restore", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});
    const note = body.note && body.note.length > 0 ? body.note : "管理员恢复已删除记录";

    const restored = await withTransaction(async (client) => {
      const row = await client.query<{
        id: string;
        user_id: string;
        publication_status: string;
      }>(
        `
          UPDATE records
          SET
            deleted_at = NULL,
            is_public = FALSE,
            publication_status = CASE
              WHEN publication_status = 'published' THEN 'private'
              ELSE publication_status
            END,
            updated_at = NOW(),
            review_notes = COALESCE($2, review_notes)
          WHERE id = $1
            AND deleted_at IS NOT NULL
          RETURNING id, user_id, publication_status
        `,
        [params.id, note],
      );

      if (row.rowCount !== 1) {
        return null;
      }

      await resolveModerationQueue(client, {
        adminId: admin.id,
        targetType: "record",
        targetId: params.id,
      });

      return row.rows[0];
    });

    if (!restored) {
      reply.code(404).send({ message: "未找到可恢复的删除记录" });
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "record.restore",
      targetType: "record",
      targetId: params.id,
      payload: {
        restoredUserId: restored.user_id,
        publicationStatus: restored.publication_status,
        note,
      },
    });

    return {
      ok: true,
      id: params.id,
      publicationStatus: restored.publication_status,
    };
  });

  app.get("/admin/moderation/queue", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        queueType: moderationQueueTypeSchema.optional(),
        queueStatus: moderationQueueStatusSchema.default("open"),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      target_type: string;
      target_id: string;
      target_revision_no: number | null;
      priority: number;
      queue_type: QueueType;
      queue_status: QueueStatus;
      assigned_to: string | null;
      reason: string | null;
      payload: unknown;
      sla_due_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT
          id,
          target_type,
          target_id,
          target_revision_no,
          priority,
          queue_type,
          queue_status,
          assigned_to,
          reason,
          payload,
          sla_due_at,
          created_at,
          updated_at
        FROM moderation_queue
        WHERE ($1::text IS NULL OR queue_type = $1)
          AND queue_status = $2
        ORDER BY priority ASC, created_at ASC
        LIMIT $3
      `,
      [q.queueType ?? null, q.queueStatus, q.limit],
    );

    return { items: rows.rows };
  });

  app.post("/admin/moderation/records/:id/decision", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        decision: z.enum(["approve", "reject", "needs_changes", "second_review", "risk_control"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const note = body.note && body.note.length > 0 ? body.note : null;
    const fallbackReason = note ?? "管理员手动审核";

    const result = await withTransaction(async (client) => {
      const record = await client.query<{
        id: string;
        user_id: string;
        visibility_intent: "private" | "public";
      }>(
        `
          SELECT id, user_id, visibility_intent
          FROM records
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (record.rowCount !== 1) {
        throw new Error("RECORD_NOT_FOUND");
      }
      const target = record.rows[0];
      const mapped = mapRecordDecision({
        decision: body.decision,
        visibilityIntent: target.visibility_intent,
      });

      await client.query(
        `
          UPDATE records
          SET
            publication_status = $2,
            is_public = $3,
            published_at = CASE WHEN $3 THEN COALESCE(published_at, NOW()) ELSE NULL END,
            review_notes = $4,
            requires_re_review = FALSE,
            risk_summary = COALESCE(risk_summary, '{}'::jsonb) || $5::jsonb,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          target.id,
          mapped.publicationStatus,
          mapped.isPublic,
          note,
          JSON.stringify({
            manualDecision: body.decision,
            manualDecisionBy: admin.id,
            manualDecisionAt: new Date().toISOString(),
            manualNote: note,
          }),
        ],
      );

      await client.query(
        `
          INSERT INTO content_reviews (
            target_type,
            target_id,
            review_stage,
            decision,
            confidence,
            risk_score,
            risk_labels,
            reason,
            model_meta,
            reviewer_user_id
          )
          VALUES (
            'record',
            $1,
            'manual',
            $2,
            NULL,
            NULL,
            ARRAY[]::text[],
            $3,
            $4::jsonb,
            $5
          )
        `,
        [
          target.id,
          mapped.reviewDecision,
          fallbackReason,
          JSON.stringify({
            source: "admin_manual",
            decision: body.decision,
          }),
          admin.id,
        ],
      );

      await resolveModerationQueue(client, {
        adminId: admin.id,
        targetType: "record",
        targetId: target.id,
      });

      if (mapped.queueType) {
        await enqueueModerationQueue(client, {
          targetType: "record",
          targetId: target.id,
          queueType: mapped.queueType,
          reason: fallbackReason,
          priority: mapped.queueType === "risk_control" ? 1 : 2,
          payload: {
            source: "admin_record_decision",
            decision: body.decision,
          },
          slaHours: mapped.queueType === "risk_control" ? 4 : 24,
        });
      }

      let riskControlEventId: string | null = null;
      if (mapped.triggerRiskControl) {
        const risk = await activateRiskControl(client, {
          userId: target.user_id,
          recordId: target.id,
          reason: fallbackReason,
          riskLevel: "very_high",
          triggerSource: "manual",
          payload: {
            source: "admin_record_decision",
          },
          durationHours: 24,
        });
        riskControlEventId = risk.eventId;
      }

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'moderation', $2, $3)
        `,
        [target.user_id, "内容审核状态更新", fallbackReason],
      );

      return {
        status: mapped.publicationStatus,
        isPublic: mapped.isPublic,
        riskControlEventId,
      };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "RECORD_NOT_FOUND") {
        reply.code(404).send({ message: "记录不存在" });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.moderation.record_decision",
      targetType: "record",
      targetId: params.id,
      payload: {
        decision: body.decision,
        status: result.status,
      },
    });

    return {
      ok: true,
      recordId: params.id,
      status: result.status,
      isPublic: result.isPublic,
      riskControlEventId: result.riskControlEventId,
    };
  });

  app.post("/admin/moderation/media/:id/decision", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        decision: z.enum(["approve", "reject"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const note = body.note && body.note.length > 0 ? body.note : null;

    const result = await withTransaction(async (client) => {
      const media = await client.query<{
        id: string;
        owner_user_id: string;
        record_id: string | null;
      }>(
        `
          SELECT id, owner_user_id, record_id
          FROM media_assets
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (media.rowCount !== 1) {
        throw new Error("MEDIA_NOT_FOUND");
      }
      const target = media.rows[0];

      await client.query(
        `
          UPDATE media_assets
          SET
            content_moderation_status = $2,
            manual_review_required = FALSE,
            content_reviewed_by = $3,
            content_reviewed_at = NOW(),
            content_review_notes = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id, body.decision === "approve" ? "approved" : "rejected", admin.id, note],
      );

      if (target.record_id) {
        if (body.decision === "reject") {
          await client.query(
            `
              UPDATE records
              SET
                publication_status = 'needs_changes',
                is_public = FALSE,
                review_notes = COALESCE($2, review_notes),
                updated_at = NOW()
              WHERE id = $1
            `,
            [target.record_id, note],
          );
        } else {
          const pending = await client.query<{ total: string }>(
            `
              SELECT COUNT(*)::text AS total
              FROM media_assets
              WHERE record_id = $1
                AND media_type = 'image'
                AND content_moderation_status <> 'approved'
            `,
            [target.record_id],
          );

          if (Number(pending.rows[0]?.total ?? "0") === 0) {
            await client.query(
              `
                UPDATE records
                SET
                  publication_status = CASE
                    WHEN visibility_intent = 'public' AND publication_status = 'pending_manual' THEN 'published'
                    WHEN visibility_intent = 'private' AND publication_status = 'pending_manual' THEN 'private'
                    ELSE publication_status
                  END,
                  is_public = CASE
                    WHEN visibility_intent = 'public' AND publication_status = 'pending_manual' THEN TRUE
                    ELSE is_public
                  END,
                  published_at = CASE
                    WHEN visibility_intent = 'public' AND publication_status = 'pending_manual' THEN COALESCE(published_at, NOW())
                    ELSE published_at
                  END,
                  updated_at = NOW()
                WHERE id = $1
              `,
              [target.record_id],
            );
          }
        }
      }

      await resolveModerationQueue(client, {
        adminId: admin.id,
        targetType: "media",
        targetId: target.id,
      });
      if (target.record_id) {
        await resolveModerationQueue(client, {
          adminId: admin.id,
          targetType: "record",
          targetId: target.record_id,
          queueType: "media_review",
        });
      }

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'moderation', '图片审核状态更新', $2)
        `,
        [target.owner_user_id, note ?? (body.decision === "approve" ? "图片审核通过" : "图片审核未通过")],
      );

      return {
        recordId: target.record_id,
      };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "MEDIA_NOT_FOUND") {
        reply.code(404).send({ message: "媒体不存在" });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.moderation.media_decision",
      targetType: "media",
      targetId: params.id,
      payload: {
        decision: body.decision,
        recordId: result.recordId,
      },
    });

    return {
      ok: true,
      mediaId: params.id,
      decision: body.decision,
      recordId: result.recordId,
    };
  });

  app.get("/admin/access/applications", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      user_id: string;
      username: string;
      display_name: string;
      essay: string;
      status: "pending" | "approved" | "rejected";
      review_note: string | null;
      submitted_at: string;
      reviewed_at: string | null;
      reviewed_by: string | null;
    }>(
      `
        SELECT
          a.id,
          a.user_id,
          u.username,
          u.display_name,
          a.essay,
          a.status,
          a.review_note,
          a.submitted_at,
          a.reviewed_at,
          a.reviewed_by
        FROM access_applications a
        JOIN users u ON u.id = a.user_id
        WHERE a.status = $1
        ORDER BY a.submitted_at ASC
        LIMIT $2
      `,
      [q.status, q.limit],
    );

    return { items: rows.rows };
  });

  app.post("/admin/access/applications/:id/approve", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ note: z.string().trim().max(500).optional() }).parse((req.body ?? {}) as unknown);
    const note = body.note && body.note.length > 0 ? body.note : "欢迎加入 Elysia";

    const result = await withTransaction(async (client) => {
      const appRow = await client.query<{ id: string; user_id: string; status: "pending" | "approved" | "rejected" }>(
        `
          SELECT id, user_id, status
          FROM access_applications
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (appRow.rowCount !== 1) {
        throw new Error("ACCESS_APPLICATION_NOT_FOUND");
      }
      const target = appRow.rows[0];
      if (target.status !== "pending") {
        throw new Error("ACCESS_APPLICATION_NOT_PENDING");
      }

      await client.query(
        `
          UPDATE access_applications
          SET
            status = 'approved',
            review_note = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id, note, admin.id],
      );

      await client.query(
        `
          UPDATE users
          SET access_status = 'approved', updated_at = NOW()
          WHERE id = $1
        `,
        [target.user_id],
      );

      await resolveModerationQueue(client, {
        adminId: admin.id,
        targetType: "access_application",
        targetId: target.id,
      });

      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "access_application",
        payloadField: "applicationId",
        payloadValue: target.id,
      });

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'access', '准入申请已通过', $2)
        `,
        [target.user_id, note],
      );

      return target;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "ACCESS_APPLICATION_NOT_FOUND") {
        reply.code(404).send({
          code: "ACCESS_APPLICATION_NOT_FOUND",
          message: "申请不存在",
        });
        return null;
      }
      if (error instanceof Error && error.message === "ACCESS_APPLICATION_NOT_PENDING") {
        reply.code(409).send({
          code: "ACCESS_APPLICATION_NOT_PENDING",
          message: "该申请已处理",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.access.approve",
      targetType: "access_application",
      targetId: params.id,
      payload: { note },
    });

    return { ok: true, applicationId: params.id, status: "approved" };
  });

  app.post("/admin/access/applications/:id/reject", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ note: z.string().trim().max(500) }).parse(req.body);

    const result = await withTransaction(async (client) => {
      const appRow = await client.query<{ id: string; user_id: string; status: "pending" | "approved" | "rejected" }>(
        `
          SELECT id, user_id, status
          FROM access_applications
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (appRow.rowCount !== 1) {
        throw new Error("ACCESS_APPLICATION_NOT_FOUND");
      }
      const target = appRow.rows[0];
      if (target.status !== "pending") {
        throw new Error("ACCESS_APPLICATION_NOT_PENDING");
      }

      await client.query(
        `
          UPDATE access_applications
          SET
            status = 'rejected',
            review_note = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id, body.note, admin.id],
      );

      await client.query(
        `
          UPDATE users
          SET access_status = 'rejected', updated_at = NOW()
          WHERE id = $1
        `,
        [target.user_id],
      );

      await resolveModerationQueue(client, {
        adminId: admin.id,
        targetType: "access_application",
        targetId: target.id,
      });

      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "access_application",
        payloadField: "applicationId",
        payloadValue: target.id,
      });

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'access', '准入申请未通过', $2)
        `,
        [target.user_id, body.note],
      );

      return target;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "ACCESS_APPLICATION_NOT_FOUND") {
        reply.code(404).send({
          code: "ACCESS_APPLICATION_NOT_FOUND",
          message: "申请不存在",
        });
        return null;
      }
      if (error instanceof Error && error.message === "ACCESS_APPLICATION_NOT_PENDING") {
        reply.code(409).send({
          code: "ACCESS_APPLICATION_NOT_PENDING",
          message: "该申请已处理",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.access.reject",
      targetType: "access_application",
      targetId: params.id,
      payload: { note: body.note },
    });

    return { ok: true, applicationId: params.id, status: "rejected" };
  });

  app.get("/admin/risk-control/events", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        status: z.enum(["active", "released", "warned", "banned"]).default("active"),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      user_id: string;
      record_id: string | null;
      trigger_source: string;
      risk_level: string;
      reason: string;
      status: RiskEventStatus;
      trigger_ip_hash: string | null;
      starts_at: string;
      ends_at: string;
      resolved_by: string | null;
      resolved_at: string | null;
      resolve_note: string | null;
      payload: unknown;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT
          id,
          user_id,
          record_id,
          trigger_source,
          risk_level,
          reason,
          status,
          trigger_ip_hash,
          starts_at,
          ends_at,
          resolved_by,
          resolved_at,
          resolve_note,
          payload,
          created_at,
          updated_at
        FROM risk_control_events
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [q.status, q.limit],
    );

    return { items: rows.rows };
  });

  app.post("/admin/risk-control/events/:id/action", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        action: z.enum(["release", "warn", "ban_temp", "ban_permanent"]),
        note: z.string().trim().max(500).optional(),
        banHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
        ipHash: z.string().trim().optional(),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      const event = await client.query<{
        id: string;
        user_id: string;
        reason: string;
        status: RiskEventStatus;
        trigger_ip_hash: string | null;
        payload: Record<string, unknown>;
      }>(
        `
          SELECT id, user_id, reason, status, trigger_ip_hash, payload
          FROM risk_control_events
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (event.rowCount !== 1) {
        throw new Error("RISK_EVENT_NOT_FOUND");
      }
      const target = event.rows[0];
      if (target.status !== "active") {
        throw new Error("RISK_EVENT_NOT_ACTIVE");
      }

      const note = body.note && body.note.length > 0 ? body.note : target.reason;
      let banEventId: string | null = null;

      if (body.action === "release" || body.action === "warn") {
        await client.query(
          `
            UPDATE risk_control_events
            SET
              status = $2,
              resolved_by = $3,
              resolved_at = NOW(),
              resolve_note = $4,
              updated_at = NOW()
            WHERE id = $1
          `,
          [target.id, body.action === "release" ? "released" : "warned", admin.id, note],
        );

        await client.query(
          `
            UPDATE users
            SET
              risk_control_until = NULL,
              risk_control_reason = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [target.user_id],
        );
      } else {
        const created = await createBanEvent(client, {
          userId: target.user_id,
          ipHash: body.ipHash ?? target.trigger_ip_hash ?? null,
          source: "admin_manual",
          violationType: normalizeViolationType(target.payload?.violationType),
          reason: note,
          isPermanent: body.action === "ban_permanent",
          banHours: body.action === "ban_temp" ? body.banHours ?? 24 * 7 : null,
          createdBy: admin.id,
        });
        banEventId = created.banEventId;

        await client.query(
          `
            UPDATE risk_control_events
            SET
              status = 'banned',
              resolved_by = $2,
              resolved_at = NOW(),
              resolve_note = $3,
              updated_at = NOW()
            WHERE id = $1
          `,
          [target.id, admin.id, note],
        );

        await client.query(
          `
            UPDATE users
            SET
              risk_control_until = NULL,
              risk_control_reason = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [target.user_id],
        );
      }

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'risk_control', '风控处理结果更新', $2)
        `,
        [target.user_id, note],
      );

      return {
        banEventId,
      };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "RISK_EVENT_NOT_FOUND") {
        reply.code(404).send({
          code: "RISK_EVENT_NOT_FOUND",
          message: "风控事件不存在",
        });
        return null;
      }
      if (error instanceof Error && error.message === "RISK_EVENT_NOT_ACTIVE") {
        reply.code(409).send({
          code: "RISK_EVENT_NOT_ACTIVE",
          message: "该风控事件已处理",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.risk_control.action",
      targetType: "risk_control_event",
      targetId: params.id,
      payload: {
        action: body.action,
        banEventId: result.banEventId,
      },
    });

    return {
      ok: true,
      eventId: params.id,
      action: body.action,
      banEventId: result.banEventId,
    };
  });

  app.get("/admin/bans", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        status: z.enum(["active", "lifted"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      user_id: string;
      username: string;
      display_name: string;
      ip_hash: string | null;
      source: string;
      violation_type: string;
      reason: string;
      is_permanent: boolean;
      status: "active" | "lifted";
      created_by: string | null;
      created_at: string;
      lifted_at: string | null;
      lifted_by: string | null;
      lift_reason: string | null;
      appeal_id: string | null;
      appeal_status: "pending" | "approved" | "rejected" | null;
    }>(
      `
        SELECT
          b.id,
          b.user_id,
          u.username,
          u.display_name,
          b.ip_hash,
          b.source,
          b.violation_type,
          b.reason,
          b.is_permanent,
          b.status,
          b.created_by,
          b.created_at,
          b.lifted_at,
          b.lifted_by,
          b.lift_reason,
          a.id AS appeal_id,
          a.status AS appeal_status
        FROM ban_events b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN ban_appeals a ON a.ban_event_id = b.id
        WHERE ($1::text IS NULL OR b.status = $1)
        ORDER BY b.created_at DESC
        LIMIT $2
      `,
      [q.status ?? null, q.limit],
    );

    return { items: rows.rows };
  });

  app.post("/admin/bans/:id/lift", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        reason: z.string().trim().min(2).max(500),
        liftUser: z.boolean().default(true),
        liftIp: z.boolean().default(true),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      const ban = await client.query<{
        id: string;
        user_id: string;
        ip_hash: string | null;
      }>(
        `
          SELECT id, user_id, ip_hash
          FROM ban_events
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (ban.rowCount !== 1) {
        throw new Error("BAN_NOT_FOUND");
      }
      const target = ban.rows[0];

      await client.query(
        `
          UPDATE ban_events
          SET
            status = 'lifted',
            lifted_at = NOW(),
            lifted_by = $2,
            lift_reason = $3
          WHERE id = $1
        `,
        [target.id, admin.id, body.reason],
      );

      if (body.liftUser) {
        await client.query(
          `
            UPDATE users
            SET is_banned = FALSE, ban_until = NULL, updated_at = NOW()
            WHERE id = $1
          `,
          [target.user_id],
        );
      }

      if (body.liftIp) {
        await client.query(
          `
            UPDATE ip_bans
            SET
              lifted_at = NOW(),
              lifted_by = $2,
              lift_reason = $3
            WHERE source_ban_event_id = $1
               OR ($4::text IS NOT NULL AND ip_hash = $4)
          `,
          [target.id, admin.id, body.reason, target.ip_hash],
        );
      }

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'ban', '账号限制已解除', $2)
        `,
        [target.user_id, body.reason],
      );

      return target;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "BAN_NOT_FOUND") {
        reply.code(404).send({
          code: "BAN_NOT_FOUND",
          message: "封禁事件不存在",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.ban.lift",
      targetType: "ban_event",
      targetId: params.id,
      payload: body,
    });

    return { ok: true, banEventId: params.id };
  });

  app.get("/admin/appeals", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const q = z
      .object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      ban_event_id: string;
      user_id: string;
      username: string;
      display_name: string;
      appeal_text: string;
      status: "pending" | "approved" | "rejected";
      resolution_note: string | null;
      reviewed_by: string | null;
      submitted_at: string;
      reviewed_at: string | null;
      ban_violation_type: string;
      ban_reason: string;
      ban_status: "active" | "lifted";
      ban_is_permanent: boolean;
    }>(
      `
        SELECT
          a.id,
          a.ban_event_id,
          a.user_id,
          u.username,
          u.display_name,
          a.appeal_text,
          a.status,
          a.resolution_note,
          a.reviewed_by,
          a.submitted_at,
          a.reviewed_at,
          b.violation_type AS ban_violation_type,
          b.reason AS ban_reason,
          b.status AS ban_status,
          b.is_permanent AS ban_is_permanent
        FROM ban_appeals a
        JOIN users u ON u.id = a.user_id
        JOIN ban_events b ON b.id = a.ban_event_id
        WHERE a.status = $1
        ORDER BY a.submitted_at ASC
        LIMIT $2
      `,
      [q.status, q.limit],
    );

    return { items: rows.rows };
  });

  app.post("/admin/appeals/:id/approve", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        resolutionNote: z.string().trim().min(2).max(500),
        liftUser: z.boolean().default(true),
        liftIp: z.boolean().default(true),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      const appeal = await client.query<{
        id: string;
        ban_event_id: string;
        user_id: string;
        status: "pending" | "approved" | "rejected";
      }>(
        `
          SELECT id, ban_event_id, user_id, status
          FROM ban_appeals
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (appeal.rowCount !== 1) {
        throw new Error("APPEAL_NOT_FOUND");
      }
      const target = appeal.rows[0];
      if (target.status !== "pending") {
        throw new Error("APPEAL_NOT_PENDING");
      }

      await client.query(
        `
          UPDATE ban_appeals
          SET
            status = 'approved',
            resolution_note = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id, body.resolutionNote, admin.id],
      );

      await client.query(
        `
          UPDATE ban_events
          SET
            status = 'lifted',
            lifted_at = NOW(),
            lifted_by = $2,
            lift_reason = $3
          WHERE id = $1
        `,
        [target.ban_event_id, admin.id, body.resolutionNote],
      );

      if (body.liftUser) {
        await client.query(
          `
            UPDATE users
            SET is_banned = FALSE, ban_until = NULL, updated_at = NOW()
            WHERE id = $1
          `,
          [target.user_id],
        );
      }

      if (body.liftIp) {
        await client.query(
          `
            UPDATE ip_bans
            SET
              lifted_at = NOW(),
              lifted_by = $2,
              lift_reason = $3
            WHERE source_ban_event_id = $1
          `,
          [target.ban_event_id, admin.id, body.resolutionNote],
        );
      }

      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "appeal",
        targetType: "appeal",
        targetId: target.id,
      });
      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "appeal",
        payloadField: "appealId",
        payloadValue: target.id,
      });

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'appeal', '申诉处理结果：已通过', $2)
        `,
        [target.user_id, body.resolutionNote],
      );

      return target;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "APPEAL_NOT_FOUND") {
        reply.code(404).send({
          code: "APPEAL_NOT_FOUND",
          message: "申诉不存在",
        });
        return null;
      }
      if (error instanceof Error && error.message === "APPEAL_NOT_PENDING") {
        reply.code(409).send({
          code: "APPEAL_NOT_PENDING",
          message: "该申诉已处理",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.appeal.approve",
      targetType: "appeal",
      targetId: params.id,
      payload: body,
    });

    return { ok: true, appealId: params.id, status: "approved" };
  });

  app.post("/admin/appeals/:id/reject", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        resolutionNote: z.string().trim().min(2).max(500),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      const appeal = await client.query<{
        id: string;
        user_id: string;
        status: "pending" | "approved" | "rejected";
      }>(
        `
          SELECT id, user_id, status
          FROM ban_appeals
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [params.id],
      );
      if (appeal.rowCount !== 1) {
        throw new Error("APPEAL_NOT_FOUND");
      }
      const target = appeal.rows[0];
      if (target.status !== "pending") {
        throw new Error("APPEAL_NOT_PENDING");
      }

      await client.query(
        `
          UPDATE ban_appeals
          SET
            status = 'rejected',
            resolution_note = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id, body.resolutionNote, admin.id],
      );

      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "appeal",
        targetType: "appeal",
        targetId: target.id,
      });
      await resolveModerationQueue(client, {
        adminId: admin.id,
        queueType: "appeal",
        payloadField: "appealId",
        payloadValue: target.id,
      });

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'appeal', '申诉处理结果：已驳回', $2)
        `,
        [target.user_id, body.resolutionNote],
      );

      return target;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "APPEAL_NOT_FOUND") {
        reply.code(404).send({
          code: "APPEAL_NOT_FOUND",
          message: "申诉不存在",
        });
        return null;
      }
      if (error instanceof Error && error.message === "APPEAL_NOT_PENDING") {
        reply.code(409).send({
          code: "APPEAL_NOT_PENDING",
          message: "该申诉已处理",
        });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.appeal.reject",
      targetType: "appeal",
      targetId: params.id,
      payload: body,
    });

    return { ok: true, appealId: params.id, status: "rejected" };
  });

  app.get("/admin/ai-review/config", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const rows = await query<{
      id: string;
      base_url: string;
      api_key: string;
      endpoint_type: AiEndpointType;
      model: string;
      is_enabled: boolean;
      updated_by: string | null;
      updated_at: string;
    }>(
      `
        SELECT id, base_url, api_key, endpoint_type, model, is_enabled, updated_by, updated_at
        FROM ai_review_configs
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    );

    if (rows.rowCount !== 1) {
      return {
        configured: false,
      };
    }

    const target = rows.rows[0];
    const plain = safeDecrypt(target.api_key);

    return {
      configured: true,
      config: {
        id: target.id,
        baseUrl: target.base_url,
        endpointType: target.endpoint_type,
        model: target.model,
        isEnabled: target.is_enabled,
        apiKeyMasked: maskSecret(plain),
        updatedBy: target.updated_by,
        updatedAt: target.updated_at,
      },
    };
  });

  app.put("/admin/ai-review/config", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const body = z
      .object({
        baseUrl: z.string().url(),
        apiKey: z.string().min(1).optional(),
        endpointType: z.enum(["responses", "completions"]),
        model: z.string().trim().min(1).max(128),
        isEnabled: z.boolean().default(true),
      })
      .parse(req.body);

    const baseUrlCheck = validateAiBaseUrl(body.baseUrl);
    if (!baseUrlCheck.ok) {
      reply.code(400).send({
        code: "INVALID_AI_BASE_URL",
        message: baseUrlCheck.message,
      });
      return;
    }

    const current = await query<{ id: string; api_key: string }>(
      `
        SELECT id, api_key
        FROM ai_review_configs
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    );

    let resolvedApiKey: string | null = null;
    if (body.apiKey && body.apiKey.length > 0) {
      resolvedApiKey = body.apiKey;
    } else if (current.rowCount === 1) {
      resolvedApiKey = safeDecrypt(current.rows[0].api_key);
    }

    if (!resolvedApiKey) {
      reply.code(400).send({
        code: "AI_REVIEW_CONFIG_INVALID",
        message: "缺少可用 API Key",
      });
      return;
    }

    const encrypted = encryptSecret(resolvedApiKey);

    const saved = await withTransaction(async (client) => {
      if (current.rowCount === 1) {
        const updated = await client.query<{
          id: string;
          base_url: string;
          endpoint_type: AiEndpointType;
          model: string;
          is_enabled: boolean;
          updated_at: string;
        }>(
          `
            UPDATE ai_review_configs
            SET
              base_url = $2,
              api_key = $3,
              endpoint_type = $4,
              model = $5,
              is_enabled = $6,
              updated_by = $7,
              updated_at = NOW()
            WHERE id = $1
            RETURNING id, base_url, endpoint_type, model, is_enabled, updated_at
          `,
          [current.rows[0].id, baseUrlCheck.normalized, encrypted, body.endpointType, body.model, body.isEnabled, admin.id],
        );
        return updated.rows[0];
      }

      const inserted = await client.query<{
        id: string;
        base_url: string;
        endpoint_type: AiEndpointType;
        model: string;
        is_enabled: boolean;
        updated_at: string;
      }>(
        `
          INSERT INTO ai_review_configs (base_url, api_key, endpoint_type, model, is_enabled, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, base_url, endpoint_type, model, is_enabled, updated_at
        `,
        [baseUrlCheck.normalized, encrypted, body.endpointType, body.model, body.isEnabled, admin.id],
      );
      return inserted.rows[0];
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.ai_review.config_update",
      targetType: "ai_review_config",
      targetId: saved.id,
      payload: {
        endpointType: saved.endpoint_type,
        model: saved.model,
        isEnabled: saved.is_enabled,
      },
    });

    return {
      ok: true,
      config: {
        id: saved.id,
        baseUrl: saved.base_url,
        endpointType: saved.endpoint_type,
        model: saved.model,
        isEnabled: saved.is_enabled,
        updatedAt: saved.updated_at,
      },
    };
  });

  app.post("/admin/ai-review/scan-recent", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const configRows = await query<{
      id: string;
      base_url: string;
      api_key: string;
      endpoint_type: AiEndpointType;
      model: string;
      is_enabled: boolean;
    }>(
      `
        SELECT id, base_url, api_key, endpoint_type, model, is_enabled
        FROM ai_review_configs
        WHERE is_enabled = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    );
    if (configRows.rowCount !== 1) {
      reply.code(409).send({
        code: "AI_REVIEW_NOT_CONFIGURED",
        message: "AI 审核配置不存在或未启用",
      });
      return;
    }

    const config = configRows.rows[0];
    const apiKey = safeDecrypt(config.api_key);

    const candidates = await query<{
      record_id: string;
      user_id: string;
      username: string;
      visibility_intent: "private" | "public";
      mood_mode: "preset" | "other_random" | "custom" | null;
      custom_mood_phrase: string | null;
      mood_phrase: string;
      quote: string | null;
      description: string | null;
      tags: string[];
      created_at: string;
    }>(
      `
        SELECT
          r.id AS record_id,
          r.user_id,
          u.username,
          r.visibility_intent,
          r.mood_mode,
          r.custom_mood_phrase,
          r.mood_phrase,
          rq.quote,
          r.description,
          COALESCE((
            SELECT ARRAY_AGG(t.tag ORDER BY t.created_at ASC)
            FROM record_tags t
            WHERE t.record_id = r.id
          ), ARRAY[]::text[]) AS tags,
          r.created_at
        FROM records r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        WHERE (
            (r.visibility_intent = 'public' AND r.publication_status IN ('pending_auto', 'pending_manual'))
            OR (r.mood_mode = 'custom' AND r.publication_status = 'pending_manual')
          )
          AND r.created_at >= NOW() - INTERVAL '1 hour'
          AND NOT EXISTS (
            SELECT 1
            FROM media_assets ma
            WHERE ma.record_id = r.id
              AND ma.media_type = 'image'
          )
        ORDER BY r.created_at ASC
        LIMIT 500
      `,
    );

    const csv = buildAiReviewCsv(
      candidates.rows.map((row) => ({
        recordId: row.record_id,
        userId: row.user_id,
        username: row.username,
        moodPhrase: row.mood_phrase,
        quote: row.quote,
        description: row.description,
        tags: row.tags,
        createdAt: row.created_at,
      })),
    );

    if (candidates.rowCount === 0) {
      const run = await query<{ id: string }>(
        `
          INSERT INTO ai_review_runs (
            triggered_by,
            range_from,
            range_to,
            record_count,
            status,
            request_csv,
            response_payload,
            summary
          )
          VALUES (
            $1,
            NOW() - INTERVAL '1 hour',
            NOW(),
            0,
            'success',
            $2,
            '{}'::jsonb,
            $3::jsonb
          )
          RETURNING id
        `,
        [
          admin.id,
          csv,
          JSON.stringify({
            matched: 0,
            parsed: 0,
            applied: 0,
          }),
        ],
      );

      return {
        ok: true,
        runId: run.rows[0].id,
        matched: 0,
        parsed: 0,
        applied: 0,
      };
    }

    const remoteConfig = {
      baseUrl: config.base_url,
      apiKey,
      endpointType: config.endpoint_type,
      model: config.model,
    };

    let aiResult:
      | Awaited<ReturnType<typeof callAiReview>>
      | null = null;
    try {
      aiResult = await callAiReview(remoteConfig, csv);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";

      await query(
        `
          INSERT INTO ai_review_runs (
            triggered_by,
            range_from,
            range_to,
            record_count,
            status,
            request_csv,
            response_payload,
            summary
          )
          VALUES (
            $1,
            NOW() - INTERVAL '1 hour',
            NOW(),
            $2,
            'failed',
            $3,
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          admin.id,
          candidates.rowCount,
          csv,
          JSON.stringify({ error: message }),
          JSON.stringify({
            matched: candidates.rowCount,
            parsed: 0,
            applied: 0,
          }),
        ],
      );

      reply.code(502).send({
        code: "AI_REVIEW_UPSTREAM_FAILED",
        message: "AI 审核调用失败",
        detail: message,
      });
      return;
    }

    if (!aiResult) {
      return;
    }

    const candidateById = new Map(candidates.rows.map((row) => [row.record_id, row]));
    const validDecisions = aiResult.decisions.filter((decision) => candidateById.has(decision.recordId));

    const applied = await withTransaction(async (client) => {
      const run = await client.query<{ id: string }>(
        `
          INSERT INTO ai_review_runs (
            triggered_by,
            range_from,
            range_to,
            record_count,
            status,
            request_csv,
            response_payload,
            summary
          )
          VALUES (
            $1,
            NOW() - INTERVAL '1 hour',
            NOW(),
            $2,
            'success',
            $3,
            $4::jsonb,
            $5::jsonb
          )
          RETURNING id
        `,
        [
          admin.id,
          candidates.rowCount,
          csv,
          JSON.stringify({
            requestBody: aiResult.requestBody,
            responsePayload: aiResult.responsePayload,
            responseText: aiResult.responseText,
          }),
          JSON.stringify({
            matched: candidates.rowCount,
            parsed: validDecisions.length,
            applied: 0,
          }),
        ],
      );
      const runId = run.rows[0].id;

      let published = 0;
      let pendingManual = 0;
      let secondReview = 0;
      let riskControl = 0;

      for (const decision of validDecisions) {
        const candidate = candidateById.get(decision.recordId);
        if (!candidate) {
          continue;
        }

        const action = aiDecisionToApply(decision.riskLevel, {
          visibilityIntent: candidate.visibility_intent,
          isCustomMood: candidate.mood_mode === "custom",
        });

        await client.query(
          `
            INSERT INTO ai_review_decisions (run_id, record_id, risk_level, risk_labels, reason, raw_item)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (run_id, record_id) DO NOTHING
          `,
          [runId, decision.recordId, decision.riskLevel, decision.riskLabels, decision.reason, JSON.stringify(decision.rawItem)],
        );

        await client.query(
          `
            UPDATE records
            SET
              publication_status = $2,
              is_public = $3,
              published_at = CASE WHEN $3 THEN COALESCE(published_at, NOW()) ELSE NULL END,
              review_notes = $4,
              risk_summary = COALESCE(risk_summary, '{}'::jsonb) || $5::jsonb,
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            decision.recordId,
            action.publicationStatus,
            action.isPublic,
            decision.reason || null,
            JSON.stringify({
              aiRiskLevel: decision.riskLevel,
              aiRiskLabels: decision.riskLabels,
              aiReason: decision.reason,
              aiReviewedAt: new Date().toISOString(),
              aiReviewAppliedToCustomMood: candidate.mood_mode === "custom",
            }),
          ],
        );

        if (action.queueType) {
          await enqueueModerationQueue(client, {
            targetType: "record",
            targetId: decision.recordId,
            queueType: action.queueType,
            reason: decision.reason || "AI 批处理建议人工复核",
            priority: queuePriorityFromRisk(decision.riskLevel),
            payload: {
              source: "ai_scan_recent",
              riskLevel: decision.riskLevel,
              riskLabels: decision.riskLabels,
            },
            slaHours: action.queueType === "risk_control" ? 4 : 24,
          });
        }

        if (action.triggerRiskControl) {
          await activateRiskControl(client, {
            userId: candidate.user_id,
            recordId: decision.recordId,
            reason: decision.reason || "AI 判定极高风险，进入风控",
            riskLevel: "very_high",
            triggerSource: "auto_ai",
            payload: {
              source: "ai_scan_recent",
              riskLabels: decision.riskLabels,
            },
            durationHours: 24,
          });
        }

        if (action.publicationStatus === "published") {
          published += 1;
        } else if (action.publicationStatus === "pending_manual") {
          pendingManual += 1;
        } else if (action.publicationStatus === "pending_second_review") {
          secondReview += 1;
        } else if (action.publicationStatus === "risk_control_24h") {
          riskControl += 1;
        }
      }

      const summary = {
        matched: candidates.rowCount,
        parsed: validDecisions.length,
        applied: validDecisions.length,
        published,
        pendingManual,
        secondReview,
        riskControl,
      };

      await client.query(
        `
          UPDATE ai_review_runs
          SET summary = $2::jsonb
          WHERE id = $1
        `,
        [runId, JSON.stringify(summary)],
      );

      return {
        runId,
        summary,
      };
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "admin.ai_review.scan_recent",
      targetType: "ai_review_run",
      targetId: applied.runId,
      payload: applied.summary,
    });

    return {
      ok: true,
      runId: applied.runId,
      ...applied.summary,
    };
  });
}

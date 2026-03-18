import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserAllowBanned } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { canSubmitAppeal, enqueueModerationQueue } from "../lib/risk-control.js";
import { writeAuditLog } from "../lib/audit.js";

type AppealListRow = {
  ban_event_id: string;
  ban_status: "active" | "lifted";
  violation_type: string;
  reason: string;
  is_permanent: boolean;
  created_at: string;
  appeal_id: string | null;
  appeal_status: "pending" | "approved" | "rejected" | null;
  appeal_submitted_at: string | null;
  appeal_reviewed_at: string | null;
  resolution_note: string | null;
};

const createAppealSchema = z.object({
  banEventId: z.string().uuid(),
  appealText: z.string().min(10).max(3000),
});

export async function appealRoutes(app: FastifyInstance): Promise<void> {
  app.get("/appeals/status", async (req, reply) => {
    const user = await requireUserAllowBanned(req, reply);
    if (!user) {
      return;
    }

    const rows = await query<AppealListRow>(
      `
        SELECT
          b.id AS ban_event_id,
          b.status AS ban_status,
          b.violation_type,
          b.reason,
          b.is_permanent,
          b.created_at,
          a.id AS appeal_id,
          a.status AS appeal_status,
          a.submitted_at AS appeal_submitted_at,
          a.reviewed_at AS appeal_reviewed_at,
          a.resolution_note
        FROM ban_events b
        LEFT JOIN ban_appeals a ON a.ban_event_id = b.id
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC
        LIMIT 20
      `,
      [user.id],
    );

    return {
      items: rows.rows.map((row) => ({
        banEventId: row.ban_event_id,
        banStatus: row.ban_status,
        violationType: row.violation_type,
        reason: row.reason,
        isPermanent: row.is_permanent,
        createdAt: row.created_at,
        appeal: row.appeal_id
          ? {
              id: row.appeal_id,
              status: row.appeal_status,
              submittedAt: row.appeal_submitted_at,
              reviewedAt: row.appeal_reviewed_at,
              resolutionNote: row.resolution_note,
            }
          : null,
      })),
    };
  });

  app.post("/appeals", async (req, reply) => {
    const user = await requireUserAllowBanned(req, reply);
    if (!user) {
      return;
    }

    const body = createAppealSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      const ban = await client.query<{
        id: string;
        status: "active" | "lifted";
        appeal_status: "pending" | "approved" | "rejected" | null;
      }>(
        `
          SELECT
            b.id,
            b.status,
            a.status AS appeal_status
          FROM ban_events b
          LEFT JOIN ban_appeals a ON a.ban_event_id = b.id
          WHERE b.id = $1
            AND b.user_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [body.banEventId, user.id],
      );

      if (ban.rowCount !== 1) {
        throw new Error("BAN_EVENT_NOT_FOUND");
      }

      const target = ban.rows[0];
      if (target.status !== "active") {
        throw new Error("BAN_EVENT_NOT_ACTIVE");
      }

      const appealCheck = canSubmitAppeal(target.appeal_status);
      if (!appealCheck.ok) {
        throw new Error(appealCheck.code ?? "APPEAL_NOT_ALLOWED");
      }

      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO ban_appeals (ban_event_id, user_id, appeal_text, status)
          VALUES ($1, $2, $3, 'pending')
          RETURNING id
        `,
        [body.banEventId, user.id, body.appealText],
      );

      await enqueueModerationQueue(client, {
        targetType: "appeal",
        targetId: inserted.rows[0].id,
        queueType: "appeal",
        reason: "封禁申诉待处理",
        priority: 3,
        payload: {
          banEventId: body.banEventId,
          appealId: inserted.rows[0].id,
        },
        slaHours: 24,
      });

      await client.query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'appeal', '申诉已提交', '申诉已提交，请勿重复提交，处理结果会通知你。')
        `,
        [user.id],
      );

      return { appealId: inserted.rows[0].id };
    }).catch((error: unknown) => {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message === "BAN_EVENT_NOT_FOUND") {
        reply.code(404).send({ message: "封禁事件不存在" });
        return null;
      }
      if (error.message === "BAN_EVENT_NOT_ACTIVE") {
        reply.code(409).send({
          code: "BAN_EVENT_NOT_ACTIVE",
          message: "该封禁事件已结束，不可再申诉",
        });
        return null;
      }
      if (error.message === "APPEAL_PENDING") {
        reply.code(409).send({
          code: "APPEAL_PENDING",
          message: "申诉已提交，请勿重复提交",
        });
        return null;
      }
      if (error.message === "APPEAL_USED") {
        reply.code(409).send({
          code: "APPEAL_USED",
          message: "该封禁事件仅允许一次申诉",
        });
        return null;
      }

      throw error;
    });

    if (!result) {
      return;
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "appeal.submit",
      targetType: "ban_event",
      targetId: body.banEventId,
      payload: {
        appealId: result.appealId,
        appealLength: body.appealText.length,
      },
    });

    return {
      ok: true,
      appealId: result.appealId,
      status: "pending",
      message: "申诉已提交，请勿重复提交",
    };
  });
}

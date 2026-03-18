import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireUser } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { writeAuditLog } from "../lib/audit.js";
import { createBanEvent } from "../lib/risk-control.js";

function normalizeViolationType(value: string | null | undefined): "political" | "gore_violence" | "extremism" | "other" {
  if (value === "political" || value === "gore_violence" || value === "extremism") {
    return value;
  }
  return "other";
}

export async function governanceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/reports", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        targetUserId: z.string().uuid().optional(),
        targetRecordId: z.string().uuid().optional(),
        reportType: z.enum(["abuse", "spam", "ai_generated", "other"]),
        reason: z.string().min(3).max(500),
      })
      .parse(req.body);

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO reports (reporter_user_id, target_user_id, target_record_id, report_type, reason)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [user.id, body.targetUserId ?? null, body.targetRecordId ?? null, body.reportType, body.reason],
    );

    await writeAuditLog({
      actorUserId: user.id,
      action: "report.create",
      targetType: body.targetRecordId ? "record" : "user",
      targetId: body.targetRecordId ?? body.targetUserId ?? null,
      payload: { reportType: body.reportType },
    });

    return { reportId: inserted.rows[0].id };
  });

  app.get("/admin/reports", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const rows = await query<{
      id: string;
      report_type: string;
      reason: string;
      status: string;
      reporter_user_id: string;
      target_user_id: string | null;
      target_record_id: string | null;
      created_at: string;
    }>(
      `
        SELECT id, report_type, reason, status, reporter_user_id, target_user_id, target_record_id, created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT 200
      `,
    );

    return { items: rows.rows };
  });

  app.post("/admin/reports/:id/resolve", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(["confirmed", "rejected", "closed"]),
        action: z.enum(["none", "warning", "mute_7d", "ban"]).default("none"),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      const report = await client.query<{ id: string; report_type: string; target_user_id: string | null }>(
        `
          UPDATE reports
          SET status = $1, resolved_at = NOW()
          WHERE id = $2
          RETURNING id, report_type, target_user_id
        `,
        [body.status, params.id],
      );
      if (report.rowCount !== 1) {
        throw new Error("REPORT_NOT_FOUND");
      }

      const targetUserId = report.rows[0].target_user_id;
      if (targetUserId && body.action !== "none") {
        await client.query(
          `
            INSERT INTO moderation_actions (report_id, target_user_id, action_type, reason, created_by)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [params.id, targetUserId, body.action, "管理员处理举报", admin.id],
        );

        if (body.action === "mute_7d") {
          await createBanEvent(client, {
            userId: targetUserId,
            source: "report",
            violationType: "other",
            reason: "举报处理：禁言7天",
            isPermanent: false,
            banHours: 24 * 7,
            createdBy: admin.id,
          });
        }

        if (body.action === "ban") {
          await createBanEvent(client, {
            userId: targetUserId,
            source: "report",
            violationType: normalizeViolationType(report.rows[0].report_type),
            reason: "举报处理：永久封禁",
            isPermanent: true,
            createdBy: admin.id,
          });
        }
      }

      if (body.status === "confirmed" && report.rows[0].report_type === "ai_generated" && targetUserId) {
        const stat = await client.query<{ ai_report_confirmed_count: number }>(
          `
            INSERT INTO sanction_logs (user_id, ai_report_confirmed_count)
            VALUES ($1, 1)
            ON CONFLICT (user_id)
            DO UPDATE SET
              ai_report_confirmed_count = sanction_logs.ai_report_confirmed_count + 1,
              updated_at = NOW()
            RETURNING ai_report_confirmed_count
          `,
          [targetUserId],
        );
        const count = stat.rows[0].ai_report_confirmed_count;

        if (count >= 5) {
          await createBanEvent(client, {
            userId: targetUserId,
            source: "report",
            violationType: "other",
            reason: "AI 举报累计达 5 次，永久封禁",
            isPermanent: true,
            createdBy: admin.id,
          });
        } else if (count >= 3) {
          await createBanEvent(client, {
            userId: targetUserId,
            source: "report",
            violationType: "other",
            reason: "AI 举报累计达 3 次，禁言 7 天",
            isPermanent: false,
            banHours: 24 * 7,
            createdBy: admin.id,
          });
        }
      }

      return { ok: true };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "REPORT_NOT_FOUND") {
        reply.code(404).send({ message: "举报不存在" });
        return null;
      }
      throw error;
    });

    if (!result) {
      return;
    }

    broadcast("moderation.changed", { reportId: params.id, status: body.status });
    await writeAuditLog({
      actorUserId: admin.id,
      action: "report.resolve",
      targetType: "report",
      targetId: params.id,
      payload: { status: body.status, action: body.action },
    });

    return result;
  });

  app.post("/admin/users/:id/sanction", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        action: z.enum(["warning", "mute_7d", "ban", "unban"]),
        reason: z.string().min(2).max(300),
        violationType: z.enum(["political", "gore_violence", "extremism", "other"]).default("other"),
        ipHash: z.string().optional(),
      })
      .parse(req.body);

    await withTransaction(async (client) => {
      if (body.action !== "unban") {
        await client.query(
          `
            INSERT INTO moderation_actions (target_user_id, action_type, reason, created_by)
            VALUES ($1, $2, $3, $4)
          `,
          [params.id, body.action, body.reason, admin.id],
        );
      }

      if (body.action === "warning") {
        return;
      }

      if (body.action === "mute_7d") {
        await createBanEvent(client, {
          userId: params.id,
          ipHash: body.ipHash,
          source: "admin_manual",
          violationType: body.violationType,
          reason: body.reason,
          isPermanent: false,
          banHours: 24 * 7,
          createdBy: admin.id,
        });
        return;
      }

      if (body.action === "ban") {
        await createBanEvent(client, {
          userId: params.id,
          ipHash: body.ipHash,
          source: "admin_manual",
          violationType: body.violationType,
          reason: body.reason,
          isPermanent: true,
          createdBy: admin.id,
        });
        return;
      }

      await client.query(
        `
          UPDATE users
          SET is_banned = FALSE, ban_until = NULL, updated_at = NOW()
          WHERE id = $1
        `,
        [params.id],
      );

      await client.query(
        `
          UPDATE ban_events
          SET status = 'lifted', lifted_at = NOW(), lifted_by = $2, lift_reason = $3
          WHERE user_id = $1
            AND status = 'active'
        `,
        [params.id, admin.id, body.reason],
      );
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "user.sanction",
      targetType: "user",
      targetId: params.id,
      payload: { action: body.action, reason: body.reason },
    });

    return { ok: true };
  });
}

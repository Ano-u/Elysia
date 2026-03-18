import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueModerationQueue } from "../lib/risk-control.js";

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  app.get("/access/application/status", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const application = await query<{
      id: string;
      status: "pending" | "approved" | "rejected";
      essay: string;
      review_note: string | null;
      submitted_at: string;
      reviewed_at: string | null;
    }>(
      `
        SELECT id, status, essay, review_note, submitted_at, reviewed_at
        FROM access_applications
        WHERE user_id = $1
      `,
      [user.id],
    );

    const latest = application.rows[0] ?? null;

    return {
      accessStatus: user.accessStatus,
      canSubmit: latest?.status !== "pending" && user.accessStatus !== "approved",
      application: latest
        ? {
            id: latest.id,
            status: latest.status,
            essay: latest.essay,
            reviewNote: latest.review_note,
            submittedAt: latest.submitted_at,
            reviewedAt: latest.reviewed_at,
          }
        : null,
    };
  });

  app.post("/access/application", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const body = z
      .object({
        essay: z.string().trim().min(10).max(2000),
      })
      .parse(req.body);

    const existing = await query<{ status: "pending" | "approved" | "rejected" }>(
      `
        SELECT status
        FROM access_applications
        WHERE user_id = $1
      `,
      [user.id],
    );
    const existingStatus = existing.rows[0]?.status ?? null;
    if (existingStatus === "pending") {
      reply.code(409).send({
        message: "申请已提交，请等待审核",
        code: "ACCESS_APPLICATION_PENDING",
      });
      return;
    }
    if (existingStatus === "approved" || user.accessStatus === "approved") {
      reply.code(409).send({
        message: "账号已通过准入审核，无需重复提交",
        code: "ACCESS_ALREADY_APPROVED",
      });
      return;
    }

    const applicationId = await withTransaction(async (client) => {
      const upserted = await client.query<{ id: string }>(
        `
          INSERT INTO access_applications (
            user_id,
            essay,
            status,
            review_note,
            reviewed_by,
            submitted_at,
            reviewed_at,
            updated_at
          )
          VALUES ($1, $2, 'pending', NULL, NULL, NOW(), NULL, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET
            essay = EXCLUDED.essay,
            status = 'pending',
            review_note = NULL,
            reviewed_by = NULL,
            submitted_at = NOW(),
            reviewed_at = NULL,
            updated_at = NOW()
          RETURNING id
        `,
        [user.id, body.essay],
      );
      const id = upserted.rows[0].id;

      await client.query(
        `
          UPDATE users
          SET access_status = 'pending', updated_at = NOW()
          WHERE id = $1
        `,
        [user.id],
      );

      await enqueueModerationQueue(client, {
        targetType: "access_application",
        targetId: id,
        queueType: "access_application",
        reason: "首次登录准入申请待审核",
        priority: 3,
        payload: {
          applicationId: id,
          userId: user.id,
        },
      });

      return id;
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "access.application.submit",
      targetType: "access_application",
      targetId: applicationId,
    });

    return {
      applicationId,
      status: "pending",
      message: "已提交审核，请勿重复提交",
    };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAccessApproved, requireNotInRiskControl } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";

export async function reactionsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/reactions", async (req, reply) => {
    const accessUser = await requireAccessApproved(req, reply);
    if (!accessUser) {
      return;
    }
    const user = await requireNotInRiskControl(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        recordId: z.string().uuid(),
        reactionType: z.enum(["hug", "heart", "star", "butterfly", "flower"]),
      })
      .parse(req.body);

    const targetRecord = await query<{ id: string }>(
      `
        SELECT id
        FROM records
        WHERE id = $1
          AND is_public = TRUE
          AND publication_status = 'published'
          AND deleted_at IS NULL
      `,
      [body.recordId],
    );
    if (targetRecord.rowCount !== 1) {
      reply.code(404).send({ message: "目标记录不可互动" });
      return;
    }

    await query(
      `
        INSERT INTO reactions (record_id, user_id, reaction_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (record_id, user_id, reaction_type) DO NOTHING
      `,
      [body.recordId, user.id, body.reactionType],
    );

    const summary = await query<{ reaction_type: "hug" | "heart" | "star" | "butterfly" | "flower"; total: string }>(
      `
        SELECT reaction_type, COUNT(*)::text AS total
        FROM reactions
        WHERE record_id = $1
        GROUP BY reaction_type
      `,
      [body.recordId],
    );

    broadcast("reaction.updated", {
      recordId: body.recordId,
      summary: summary.rows,
    });

    return { ok: true };
  });

  app.delete("/reactions/:id", async (req, reply) => {
    const accessUser = await requireAccessApproved(req, reply);
    if (!accessUser) {
      return;
    }
    const user = await requireNotInRiskControl(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const deleted = await query<{ record_id: string }>(
      `
        DELETE FROM reactions
        WHERE id = $1 AND user_id = $2
        RETURNING record_id
      `,
      [params.id, user.id],
    );

    if (deleted.rowCount !== 1) {
      reply.code(404).send({ message: "互动不存在或无权限" });
      return;
    }

    const recordId = deleted.rows[0].record_id;
    const summary = await query<{ reaction_type: "hug" | "heart" | "star" | "butterfly" | "flower"; total: string }>(
      `
        SELECT reaction_type, COUNT(*)::text AS total
        FROM reactions
        WHERE record_id = $1
        GROUP BY reaction_type
      `,
      [recordId],
    );

    broadcast("reaction.updated", { recordId, summary: summary.rows });
    return { ok: true };
  });

  app.get("/records/:id/reactions-summary", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const targetRecord = await query<{ user_id: string }>(
      `
        SELECT user_id
        FROM records
        WHERE id = $1
          AND is_public = TRUE
          AND publication_status = 'published'
          AND deleted_at IS NULL
      `,
      [params.id],
    );
    if (targetRecord.rowCount !== 1) {
      reply.code(404).send({ message: "目标记录不存在或不可见" });
      return;
    }

    const summary = await query<{ reaction_type: "hug" | "heart" | "star" | "butterfly" | "flower"; total: string }>(
      `
        SELECT reaction_type, COUNT(*)::text AS total
        FROM reactions
        WHERE record_id = $1
        GROUP BY reaction_type
      `,
      [params.id],
    );
    return { summary: summary.rows };
  });
}

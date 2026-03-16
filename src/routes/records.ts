import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { validateQuoteLength } from "../lib/utils.js";
import { writeAuditLog } from "../lib/audit.js";

const recordCreateSchema = z.object({
  moodPhrase: z.string().min(1).max(140),
  quote: z.string().trim().min(1).max(200).optional(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
  imageIds: z.array(z.string().uuid()).max(4).optional(),
  drawingId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

const recordPatchSchema = z.object({
  moodPhrase: z.string().min(1).max(140).optional(),
  quote: z.string().max(200).optional().nullable(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
  description: z.string().max(1000).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

type RecordRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  description: string | null;
  is_public: boolean;
  occurred_at: string | null;
  location_id: string | null;
  edit_deadline_at: string;
  created_at: string;
  updated_at: string;
};

async function ensureImageQuota(userId: string, imageIds: string[]): Promise<void> {
  if (imageIds.length > 4) {
    throw new Error("单条记录最多 4 张图片");
  }

  const count = await query<{ image_count: string }>(
    `
      SELECT COUNT(*)::text AS image_count
      FROM media_assets
      WHERE owner_user_id = $1 AND media_type = 'image'
    `,
    [userId],
  );
  const existing = Number(count.rows[0]?.image_count ?? "0");
  if (existing > 60) {
    throw new Error("每用户最多可保存 60 张图片");
  }

  if (imageIds.length > 0) {
    const ownership = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM media_assets
        WHERE owner_user_id = $1
          AND id = ANY($2::uuid[])
          AND media_type = 'image'
      `,
      [userId, imageIds],
    );
    if (Number(ownership.rows[0]?.total ?? "0") !== imageIds.length) {
      throw new Error("存在无权限图片或图片不存在");
    }
  }
}

export async function recordsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/records", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = recordCreateSchema.parse(req.body);

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    const imageIds = body.imageIds ?? [];
    await ensureImageQuota(user.id, imageIds);

    const result = await withTransaction(async (client) => {
      const visibility = body.isPublic ?? false;
      const inserted = await client.query<RecordRow>(
        `
          INSERT INTO records (
            user_id,
            mood_phrase,
            description,
            is_public,
            occurred_at,
            location_id
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          user.id,
          body.moodPhrase,
          body.description ?? null,
          visibility,
          body.occurredAt ?? null,
          body.locationId ?? null,
        ],
      );
      const record = inserted.rows[0];

      await client.query(
        `
          INSERT INTO user_preferences (user_id, last_visibility_public)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET last_visibility_public = EXCLUDED.last_visibility_public, updated_at = NOW()
        `,
        [user.id, visibility],
      );

      if (body.quote) {
        await client.query(
          `
            INSERT INTO record_quotes (record_id, quote)
            VALUES ($1, $2)
          `,
          [record.id, body.quote],
        );
      }

      for (const emotion of body.extraEmotions ?? []) {
        await client.query(
          `
            INSERT INTO record_emotions (record_id, emotion)
            VALUES ($1, $2)
          `,
          [record.id, emotion],
        );
      }

      for (const tag of body.tags ?? []) {
        await client.query(
          `
            INSERT INTO record_tags (record_id, tag)
            VALUES ($1, $2)
          `,
          [record.id, tag],
        );
      }

      if (body.drawingId) {
        await client.query(
          `
            UPDATE drawing_docs
            SET record_id = $1, updated_at = NOW()
            WHERE id = $2 AND owner_user_id = $3
          `,
          [record.id, body.drawingId, user.id],
        );
      }

      if (imageIds.length > 0) {
        await client.query(
          `
            UPDATE media_assets
            SET record_id = $1, updated_at = NOW()
            WHERE owner_user_id = $2
              AND id = ANY($3::uuid[])
              AND media_type = 'image'
          `,
          [record.id, user.id, imageIds],
        );
      }

      // MindMap 基础节点自动生成
      const recordNode = await client.query<{ id: string }>(
        `
          INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
          VALUES ($1, $2, 'record', $3, $4::jsonb)
          RETURNING id
        `,
        [user.id, record.id, body.moodPhrase, JSON.stringify({ isPublic: visibility })],
      );

      if (body.quote) {
        const quoteNode = await client.query<{ id: string }>(
          `
            INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
            VALUES ($1, $2, 'quote', $3, '{}'::jsonb)
            RETURNING id
          `,
          [user.id, record.id, body.quote],
        );
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'manual', 0.8)
          `,
          [recordNode.rows[0].id, quoteNode.rows[0].id],
        );
      }

      return record;
    });

    broadcast("record.created", {
      recordId: result.id,
      userId: user.id,
      isPublic: result.is_public,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.create",
      targetType: "record",
      targetId: result.id,
      payload: { isPublic: result.is_public },
    });

    return { record: result };
  });

  app.patch("/records/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = recordPatchSchema.parse(req.body);

    const current = await query<RecordRow>(
      `
        SELECT *
        FROM records
        WHERE id = $1 AND user_id = $2
      `,
      [params.id, user.id],
    );
    if (current.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    const record = current.rows[0];
    if (new Date(record.edit_deadline_at).getTime() < Date.now()) {
      reply.code(403).send({ message: "正文编辑窗口已超过 30 天" });
      return;
    }

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    await withTransaction(async (client) => {
      const hasMoodPhrase = Object.prototype.hasOwnProperty.call(body, "moodPhrase");
      const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
      const hasOccurredAt = Object.prototype.hasOwnProperty.call(body, "occurredAt");
      const hasLocationId = Object.prototype.hasOwnProperty.call(body, "locationId");

      await client.query(
        `
          UPDATE records
          SET
            mood_phrase = CASE WHEN $1 THEN $2 ELSE mood_phrase END,
            description = CASE WHEN $3 THEN $4 ELSE description END,
            occurred_at = CASE WHEN $5 THEN $6 ELSE occurred_at END,
            location_id = CASE WHEN $7 THEN $8 ELSE location_id END,
            updated_at = NOW()
          WHERE id = $9 AND user_id = $10
        `,
        [
          hasMoodPhrase,
          body.moodPhrase ?? null,
          hasDescription,
          body.description ?? null,
          hasOccurredAt,
          body.occurredAt ?? null,
          hasLocationId,
          body.locationId ?? null,
          params.id,
          user.id,
        ],
      );

      if (Object.prototype.hasOwnProperty.call(body, "quote")) {
        if (!body.quote || body.quote.trim().length === 0) {
          await client.query("DELETE FROM record_quotes WHERE record_id = $1", [params.id]);
        } else {
          await client.query(
            `
              INSERT INTO record_quotes (record_id, quote)
              VALUES ($1, $2)
              ON CONFLICT (record_id)
              DO UPDATE SET quote = EXCLUDED.quote, updated_at = NOW()
            `,
            [params.id, body.quote],
          );
        }
      }

      if (body.extraEmotions) {
        await client.query("DELETE FROM record_emotions WHERE record_id = $1", [params.id]);
        for (const emotion of body.extraEmotions) {
          await client.query(
            `
              INSERT INTO record_emotions (record_id, emotion)
              VALUES ($1, $2)
            `,
            [params.id, emotion],
          );
        }
      }

      if (body.tags) {
        await client.query("DELETE FROM record_tags WHERE record_id = $1", [params.id]);
        for (const tag of body.tags) {
          await client.query(
            `
              INSERT INTO record_tags (record_id, tag)
              VALUES ($1, $2)
            `,
            [params.id, tag],
          );
        }
      }
    });

    broadcast("record.updated", { recordId: params.id, userId: user.id });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.update",
      targetType: "record",
      targetId: params.id,
    });
    return { ok: true };
  });

  app.patch("/records/:id/visibility", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ isPublic: z.boolean() }).parse(req.body);

    const updated = await query<RecordRow>(
      `
        UPDATE records
        SET is_public = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `,
      [body.isPublic, params.id, user.id],
    );
    if (updated.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    await query(
      `
        INSERT INTO user_preferences (user_id, last_visibility_public)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET last_visibility_public = EXCLUDED.last_visibility_public, updated_at = NOW()
      `,
      [user.id, body.isPublic],
    );

    broadcast("record.updated", { recordId: params.id, isPublic: body.isPublic });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.visibility_update",
      targetType: "record",
      targetId: params.id,
      payload: { isPublic: body.isPublic },
    });
    return { record: updated.rows[0] };
  });

  app.get("/records/:id", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const record = await query<RecordRow>(
      `
        SELECT *
        FROM records
        WHERE id = $1
      `,
      [params.id],
    );
    if (record.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    const target = record.rows[0];
    if (!target.is_public && (!req.user || req.user.id !== target.user_id)) {
      reply.code(403).send({ message: "无权限访问该记录" });
      return;
    }

    const quote = await query<{ quote: string }>("SELECT quote FROM record_quotes WHERE record_id = $1", [params.id]);
    const emotions = await query<{ emotion: string }>(
      "SELECT emotion FROM record_emotions WHERE record_id = $1 ORDER BY created_at ASC",
      [params.id],
    );
    const tags = await query<{ tag: string }>("SELECT tag FROM record_tags WHERE record_id = $1 ORDER BY created_at ASC", [
      params.id,
    ]);

    return {
      record: target,
      quote: quote.rows[0]?.quote ?? null,
      extraEmotions: emotions.rows.map((row) => row.emotion),
      tags: tags.rows.map((row) => row.tag),
    };
  });

  app.get("/home/feed", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const querySchema = z.object({
      limit: z.coerce.number().int().positive().max(50).default(20),
      cursor: z.string().optional(),
    });
    const q = querySchema.parse(req.query);

    const rows = await query<RecordRow>(
      `
        SELECT *
        FROM records
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [user.id, q.cursor ?? null, q.limit],
    );

    const nextCursor = rows.rows.length > 0 ? rows.rows[rows.rows.length - 1].created_at : null;
    return {
      items: rows.rows,
      nextCursor,
    };
  });
}

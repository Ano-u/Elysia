import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { imageQueue } from "../lib/queue.js";
import { env } from "../config/env.js";
import { checkR2ObjectExists, createR2UploadUrl } from "../lib/r2.js";

const uploadSignSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive().max(5 * 1024 * 1024),
  mediaType: z.enum(["image", "other"]).default("image"),
});

const completeSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive().max(5 * 1024 * 1024),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  mediaType: z.enum(["image", "drawing_snapshot", "other"]).default("image"),
});

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post("/media/upload-sign", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = uploadSignSchema.parse(req.body);

    const key = `users/${user.id}/${Date.now()}-${body.fileName.replace(/[^\w.-]/g, "_")}`;
    const signedUrl = await createR2UploadUrl({
      key,
      mimeType: body.mimeType,
      expiresInSeconds: 60 * 10,
    });

    return {
      upload: {
        method: "PUT",
        url: signedUrl,
        headers: {
          "Content-Type": body.mimeType,
        },
      },
      storageKey: key,
    };
  });

  app.post("/media/complete", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = completeSchema.parse(req.body);
    if (!body.storageKey.startsWith(`users/${user.id}/`)) {
      reply.code(400).send({ message: "无效的存储键" });
      return;
    }

    if (env.R2_STRICT_HEAD_CHECK) {
      const objectExists = await checkR2ObjectExists(body.storageKey);
      if (!objectExists) {
        reply.code(400).send({ message: "上传未完成或文件不存在" });
        return;
      }
    }

    if (body.mediaType === "image") {
      const count = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM media_assets
          WHERE owner_user_id = $1
            AND media_type = 'image'
        `,
        [user.id],
      );
      if (Number(count.rows[0]?.total ?? "0") >= 60) {
        reply.code(400).send({ message: "每用户最多可保存 60 张图片" });
        return;
      }
    }

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO media_assets (
          owner_user_id,
          media_type,
          storage_key,
          mime_type,
          size_bytes,
          width,
          height,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded')
        RETURNING id
      `,
      [
        user.id,
        body.mediaType,
        body.storageKey,
        body.mimeType,
        body.sizeBytes,
        body.width ?? null,
        body.height ?? null,
      ],
    );

    const mediaId = inserted.rows[0].id;

    if (body.mediaType === "image") {
      await imageQueue.add("process-image", {
        mediaId,
        ownerUserId: user.id,
        storageKey: body.storageKey,
      });
      await query("UPDATE media_assets SET status = 'processing', updated_at = NOW() WHERE id = $1", [mediaId]);
    }

    return { mediaId };
  });

  app.get("/media/:id/variants", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const media = await query<{
      id: string;
      owner_user_id: string;
      status: string;
      content_moderation_status: string;
      manual_review_required: boolean;
      content_review_notes: string | null;
    }>(
      `
        SELECT id, owner_user_id, status, content_moderation_status, manual_review_required, content_review_notes
        FROM media_assets
        WHERE id = $1
      `,
      [params.id],
    );
    if (media.rowCount !== 1) {
      reply.code(404).send({ message: "媒体不存在" });
      return;
    }
    const target = media.rows[0];
    if (target.owner_user_id !== user.id && user.role !== "admin") {
      reply.code(403).send({ message: "无权限访问该媒体" });
      return;
    }

    const variants = await query<{
      variant_type: string;
      storage_key: string;
      width: number | null;
      height: number | null;
    }>(
      `
        SELECT variant_type, storage_key, width, height
        FROM media_variants
        WHERE media_id = $1
      `,
      [params.id],
    );

    return {
      media: target,
      moderation: {
        status: target.content_moderation_status,
        manualReviewRequired: target.manual_review_required,
        reviewNotes: target.content_review_notes,
      },
      variants: variants.rows.map((v) => ({
        type: v.variant_type,
        url: `${env.R2_PUBLIC_BASE_URL}/${v.storage_key}`,
        width: v.width,
        height: v.height,
      })),
    };
  });

  app.post("/drawings", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        vectorJson: z.record(z.string(), z.unknown()),
        recordId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO drawing_docs (owner_user_id, record_id, vector_json)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id
      `,
      [user.id, body.recordId ?? null, JSON.stringify(body.vectorJson)],
    );

    return { drawingId: inserted.rows[0].id };
  });
}

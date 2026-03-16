import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { exportQueue } from "../lib/queue.js";
import { env } from "../config/env.js";
import { createR2DownloadUrl } from "../lib/r2.js";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/config", async () => {
    return {
      turnstileSiteKey: env.CLOUDFLARE_TURNSTILE_SITE_KEY ?? null,
    };
  });

  app.get("/healthz", async () => {
    return { ok: true, at: new Date().toISOString() };
  });

  app.get("/notifications", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const rows = await query<{
      id: string;
      category: string;
      title: string;
      body: string;
      is_read: boolean;
      created_at: string;
    }>(
      `
        SELECT id, category, title, body, is_read, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [user.id],
    );
    return { items: rows.rows };
  });

  app.post("/notifications/read", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(req.body);
    await query(
      `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1
          AND id = ANY($2::uuid[])
      `,
      [user.id, body.ids],
    );
    return { ok: true };
  });

  app.post("/exports", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z.object({ format: z.enum(["json", "pdf"]).default("json") }).parse(req.body);
    const inserted = await query<{ id: string }>(
      `
        INSERT INTO exports (user_id, format, status)
        VALUES ($1, $2, 'queued')
        RETURNING id
      `,
      [user.id, body.format],
    );

    await query(
      `
        INSERT INTO notifications (user_id, category, title, body)
        VALUES ($1, 'export', '导出任务已创建', '系统正在准备你的数据导出文件。')
      `,
      [user.id],
    );

    await exportQueue.add("build-export", {
      userId: user.id,
      format: body.format,
      exportId: inserted.rows[0].id,
    });
    return { ok: true, taskId: inserted.rows[0].id };
  });

  app.get("/exports/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const target = await query<{
      id: string;
      format: "json" | "pdf";
      status: "queued" | "processing" | "done" | "failed";
      download_key: string | null;
      updated_at: string;
    }>(
      `
        SELECT id, format, status, download_key, updated_at
        FROM exports
        WHERE id = $1 AND user_id = $2
      `,
      [params.id, user.id],
    );
    if (target.rowCount !== 1) {
      reply.code(404).send({ message: "导出任务不存在" });
      return;
    }
    const task = target.rows[0];
    const downloadUrl =
      task.status === "done" && task.download_key
        ? await createR2DownloadUrl({ key: task.download_key, expiresInSeconds: 60 * 10 })
        : null;
    return {
      task,
      downloadUrl,
    };
  });
}

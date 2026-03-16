import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { query } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "../lib/r2.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const connection = { url: env.REDIS_URL };

function createWorker(name: string, handler: (job: { data: any }) => Promise<void>): Worker {
  const worker = new Worker(
    name,
    async (job) => {
      await handler(job);
    },
    { connection },
  );
  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker:${name}] 完成任务 ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${name}] 任务失败 ${job?.id}:`, error);
  });
  return worker;
}

function safePdfText(input: string): string {
  return input.replace(/[^\x20-\x7E]/g, "?");
}

createWorker("image-process", async (job) => {
  const mediaId = job.data.mediaId as string;
  // 这里先做占位逻辑：生成变体记录。后续可接入 sharp / cloudflare image pipeline。
  await query(
    `
      INSERT INTO media_variants (media_id, variant_type, storage_key, width, height)
      VALUES
        ($1, 'thumb', CONCAT('variants/', $1::text, '/thumb.webp'), 320, 320),
        ($1, 'card', CONCAT('variants/', $1::text, '/card.webp'), 720, 720),
        ($1, 'detail', CONCAT('variants/', $1::text, '/detail.webp'), 1280, 1280),
        ($1, 'blurhash', CONCAT('variants/', $1::text, '/blurhash.txt'), NULL, NULL)
      ON CONFLICT DO NOTHING
    `,
    [mediaId],
  );
  await query("UPDATE media_assets SET status = 'ready', updated_at = NOW() WHERE id = $1", [mediaId]);
});

createWorker("embedding-process", async (job) => {
  const { recordId } = job.data as { recordId: string };
  // 预留：向量计算后更新 link 关系
  await query(
    `
      INSERT INTO alert_events (alert_type, level, metric_name, metric_value, payload)
      VALUES ('spike', 'info', 'embedding_job_processed', 1, $1::jsonb)
    `,
    [JSON.stringify({ recordId })],
  );
});

createWorker("weekly-insight", async (job) => {
  const { userId } = job.data as { userId: string };
  await query(
    `
      INSERT INTO insight_snapshots (user_id, snapshot_type, payload)
      VALUES ($1, 'weekly', $2::jsonb)
    `,
    [userId, JSON.stringify({ message: "本周回顾已生成" })],
  );
});

createWorker("export-process", async (job) => {
  const { userId, format, exportId } = job.data as {
    userId: string;
    format: "json" | "pdf";
    exportId: string;
  };

  try {
    await query(
      `
        UPDATE exports
        SET status = 'processing', updated_at = NOW()
        WHERE id = $1
      `,
      [exportId],
    );

    const records = await query<{
      id: string;
      mood_phrase: string;
      description: string | null;
      is_public: boolean;
      created_at: string;
    }>(
      `
        SELECT id, mood_phrase, description, is_public, created_at
        FROM records
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId],
    );

    let contentType = "application/json";
    let payload: Uint8Array;
    const fileKey = `exports/${userId}/${exportId}.${format}`;

    if (format === "json") {
      const text = JSON.stringify(
        {
          userId,
          exportedAt: new Date().toISOString(),
          records: records.rows,
        },
        null,
        2,
      );
      payload = new TextEncoder().encode(text);
      contentType = "application/json";
    } else {
      const lines = [
        safePdfText("Elysia Export Report"),
        safePdfText(`User: ${userId}`),
        safePdfText(`Time: ${new Date().toISOString()}`),
        "",
        ...records.rows.slice(0, 500).map((r, index) => {
          const desc = r.description ? ` | ${r.description}` : "";
          return safePdfText(`${index + 1}. [${r.created_at}] ${r.mood_phrase}${desc}`);
        }),
      ];
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([595, 842]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      let y = 810;
      for (const line of lines) {
        page.drawText(line.slice(0, 120), {
          x: 40,
          y,
          size: 10,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 14;
        if (y < 40) {
          y = 810;
          page = pdfDoc.addPage([595, 842]);
        }
      }
      payload = await pdfDoc.save();
      contentType = "application/pdf";
    }

    await r2Client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: fileKey,
        Body: payload,
        ContentType: contentType,
      }),
    );

    await query(
      `
        UPDATE exports
        SET status = 'done', download_key = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [exportId, fileKey],
    );
    await query(
      `
        INSERT INTO notifications (user_id, category, title, body)
        VALUES ($1, 'export', '导出完成', $2)
      `,
      [userId, `你的 ${format.toUpperCase()} 导出文件已生成。`],
    );
  } catch (error) {
    await query(
      `
        UPDATE exports
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `,
      [exportId],
    );
    await query(
      `
        INSERT INTO notifications (user_id, category, title, body)
        VALUES ($1, 'export', '导出失败', '导出任务执行失败，请稍后重试。')
      `,
      [userId],
    );
    throw error;
  }
});

// eslint-disable-next-line no-console
console.log("Elysia Worker 已启动");

let analyticsCursor = "0-0";

async function flushAnalyticsBatch(): Promise<void> {
  const stream = (await redis.xread(
    "COUNT",
    200,
    "BLOCK",
    100,
    "STREAMS",
    "analytics:events",
    analyticsCursor,
  )) as Array<[string, Array<[string, string[]]>]> | null;
  if (!stream || stream.length === 0) {
    return;
  }

  const entries = stream[0][1];
  if (!entries || entries.length === 0) {
    return;
  }

  analyticsCursor = entries[entries.length - 1][0];

  const eventRows: Array<{
    userId: string | null;
    ipHash: string;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs: number;
    userAgent: string;
    at: Date;
  }> = [];

  const endpointAgg = new Map<string, { requests: number; errors: number; latencies: number[] }>();
  const userAgg = new Map<string, { userId: string | null; ipHash: string; requestCount: number }>();

  for (const [, kv] of entries) {
    const map: Record<string, string> = {};
    for (let i = 0; i < kv.length; i += 2) {
      map[kv[i]] = kv[i + 1];
    }

    const userId = map.userId ? map.userId : null;
    const ipHash = map.ipHash;
    const endpoint = map.endpoint;
    const method = map.method;
    const statusCode = Number(map.statusCode || "0");
    const latencyMs = Number(map.latencyMs || "0");
    const userAgent = map.userAgent || "";
    const at = new Date(Number(map.at || Date.now()));

    eventRows.push({ userId, ipHash, endpoint, method, statusCode, latencyMs, userAgent, at });

    const minute = new Date(at);
    minute.setSeconds(0, 0);
    const minuteKey = `${minute.toISOString()}|${endpoint}`;
    const e = endpointAgg.get(minuteKey) ?? { requests: 0, errors: 0, latencies: [] };
    e.requests += 1;
    if (statusCode >= 400) {
      e.errors += 1;
    }
    e.latencies.push(latencyMs);
    endpointAgg.set(minuteKey, e);

    const userMinuteKey = `${minute.toISOString()}|${userId ?? ""}|${ipHash}`;
    const u = userAgg.get(userMinuteKey) ?? { userId, ipHash, requestCount: 0 };
    u.requestCount += 1;
    userAgg.set(userMinuteKey, u);
  }

  if (eventRows.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const row of eventRows) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(row.userId, row.ipHash, row.endpoint, row.method, row.statusCode, row.latencyMs, row.userAgent, row.at);
    }
    await query(
      `
        INSERT INTO access_events (user_id, ip_hash, endpoint, method, status_code, latency_ms, user_agent, created_at)
        VALUES ${values.join(",")}
      `,
      params,
    );
  }

  for (const [key, agg] of endpointAgg.entries()) {
    const [minuteAt, endpoint] = key.split("|");
    const sorted = agg.latencies.sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
    const p95 = sorted[p95Index] ?? 0;

    await query(
      `
        INSERT INTO endpoint_minute_stats (minute_at, endpoint, requests, errors, p95_latency_ms)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (minute_at, endpoint)
        DO UPDATE SET
          requests = endpoint_minute_stats.requests + EXCLUDED.requests,
          errors = endpoint_minute_stats.errors + EXCLUDED.errors,
          p95_latency_ms = GREATEST(endpoint_minute_stats.p95_latency_ms, EXCLUDED.p95_latency_ms)
      `,
      [minuteAt, endpoint, agg.requests, agg.errors, p95],
    );
  }

  for (const [key, agg] of userAgg.entries()) {
    const [minuteAt] = key.split("|");
    await query(
      `
        INSERT INTO user_frequency_stats (minute_at, user_id, ip_hash, request_count)
        VALUES ($1, $2, $3, $4)
      `,
      [minuteAt, agg.userId, agg.ipHash, agg.requestCount],
    );
  }
}

async function retentionCleanup(): Promise<void> {
  await query(`DELETE FROM access_events WHERE created_at < NOW() - INTERVAL '7 days'`);
  await query(`DELETE FROM endpoint_minute_stats WHERE minute_at < NOW() - INTERVAL '6 months'`);
  await query(`DELETE FROM user_frequency_stats WHERE minute_at < NOW() - INTERVAL '6 months'`);
}

setInterval(() => {
  void flushAnalyticsBatch().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("flush analytics failed", error);
  });
}, 1000);

setInterval(() => {
  void retentionCleanup().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("retention cleanup failed", error);
  });
}, 60 * 60 * 1000);

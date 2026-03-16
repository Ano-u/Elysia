import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ai/templates", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    return {
      constraints: {
        noAutoGeneration: true,
        quoteLimit: {
          zhChars: 20,
          enWords: 30,
        },
      },
      templates: {
        tags: ["当下情绪", "触发因素", "期待与愿望", "身体感受", "行动计划"],
        weeklySummary: [
          "本周出现最多的情绪是什么？",
          "哪件事最影响了你的状态？",
          "下周你想保持或改变什么？",
        ],
      },
    };
  });

  app.post("/ai/tag-suggestions/save", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        recordId: z.string().uuid().optional(),
        tags: z.array(z.string().min(1).max(32)).max(20),
        modelMeta: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);

    await query(
      `
        INSERT INTO ai_assist_records (user_id, assist_type, payload)
        VALUES ($1, 'tag_suggestion', $2::jsonb)
      `,
      [user.id, JSON.stringify(body)],
    );
    return { ok: true };
  });

  app.post("/ai/weekly-report/save", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        weekStart: z.string().datetime(),
        weekEnd: z.string().datetime(),
        summary: z.string().min(1).max(4000),
        highlights: z.array(z.string().min(1).max(200)).max(20).optional(),
        modelMeta: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);

    await query(
      `
        INSERT INTO ai_assist_records (user_id, assist_type, payload)
        VALUES ($1, 'weekly_report', $2::jsonb)
      `,
      [user.id, JSON.stringify(body)],
    );
    return { ok: true };
  });
}

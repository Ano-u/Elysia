import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";

const defaultNudges = [
  "写一句就好，哪怕只是“今天有点乱”。",
  "你不需要写得完美，只要写得真实。",
  "如果现在说不清，就先记一个词。",
  "愿你此刻的心情，被温柔看见。",
];

export async function nudgeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/onboarding/progress", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    await query(
      `
        INSERT INTO onboarding_progress (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id],
    );

    const row = await query<{
      current_day: number;
      completed_days: number[];
      last_completed_at: string | null;
      metadata: unknown;
    }>(
      `
        SELECT current_day, completed_days, last_completed_at, metadata
        FROM onboarding_progress
        WHERE user_id = $1
      `,
      [user.id],
    );

    const tasks = [
      { day: 1, title: "一句话发布", code: "first_post" },
      { day: 2, title: "补一项（金句/附加情绪）", code: "add_one_detail" },
      { day: 3, title: "建立一条关联", code: "create_one_link" },
      { day: 4, title: "添加图片或手写", code: "add_media_or_drawing" },
      { day: 5, title: "浏览主题并互动", code: "universe_interaction" },
      { day: 6, title: "确认本周关键词", code: "confirm_week_keyword" },
      { day: 7, title: "完成里程碑回顾", code: "milestone_review" },
    ];

    return {
      progress: row.rows[0],
      tasks,
      targetTimeSeconds: 60,
    };
  });

  app.post("/onboarding/complete-day", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        day: z.coerce.number().int().min(1).max(7),
        evidence: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);

    await query(
      `
        INSERT INTO onboarding_progress (user_id, current_day, completed_days, last_completed_at, metadata)
        VALUES ($1, LEAST($2 + 1, 7), ARRAY[$2]::smallint[], NOW(), $3::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET
          completed_days = (
            SELECT ARRAY(
              SELECT DISTINCT unnest(onboarding_progress.completed_days || ARRAY[$2]::smallint[])
              ORDER BY 1
            )
          ),
          current_day = LEAST(GREATEST(onboarding_progress.current_day, $2 + 1), 7),
          last_completed_at = NOW(),
          metadata = onboarding_progress.metadata || $3::jsonb,
          updated_at = NOW()
      `,
      [user.id, body.day, JSON.stringify(body.evidence ?? {})],
    );

    if (body.day === 7) {
      await query(
        `
          INSERT INTO notifications (user_id, category, title, body)
          VALUES ($1, 'milestone', '7天里程碑达成', '你已解锁新的主题微动效与深度入口。')
        `,
        [user.id],
      );
      await query(
        `
          UPDATE onboarding_progress
          SET metadata = metadata || '{"rewardUnlocked": true}'::jsonb, updated_at = NOW()
          WHERE user_id = $1
        `,
        [user.id],
      );
    }

    return { ok: true };
  });

  app.get("/nudges/recommendations", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const pref = await query<{ nudge_enabled: boolean; nudge_daily_limit: number }>(
      `
        SELECT nudge_enabled, nudge_daily_limit
        FROM user_preferences
        WHERE user_id = $1
      `,
      [user.id],
    );
    const current = pref.rows[0] ?? { nudge_enabled: true, nudge_daily_limit: 2 };

    const seenToday = await query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM nudge_events
        WHERE user_id = $1
          AND action = 'shown'
          AND created_at >= DATE_TRUNC('day', NOW())
      `,
      [user.id],
    );

    const shownCount = Number(seenToday.rows[0]?.count ?? "0");
    if (!current.nudge_enabled || shownCount >= current.nudge_daily_limit) {
      return { items: [] };
    }

    const sample = defaultNudges.slice(0, 2);
    await query(
      `
        INSERT INTO nudge_events (user_id, action, context)
        VALUES ($1, 'shown', $2::jsonb)
      `,
      [user.id, JSON.stringify({ sample })],
    );

    return { items: sample };
  });

  app.patch("/nudges/settings", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        enabled: z.boolean().optional(),
        dailyLimit: z.coerce.number().int().min(0).max(10).optional(),
        personalizationEnabled: z.boolean().optional(),
      })
      .parse(req.body);

    await query(
      `
        INSERT INTO user_preferences (user_id, nudge_enabled, nudge_daily_limit, personalization_enabled)
        VALUES ($1, COALESCE($2, TRUE), COALESCE($3, 2), COALESCE($4, TRUE))
        ON CONFLICT (user_id)
        DO UPDATE SET
          nudge_enabled = COALESCE($2, user_preferences.nudge_enabled),
          nudge_daily_limit = COALESCE($3, user_preferences.nudge_daily_limit),
          personalization_enabled = COALESCE($4, user_preferences.personalization_enabled),
          updated_at = NOW()
      `,
      [user.id, body.enabled ?? null, body.dailyLimit ?? null, body.personalizationEnabled ?? null],
    );

    return { ok: true };
  });

  app.post("/nudges/feedback", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        action: z.enum(["liked", "dismissed", "clicked", "manual_trigger"]),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);

    await query(
      `
        INSERT INTO nudge_events (user_id, action, context)
        VALUES ($1, $2, $3::jsonb)
      `,
      [user.id, body.action, JSON.stringify(body.context ?? {})],
    );
    return { ok: true };
  });
}

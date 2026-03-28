import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import {
  buildGuideContent,
  buildGuideDisplayState,
  guideSteps,
  guideVersion,
  normalizeGuideState,
  shouldForceOnboardingGuideForTesting,
} from "../lib/onboarding-guide.js";

const onboardingTasks = [
  {
    day: 1,
    title: "写下一句心情",
    code: "first_post",
    description: "先留下今天最想说的一句，让这里开始记住你的节奏。",
    ctaText: "现在去写",
    ctaTarget: "home.composer",
    rewardText: "完成第一步后，你会更快看懂后面的提示。",
  },
  {
    day: 2,
    title: "补上一点细节",
    code: "add_one_detail",
    description: "可以补一句金句、一个附加情绪，或一小段说明，让记录更贴近当时的你。",
    ctaText: "补一点细节",
    ctaTarget: "home.record-detail",
    rewardText: "细节越清楚，之后回看时越容易找回那一刻。",
  },
  {
    day: 3,
    title: "建立一条关联",
    code: "create_one_link",
    description: "把两条有关联的记录轻轻连起来，看看心情是怎样流动的。",
    ctaText: "去连一条线",
    ctaTarget: "mindmap.link-suggestion",
    rewardText: "你会更快看见情绪与记忆之间的脉络。",
  },
  {
    day: 4,
    title: "留下一张图或一笔手写",
    code: "add_media_or_drawing",
    description: "有些时刻不一定适合长句子，图片和手写也能替你留下它。",
    ctaText: "加一点画面",
    ctaTarget: "home.media",
    rewardText: "往后的回忆会因为这一点画面更清晰。",
  },
  {
    day: 5,
    title: "去星海里看看共鸣",
    code: "universe_interaction",
    description: "如果你愿意，也可以去看看别人的公开片段，感受那些温柔的回应。",
    ctaText: "去看看星海",
    ctaTarget: "universe.explore",
    rewardText: "这一站会让你更明白这里为什么叫做共鸣。",
  },
  {
    day: 6,
    title: "确认本周关键词",
    code: "confirm_week_keyword",
    description: "给这段时间的自己找一个词，轻轻地把它收束起来。",
    ctaText: "选一个词",
    ctaTarget: "home.weekly-summary",
    rewardText: "这个词会成为你回望这一周时最清楚的线索。",
  },
  {
    day: 7,
    title: "完成一次里程碑回顾",
    code: "milestone_review",
    description: "走到这里时，不妨回头看看：你已经比刚来的时候更熟悉自己了。",
    ctaText: "开始回顾",
    ctaTarget: "mindmap.deep-entry",
    rewardText: "完成后会解锁更完整的织网入口与主题微动效。",
  },
] as const;

const sceneNudges = {
  home_idle: [
    {
      id: "home_idle_1",
      text: "慢慢来，先写下一句也很好。若还没想清楚，就把最先浮出来的那个词留下吧。",
      actionLabel: "我来试试",
      actionTarget: "home.composer",
    },
    {
      id: "home_idle_2",
      text: "如果今天有一点乱，也没关系。先让这一刻有个落点，后面的内容可以慢慢补。",
      actionLabel: "先写一句",
      actionTarget: "home.composer",
    },
  ],
  first_publish_error: [
    {
      id: "first_publish_error_1",
      text: "这次没有顺利送出去，但刚刚那份心意没有白费。稍微整理一下，我们再试一次就好。",
      actionLabel: "再试一次",
      actionTarget: "home.retry-publish",
    },
  ],
  first_publish_success: [
    {
      id: "first_publish_success_1",
      text: "已经稳稳收好了。若你愿意，下一步可以补一点细节，让这条记录更像当时的你。",
      actionLabel: "补一点细节",
      actionTarget: "home.record-detail",
    },
  ],
  guide_complete: [
    {
      id: "guide_complete_1",
      text: "你已经知道该从哪里开始了。接下来，只要按自己的节奏继续就好。",
      actionLabel: "回到首页",
      actionTarget: "home.top",
    },
  ],
  mindmap_locked: [
    {
      id: "mindmap_locked_1",
      text: "记忆织网会在你逐渐留下更多片段后慢慢展开。先完成这几天的小任务，它就会更清楚地回应你。",
      actionLabel: "查看进度",
      actionTarget: "home.onboarding-progress",
    },
  ],
} as const;

const fallbackScene: NudgeScene = "home_idle";

const nudgeFeedbackSchema = z.object({
  action: z.enum(["liked", "dismissed", "clicked", "manual_trigger"]),
  context: z.record(z.string(), z.unknown()).optional(),
});

const nudgeRecommendationQuerySchema = z.object({
  scene: z.enum(["home_idle", "first_publish_error", "first_publish_success", "guide_complete", "mindmap_locked"]).optional(),
});

type NudgeScene = keyof typeof sceneNudges;

function buildRestartSuggestion(currentDay: number, lastCompletedAt: string | null) {
  if (!lastCompletedAt) {
    return {
      shouldShow: false,
      headline: null,
      body: null,
    };
  }

  const lastCompletedAtMs = Date.parse(lastCompletedAt);
  if (Number.isNaN(lastCompletedAtMs)) {
    return {
      shouldShow: false,
      headline: null,
      body: null,
    };
  }

  const daysSinceLastCompletion = Math.floor((Date.now() - lastCompletedAtMs) / (1000 * 60 * 60 * 24));
  if (daysSinceLastCompletion < 2) {
    return {
      shouldShow: false,
      headline: null,
      body: null,
    };
  }

  return {
    shouldShow: true,
    headline: "要不要轻轻把节奏接回来？",
    body:
      currentDay <= 1
        ? "哪怕只是重新写下一句，也算重新开始了。这里不会催你，我们按现在的步子慢慢来。"
        : "前面的脚步还在，不会因为停了一会儿就消失。今天只接回下一小步，就已经很好。",
  };
}

function buildEntryContext(accessStatus: "not_submitted" | "pending" | "approved" | "rejected") {
  if (accessStatus === "approved") {
    return {
      needsAccessApplication: false,
      accessStatus,
      estimatedReviewText: null,
      applicationHint: null,
    };
  }

  if (accessStatus === "pending") {
    return {
      needsAccessApplication: true,
      accessStatus,
      estimatedReviewText: "通常会在 1-3 天内完成审核，请先耐心等一等。",
      applicationHint: "你的申请已经在路上了。审核通过后，就能继续公开发布与互动。",
    };
  }

  if (accessStatus === "rejected") {
    return {
      needsAccessApplication: true,
      accessStatus,
      estimatedReviewText: "重新提交后，通常会在 1-3 天内完成复核。",
      applicationHint: "如果你愿意，可以根据审核备注重新整理一版申请说明。",
    };
  }

  return {
    needsAccessApplication: true,
    accessStatus,
    estimatedReviewText: "通常会在 1-3 天内完成审核。",
    applicationHint: "先写下第一段话吧，它将代表你进入往世乐土。",
  };
}

export async function nudgeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/onboarding/progress", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const parsedQuery = z
      .object({
        entryId: z.string().trim().min(1).max(128).optional(),
      })
      .parse(req.query);

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

    const progress = row.rows[0] ?? {
      current_day: 1,
      completed_days: [] as number[],
      last_completed_at: null,
      metadata: {},
    };
    let guideState = normalizeGuideState(progress.metadata);
    const contentStats = await query<{ sent_count: string }>(
      `
        SELECT COUNT(*)::text AS sent_count
        FROM records
        WHERE user_id = $1
      `,
      [user.id],
    );
    const sentContentCount = Number(contentStats.rows[0]?.sent_count ?? "0");
    const hasSentAnyContent = sentContentCount > 0;
    const entryId = parsedQuery.entryId?.trim() || null;
    const shouldCountThisEntry =
      !hasSentAnyContent
      && (entryId ? guideState.lastEntryId !== entryId : true);

    if (shouldCountThisEntry) {
      const nowIso = new Date().toISOString();
      const nextGuidePatch = {
        entryCount: guideState.entryCount + 1,
        lastPresentedAt: nowIso,
        lastEntryId: entryId,
        version: guideVersion,
      };

      await query(
        `
          UPDATE onboarding_progress
          SET
            metadata = jsonb_set(
              metadata,
              '{guide}',
              COALESCE(metadata->'guide', '{}'::jsonb) || $2::jsonb,
              true
            ),
            updated_at = NOW()
          WHERE user_id = $1
        `,
        [user.id, JSON.stringify(nextGuidePatch)],
      );

      guideState = {
        ...guideState,
        ...nextGuidePatch,
      };
    }

    const rawMetadata =
      progress.metadata && typeof progress.metadata === "object"
        ? (progress.metadata as Record<string, unknown>)
        : {};
    const rawGuide =
      rawMetadata.guide && typeof rawMetadata.guide === "object"
        ? (rawMetadata.guide as Record<string, unknown>)
        : {};
    const display = buildGuideDisplayState({
      hasSentAnyContent,
      entryCount: guideState.entryCount,
      localDebugForceShow: shouldForceOnboardingGuideForTesting(),
    });
    const guide = buildGuideContent({
      state: guideState,
      display,
      hasSentAnyContent,
      sentContentCount,
    });

    return {
      progress: {
        ...progress,
        metadata: {
          ...rawMetadata,
          guide: {
            ...rawGuide,
            ...guideState,
          },
        },
      },
      guide,
      tasks: onboardingTasks,
      targetTimeSeconds: 60,
      entryContext: buildEntryContext(user.accessStatus),
      restartSuggestion: buildRestartSuggestion(progress.current_day, progress.last_completed_at),
      contentState: {
        hasSentAnyContent,
        sentContentCount,
      },
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

    const currentState = await query<{
      current_day: number;
      completed_days: number[];
    }>(
      `
        SELECT current_day, completed_days
        FROM onboarding_progress
        WHERE user_id = $1
      `,
      [user.id],
    );

    const existingState = currentState.rows[0] ?? { current_day: 1, completed_days: [] };
    const completedDays = Array.isArray(existingState.completed_days) ? existingState.completed_days : [];

    if (completedDays.includes(body.day)) {
      return { ok: true };
    }

    const expectedDay = existingState.current_day;

    if (body.day !== expectedDay) {
      reply.code(409).send({
        message: `当前只能完成第 ${expectedDay} 天任务。`,
        code: "ONBOARDING_DAY_OUT_OF_ORDER",
        expectedDay,
      });
      return;
    }

    const nextCompletedDays = Array.from(new Set([...completedDays, body.day])).sort((left, right) => left - right);
    const maxOnboardingDay = onboardingTasks.length;
    const nextCurrentDay = Math.min(body.day + 1, maxOnboardingDay);
    const rewardAlreadyUnlocked = completedDays.includes(maxOnboardingDay);

    await query(
      `
        INSERT INTO onboarding_progress (user_id, current_day, completed_days, last_completed_at, metadata)
        VALUES ($1, $2, $3::smallint[], NOW(), $4::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET
          completed_days = $3::smallint[],
          current_day = $2,
          last_completed_at = NOW(),
          metadata = onboarding_progress.metadata || $4::jsonb,
          updated_at = NOW()
      `,
      [user.id, nextCurrentDay, nextCompletedDays, JSON.stringify(body.evidence ?? {})],
    );

    if (body.day === maxOnboardingDay && !rewardAlreadyUnlocked) {
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

  app.patch("/onboarding/guide-state", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const body = z
      .object({
        completedAt: z.string().datetime().nullable().optional(),
        skippedAt: z.string().datetime().nullable().optional(),
        lastSeenStep: z.coerce.number().int().min(0).max(guideSteps.length - 1).optional(),
        version: z.string().trim().min(1).max(64).optional(),
      })
      .refine(
        (value) =>
          value.completedAt !== undefined
          || value.skippedAt !== undefined
          || value.lastSeenStep !== undefined
          || value.version !== undefined,
        { message: "至少需要更新一个导览状态字段。" },
      )
      .parse(req.body);

    if (body.skippedAt) {
      const current = await query<{ metadata: unknown }>(
        `
          SELECT metadata
          FROM onboarding_progress
          WHERE user_id = $1
        `,
        [user.id],
      );
      const sentContent = await query<{ sent_count: string }>(
        `
          SELECT COUNT(*)::text AS sent_count
          FROM records
          WHERE user_id = $1
        `,
        [user.id],
      );
      const currentGuideState = normalizeGuideState(current.rows[0]?.metadata ?? {});
      const display = buildGuideDisplayState({
        hasSentAnyContent: Number(sentContent.rows[0]?.sent_count ?? "0") > 0,
        entryCount: currentGuideState.entryCount,
        localDebugForceShow: shouldForceOnboardingGuideForTesting(),
      });

      if (display.forceBlocking) {
        reply.code(409).send({
          message: "首次进入且尚未发送任何内容时，当前引导不能跳过。",
          code: "ONBOARDING_SKIP_DISABLED",
        });
        return;
      }
    }

    const patch: Record<string, unknown> = {};
    if (body.completedAt !== undefined) {
      patch.completedAt = body.completedAt;
    }
    if (body.skippedAt !== undefined) {
      patch.skippedAt = body.skippedAt;
    }
    if (body.lastSeenStep !== undefined) {
      patch.lastSeenStep = body.lastSeenStep;
    }
    if (body.version !== undefined) {
      patch.version = body.version;
    } else {
      patch.version = guideVersion;
    }

    await query(
      `
        INSERT INTO onboarding_progress (user_id, metadata)
        VALUES ($1, jsonb_build_object('guide', $2::jsonb))
        ON CONFLICT (user_id)
        DO UPDATE SET
          metadata = jsonb_set(
            onboarding_progress.metadata,
            '{guide}',
            COALESCE(onboarding_progress.metadata->'guide', '{}'::jsonb) || $2::jsonb,
            true
          ),
          updated_at = NOW()
      `,
      [user.id, JSON.stringify(patch)],
    );

    const updated = await query<{ metadata: unknown }>(
      `
        SELECT metadata
        FROM onboarding_progress
        WHERE user_id = $1
      `,
      [user.id],
    );

    return {
      ok: true,
      state: normalizeGuideState(updated.rows[0]?.metadata ?? {}),
    };
  });

  app.get("/nudges/recommendations", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const parsedQuery = nudgeRecommendationQuerySchema.parse(req.query);
    const scene = parsedQuery.scene ?? fallbackScene;
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
      return { items: [], scene };
    }

    const sample = sceneNudges[scene];
    await query(
      `
        INSERT INTO nudge_events (user_id, action, context)
        VALUES ($1, 'shown', $2::jsonb)
      `,
      [user.id, JSON.stringify({ scene, sampleIds: sample.map((item) => item.id) })],
    );

    return {
      scene,
      items: sample,
    };
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
    const body = nudgeFeedbackSchema.parse(req.body);

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

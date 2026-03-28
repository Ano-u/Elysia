import type { PoolClient } from "pg";

export const guideVersion = "home-guide-v3";

export const guideSteps = [
  {
    id: "compose-welcome-card",
    title: "先跟着爱莉完成一张欢迎卡片",
    description:
      "这次会一步一步带你选心情、填标题、写誓言，再展开描述。只要照着系统给出的内容完成，就已经很好了。",
    target: "home.composer",
    ctaText: "开始填写",
  },
  {
    id: "home-feed-tour",
    title: "再认识一下主界面里的往世乐土",
    description:
      "主界面下方会保留你的记录入口，也能从卡片上重新编辑、查看状态，比如“已发送到星海”或“仅自己可见”。",
    target: "home.feed",
    ctaText: "继续看看",
  },
  {
    id: "universe-tour",
    title: "然后去星海里试试互动",
    description:
      "从左上角按钮前往星海后，你可以点开卡片、把心心拖到卡片上，还能拖动画布和放缩看看更远的地方。",
    target: "nav.universe",
    ctaText: "去星海",
  },
  {
    id: "guide-finish",
    title: "这样就差不多啦",
    description:
      "只要还没有真正发送过内容，每次进入都会再轻轻提醒你一次。等第一张卡片发出去后，这个入口引导就会自然收起来。",
    target: "guide.finish",
    ctaText: "我知道啦",
  },
] as const;

const welcomeDescriptionPool = [
  "嗨，既然你来了，就把第一缕心情放心交给我吧，往后的回声，我会陪你一起听。",
  "欢迎来到这里呀，先写下一点点光亮就好，剩下的故事，我们可以慢慢说。",
  "初次见面，请把这一刻交给我保管吧，说不定它会在星海里闪成很温柔的样子呢。",
  "能在这里遇见你真好呀，把这句欢迎留在卡片上，我们就算认真打过招呼啦。",
] as const;

const moodExerciseSequence = [
  {
    id: "pick-one-mood",
    instruction: "先任选一个已有的心情。",
    requiredSelectedCount: 1,
    allowCancel: false,
  },
  {
    id: "clear-mood",
    instruction: "再取消刚刚的选择，感受一下它是可以撤回的。",
    requiredSelectedCount: 0,
    allowCancel: true,
  },
  {
    id: "pick-two-moods",
    instruction: "最后从已有心情里选满两个，完成这一步。",
    requiredSelectedCount: 2,
    allowCancel: true,
  },
] as const;

const featureTour = [
  {
    id: "home-bottom-elysian-realm",
    title: "主界面下方的往世乐土",
    description: "这里会留着你的记录与脉络入口，方便你继续回看和延展。",
    target: "home.bottom.elysian-realm",
    interaction: "observe",
  },
  {
    id: "home-card-edit-status",
    title: "重新编辑与消息状态",
    description: "卡片上要能重新编辑，也要能看见状态，比如“已发送到星海”“待审核”“仅自己可见”。",
    target: "home.card.status",
    interaction: "tap",
  },
  {
    id: "nav-universe-entry",
    title: "从左上角前往星海",
    description: "左上角的入口要能把用户带去星海视图。",
    target: "nav.universe",
    interaction: "tap",
  },
  {
    id: "universe-card-open",
    title: "点击卡片",
    description: "在星海里点开卡片后，可以查看详情、状态与互动入口。",
    target: "universe.card",
    interaction: "tap",
  },
  {
    id: "universe-heart-drag",
    title: "把心心拖到卡片上",
    description: "按住心心拖到卡片上，表示一次回应或共鸣。",
    target: "universe.reaction-heart",
    interaction: "drag",
  },
  {
    id: "universe-pan",
    title: "拖动画布",
    description: "按住空白区域拖动，可以浏览更远一点的星海。",
    target: "universe.canvas",
    interaction: "drag",
  },
  {
    id: "universe-zoom",
    title: "放缩画布",
    description: "支持滚轮缩放或双指缩放，让视角近一点或远一点。",
    target: "universe.canvas",
    interaction: "zoom",
  },
] as const;

const statusGlossary = [
  {
    status: "published",
    label: "已发送到星海",
    description: "公开内容已经进入星海，可以被他人看见。",
  },
  {
    status: "pending_manual",
    label: "等待温柔审核",
    description: "内容正在排队审核，结果会很快回来。",
  },
  {
    status: "private",
    label: "只留给自己",
    description: "这条记录只会留在你的往世乐土里，不会进入星海。",
  },
] as const;

export type GuideState = {
  completedAt: string | null;
  skippedAt: string | null;
  lastSeenStep: number;
  version: string;
  canReplay: boolean;
  entryCount: number;
  lastPresentedAt: string | null;
  lastEntryId: string | null;
};

export type GuideDisplayReason =
  | "first_entry_without_content"
  | "returning_without_content"
  | "already_sent_content"
  | "local_debug";

export type GuideDisplayState = {
  shouldShow: boolean;
  allowSkip: boolean;
  forceBlocking: boolean;
  reason: GuideDisplayReason;
  localDebugForceShow: boolean;
  showEveryEntryUntilFirstContent: boolean;
};

function clampLastSeenStep(value: number): number {
  return Math.max(0, Math.min(value, guideSteps.length - 1));
}

export function normalizeGuideState(metadata: unknown): GuideState {
  const source = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const rawGuide = source.guide;
  const guide = rawGuide && typeof rawGuide === "object" ? (rawGuide as Record<string, unknown>) : {};
  const lastSeenStep = Number.isFinite(Number(guide.lastSeenStep)) ? Number(guide.lastSeenStep) : 0;
  const entryCount = Number.isFinite(Number(guide.entryCount)) ? Number(guide.entryCount) : 0;

  return {
    completedAt: typeof guide.completedAt === "string" ? guide.completedAt : null,
    skippedAt: typeof guide.skippedAt === "string" ? guide.skippedAt : null,
    lastSeenStep: clampLastSeenStep(lastSeenStep),
    version: guideVersion,
    canReplay: true,
    entryCount: Math.max(0, Math.floor(entryCount)),
    lastPresentedAt: typeof guide.lastPresentedAt === "string" ? guide.lastPresentedAt : null,
    lastEntryId: typeof guide.lastEntryId === "string" ? guide.lastEntryId : null,
  };
}

export function shouldForceOnboardingGuideForTesting(): boolean {
  const raw = (process.env.ONBOARDING_FORCE_SHOW ?? "auto").trim().toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }

  return (process.env.NODE_ENV ?? "development") === "development";
}

export function buildGuideDisplayState(args: {
  hasSentAnyContent: boolean;
  entryCount: number;
  localDebugForceShow: boolean;
}): GuideDisplayState {
  if (args.localDebugForceShow) {
    return {
      shouldShow: true,
      allowSkip: true,
      forceBlocking: false,
      reason: "local_debug",
      localDebugForceShow: true,
      showEveryEntryUntilFirstContent: true,
    };
  }

  if (args.hasSentAnyContent) {
    return {
      shouldShow: false,
      allowSkip: true,
      forceBlocking: false,
      reason: "already_sent_content",
      localDebugForceShow: false,
      showEveryEntryUntilFirstContent: false,
    };
  }

  const isFirstEntry = args.entryCount <= 1;
  return {
    shouldShow: true,
    allowSkip: !isFirstEntry,
    forceBlocking: isFirstEntry,
    reason: isFirstEntry ? "first_entry_without_content" : "returning_without_content",
    localDebugForceShow: false,
    showEveryEntryUntilFirstContent: true,
  };
}

export function resolveGuideWelcomeDescription(entryCount: number): string {
  const safeEntryCount = Math.max(1, entryCount);
  return welcomeDescriptionPool[(safeEntryCount - 1) % welcomeDescriptionPool.length];
}

export function buildGuideContent(args: {
  state: GuideState;
  display: GuideDisplayState;
  hasSentAnyContent: boolean;
  sentContentCount: number;
}) {
  const welcomeDescription = resolveGuideWelcomeDescription(args.state.entryCount);

  return {
    version: guideVersion,
    welcomeTitle: "让爱莉陪你把第一张卡片写完吧",
    welcomeDescription:
      "第一次来到这里时，不用急着一下子懂完所有事。先照着引导完成欢迎卡片，再认识往世乐土与星海，就足够顺利地开始了。",
    welcomePrimaryAction: "跟着爱莉完成一遍",
    welcomeSecondaryAction: "这次先跳过",
    steps: guideSteps,
    safetyCard: {
      title: "开始前，记住这几件事就好",
      bullets: [
        "只要还没有真正发送过内容，每次进入都会再次提示这份引导。",
        "第一次进入且尚未发送内容时，这个入口引导不能跳过。",
        "按系统模板完成欢迎卡片时，会走轻量通过路径，公开后可直接看到“已发送到星海”。",
      ],
      confirmText: "我知道啦",
    },
    display: args.display,
    draftTemplate: {
      visibilityIntent: "public",
      expectedPublishStatus: "published",
      approvalHint: "欢迎卡片按系统给出的内容完成时，会走轻量自动通过路径。",
      moodExercise: {
        target: "composer.mood-strip",
        maxSelections: 2,
        presetOnly: true,
        sequence: moodExerciseSequence,
      },
      fields: [
        {
          key: "moodPhrase",
          label: "标题",
          value: "Hello Elysia！",
          target: "composer.title",
          helperText: "请直接按这个标题填写。",
        },
        {
          key: "quote",
          label: "誓言",
          value: "欢迎来到往世乐土！",
          target: "composer.quote",
          helperText: "请直接按这个誓言填写。",
        },
        {
          key: "description",
          label: "描述",
          value: welcomeDescription,
          target: "composer.description",
          helperText: "先展开描述，再把系统提供的欢迎语填写进去。",
        },
      ],
    },
    featureTour,
    statusGlossary,
    contentState: {
      hasSentAnyContent: args.hasSentAnyContent,
      sentContentCount: args.sentContentCount,
    },
    state: args.state,
  };
}

export async function markGuideCompletedAfterFirstContent(
  client: Pick<PoolClient, "query">,
  args: { userId: string; recordId: string; source: "record" | "reply" },
): Promise<void> {
  const patch = JSON.stringify({
    completedAt: new Date().toISOString(),
    completionSource: args.source,
    firstContentRecordId: args.recordId,
  });

  await client.query(
    `
      INSERT INTO onboarding_progress (user_id, metadata)
      VALUES ($1, jsonb_build_object('guide', $2::jsonb))
      ON CONFLICT (user_id)
      DO UPDATE SET
        metadata = CASE
          WHEN COALESCE(onboarding_progress.metadata->'guide'->>'completedAt', '') = '' THEN
            jsonb_set(
              onboarding_progress.metadata,
              '{guide}',
              COALESCE(onboarding_progress.metadata->'guide', '{}'::jsonb) || $2::jsonb,
              true
            )
          ELSE onboarding_progress.metadata
        END,
        updated_at = NOW()
    `,
    [args.userId, patch],
  );
}

import type { ModerationAssessment, RiskLevel } from "./moderation.js";

export type VisibilityIntent = "private" | "public";

export type PublicationStatus =
  | "private"
  | "pending_auto"
  | "pending_manual"
  | "pending_second_review"
  | "published"
  | "rejected"
  | "needs_changes"
  | "risk_control_24h";

export type ModerationQueueType = "moderation" | "second_review" | "risk_control" | "media_review" | "custom_mood_review";

export type PublicationDecision = {
  publicationStatus: PublicationStatus;
  isPublic: boolean;
  queueType: ModerationQueueType | null;
  queuePriority: number | null;
  reason: string;
  effectiveRiskLevel: RiskLevel;
  triggerRiskControl: boolean;
};

const riskWeight: Record<RiskLevel, number> = {
  very_low: 0,
  low: 1,
  medium: 2,
  elevated: 3,
  high: 4,
  very_high: 5,
};

function maxRiskLevel(a: RiskLevel, b: RiskLevel | null): RiskLevel {
  if (!b) {
    return a;
  }
  return riskWeight[a] >= riskWeight[b] ? a : b;
}

function queuePriorityByLevel(level: RiskLevel): number {
  switch (level) {
    case "very_high":
      return 1;
    case "high":
      return 2;
    case "elevated":
      return 3;
    case "medium":
      return 5;
    case "low":
      return 7;
    case "very_low":
      return 8;
    default:
      return 6;
  }
}

export function isPubliclyVisibleStatus(status: string): boolean {
  return status === "published";
}

export function decidePublication(args: {
  visibilityIntent: VisibilityIntent;
  hasImages: boolean;
  textAssessment: ModerationAssessment;
  aiRiskLevel?: RiskLevel | null;
  isCustomMood?: boolean;
  hasAdOrUrlRisk?: boolean;
  requiresManualReview?: boolean;
}): PublicationDecision {
  const effectiveRisk = maxRiskLevel(args.textAssessment.level, args.aiRiskLevel ?? null);
  const mustManualReview = args.requiresManualReview || args.isCustomMood || args.hasAdOrUrlRisk;

  if (args.visibilityIntent === "private") {
    const hitPrivateBaseline = effectiveRisk === "very_high" || args.textAssessment.baselineHighRisk;
    if (hitPrivateBaseline) {
      return {
        publicationStatus: "risk_control_24h",
        isPublic: false,
        queueType: "risk_control",
        queuePriority: queuePriorityByLevel("very_high"),
        reason: "私密内容命中高危底线，进入24h风控",
        effectiveRiskLevel: effectiveRisk,
        triggerRiskControl: true,
      };
    }

    if (args.isCustomMood) {
      return {
        publicationStatus: "pending_manual",
        isPublic: false,
        queueType: "custom_mood_review",
        queuePriority: queuePriorityByLevel(effectiveRisk),
        reason: "自定义情绪需进入人工审核",
        effectiveRiskLevel: effectiveRisk,
        triggerRiskControl: false,
      };
    }

    return {
      publicationStatus: "private",
      isPublic: false,
      queueType: args.hasImages ? "media_review" : null,
      queuePriority: args.hasImages ? 4 : null,
      reason: args.hasImages ? "私密图片需人工审核，但本人可见" : "私密内容放松审查",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: false,
    };
  }

  if (effectiveRisk === "very_high") {
    return {
      publicationStatus: "risk_control_24h",
      isPublic: false,
      queueType: "risk_control",
      queuePriority: queuePriorityByLevel("very_high"),
      reason: "公开申请命中极高风险，进入24h风控",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: true,
    };
  }

  if (args.hasImages) {
    return {
      publicationStatus: "pending_manual",
      isPublic: false,
      queueType: "media_review",
      queuePriority: queuePriorityByLevel(effectiveRisk),
      reason: "图片内容统一人工审核",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: false,
    };
  }

  if (args.isCustomMood) {
    return {
      publicationStatus: "pending_manual",
      isPublic: false,
      queueType: "custom_mood_review",
      queuePriority: queuePriorityByLevel(effectiveRisk),
      reason: args.aiRiskLevel ? "自定义情绪需结合 AI 与人工审核" : "自定义情绪需进入人工审核",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: false,
    };
  }

  if (effectiveRisk === "high") {
    return {
      publicationStatus: "pending_second_review",
      isPublic: false,
      queueType: "second_review",
      queuePriority: queuePriorityByLevel(effectiveRisk),
      reason: "高风险公开申请进入二次审查",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: false,
    };
  }

  if (mustManualReview || effectiveRisk === "medium" || effectiveRisk === "elevated") {
    return {
      publicationStatus: "pending_manual",
      isPublic: false,
      queueType: "moderation",
      queuePriority: queuePriorityByLevel(effectiveRisk),
      reason: args.hasAdOrUrlRisk ? "公开内容命中网址或广告风险，进入人工审核" : "中风险内容进入人工审核",
      effectiveRiskLevel: effectiveRisk,
      triggerRiskControl: false,
    };
  }

  return {
    publicationStatus: "published",
    isPublic: true,
    queueType: null,
    queuePriority: null,
    reason: "低/极低风险公开内容可直发",
    effectiveRiskLevel: effectiveRisk,
    triggerRiskControl: false,
  };
}

export function publicationStateLabel(status: PublicationStatus): string {
  switch (status) {
    case "private":
      return "仅自己可见";
    case "pending_auto":
    case "pending_manual":
      return "待审核";
    case "pending_second_review":
      return "二次审查";
    case "risk_control_24h":
      return "风控24h";
    case "published":
      return "已公开";
    case "rejected":
    case "needs_changes":
      return "驳回待修改";
    default:
      return "待审核";
  }
}

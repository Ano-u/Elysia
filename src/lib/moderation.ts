import { hasPublicAdOrUrlRisk } from "./public-redaction.js";
import { detectSensitiveLexiconMatches } from "./sensitive-lexicon.js";

export type ReviewDecision = "pass" | "reject" | "escalate";

export type RiskLevel = "very_low" | "low" | "medium" | "elevated" | "high" | "very_high";

export type ViolationType = "political" | "gore_violence" | "extremism" | "privacy" | "other";

export type AutoReviewResult = {
  decision: ReviewDecision;
  confidence: number;
  riskScore: number;
  riskLabels: string[];
  reason: string;
};

export type ModerationAssessment = AutoReviewResult & {
  level: RiskLevel;
  baselineHighRisk: boolean;
  violationType: ViolationType;
  requiresManualReview?: boolean;
  hasAdOrUrlRisk?: boolean;
  isCustomMood?: boolean;
  evasionSignals?: string[];
  aiReviewRequired?: boolean;
  sensitiveLexiconLabels?: string[];
};

type Rule = {
  label: string;
  regex: RegExp;
  reason: string;
  violationType: ViolationType;
};

const veryHighRules: Rule[] = [
  {
    label: "political_extremism",
    regex: /(颠覆国家政权|暴力革命|组织暴动|恐怖袭击|分裂国家|反动宣传|煽动暴动)/i,
    reason: "命中涉政/极端高风险表达",
    violationType: "political",
  },
  {
    label: "gore_violence",
    regex: /(虐杀|斩首|爆头|血腥处决|碎尸|活体解剖|屠杀教程)/i,
    reason: "命中血腥暴力高危表达",
    violationType: "gore_violence",
  },
  {
    label: "bomb_or_terror",
    regex: /(自制炸弹|爆炸物配方|恐怖组织宣誓|袭击路线)/i,
    reason: "命中严重极端/恐袭风险表达",
    violationType: "extremism",
  },
];

const highRules: Rule[] = [
  {
    label: "precise_address",
    regex: /(省|市|区|县|镇|乡).{0,12}(路|街|巷|弄|号|栋|单元|室)/,
    reason: "疑似包含较精确地址信息",
    violationType: "privacy",
  },
  {
    label: "geo_coordinate",
    regex: /\b\d{2,3}\.\d{4,}\s*,\s*\d{2,3}\.\d{4,}\b/,
    reason: "疑似包含精确地理坐标",
    violationType: "privacy",
  },
  {
    label: "high_risk_intent",
    regex: /(报复|威胁|仇恨言论|极端言论|武器制造)/i,
    reason: "命中高风险意图关键词",
    violationType: "other",
  },
  {
    label: "personal_id_card",
    regex: /\b\d{17}[\dXx]\b/,
    reason: "命中身份证号样式",
    violationType: "privacy",
  },
];

const mediumRules: Rule[] = [
  {
    label: "personal_phone",
    regex: /(?:\+?86[-\s]?)?1[3-9]\d{9}/,
    reason: "命中手机号等个人敏感信息",
    violationType: "privacy",
  },
  {
    label: "personal_email",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    reason: "命中邮箱等个人敏感信息",
    violationType: "privacy",
  },
];

const customMoodRules: Rule[] = [
  {
    label: "custom_mood_policy",
    regex: /(约炮|招嫖|卖片|枪支|炸药|分裂|反动|猎奇血腥|引流|卖号|代购|接单)/i,
    reason: "自定义情绪命中平台禁用语义",
    violationType: "other",
  },
];

function mapLevel(score: number): RiskLevel {
  if (score >= 0.9) {
    return "very_high";
  }
  if (score >= 0.72) {
    return "high";
  }
  if (score >= 0.45) {
    return "medium";
  }
  if (score >= 0.18) {
    return "low";
  }
  return "very_low";
}

function normalize(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  extraEmotions?: string[];
  tags?: string[];
  customMoodPhrase?: string | null;
}): string {
  return [
    input.moodPhrase,
    input.customMoodPhrase ?? "",
    input.quote ?? "",
    input.description ?? "",
    ...(input.extraEmotions ?? []),
    ...(input.tags ?? []),
  ]
    .join("\n")
    .trim();
}

function normalizeForModeration(text: string): { normalized: string; compact: string; evasionSignals: string[] } {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\-_.,/\\|+*~`'"“”‘’]+/g, " ")
    .trim();
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
  const evasionSignals: string[] = [];

  if (normalized !== text.trim().toLowerCase()) {
    evasionSignals.push("normalized_text");
  }
  if (compact !== normalized.replace(/\s+/g, "")) {
    evasionSignals.push("compact_text");
  }
  if (/([a-z]\s+){2,}[a-z]/i.test(normalized) || /[\u4e00-\u9fff]\s+[\u4e00-\u9fff]/u.test(normalized)) {
    evasionSignals.push("split_tokens");
  }
  if (/[\u4e00-\u9fff][a-z]|[a-z][\u4e00-\u9fff]/i.test(normalized)) {
    evasionSignals.push("mixed_scripts");
  }
  if (/[0-9@!$]/.test(normalized)) {
    evasionSignals.push("leet_variant");
  }

  return { normalized, compact, evasionSignals };
}

function classifyLexiconMatch(labels: string[]): { level: RiskLevel; violationType: ViolationType; reason: string } {
  const serialized = labels.join(" ").toLowerCase();
  if (serialized.includes("politic") || serialized.includes("extrem")) {
    return {
      level: "very_high",
      violationType: "political",
      reason: "命中涉政/极端敏感词词库",
    };
  }

  if (serialized.includes("violence")) {
    return {
      level: "very_high",
      violationType: "gore_violence",
      reason: "命中暴力血腥敏感词词库",
    };
  }

  if (serialized.includes("ad") || serialized.includes("spam")) {
    return {
      level: "high",
      violationType: "other",
      reason: "命中广告引流敏感词词库",
    };
  }

  return {
    level: "high",
    violationType: "other",
    reason: "命中敏感词词库",
  };
}

function buildLexiconAssessment(args: {
  labels: string[];
  evasionSignals: string[];
  isCustomMood?: boolean;
}): ModerationAssessment {
  const classified = classifyLexiconMatch(args.labels);
  const isVeryHigh = classified.level === "very_high";

  return {
    decision: isVeryHigh ? "reject" : "escalate",
    confidence: isVeryHigh ? 0.97 : 0.8,
    riskScore: isVeryHigh ? 0.97 : 0.8,
    riskLabels: [...args.labels, ...args.evasionSignals],
    reason: classified.reason,
    level: classified.level,
    baselineHighRisk: isVeryHigh,
    violationType: classified.violationType,
    requiresManualReview: true,
    hasAdOrUrlRisk: classified.reason.includes("广告"),
    isCustomMood: Boolean(args.isCustomMood),
    evasionSignals: args.evasionSignals,
    aiReviewRequired: Boolean(args.isCustomMood),
    sensitiveLexiconLabels: args.labels,
  };
}

export function assessPublicContentSafety(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  extraEmotions?: string[];
  tags?: string[];
  customMoodPhrase?: string | null;
}): { hasRisk: boolean; labels: string[]; reason?: string } {
  const merged = normalize(input);
  const variants = normalizeForModeration(merged);
  const exactRisk = hasPublicAdOrUrlRisk([merged, variants.normalized, variants.compact].join("\n"));
  const matchedLabels = [...exactRisk.labels];
  let reason = exactRisk.matched ? "公开内容疑似包含网址、广告或引流语义" : undefined;

  return {
    hasRisk: matchedLabels.length > 0,
    labels: matchedLabels,
    reason,
  };
}

export function assessCustomMoodModeration(input: { customMoodPhrase: string }): ModerationAssessment {
  const variants = normalizeForModeration(input.customMoodPhrase);
  const texts = [input.customMoodPhrase, variants.normalized, variants.compact];
  const lexiconMatch = detectSensitiveLexiconMatches(input.customMoodPhrase);

  if (lexiconMatch.matched) {
    return buildLexiconAssessment({
      labels: lexiconMatch.labels,
      evasionSignals: [
        ...variants.evasionSignals,
        ...(lexiconMatch.fuzzy ? ["lexicon_fuzzy_match"] : []),
      ],
      isCustomMood: true,
    });
  }

  for (const rule of [...veryHighRules, ...customMoodRules]) {
    if (texts.some((text) => text.length > 0 && rule.regex.test(text))) {
      const isVeryHigh = veryHighRules.includes(rule);
      return {
        decision: isVeryHigh ? "reject" : "escalate",
        confidence: isVeryHigh ? 0.96 : 0.76,
        riskScore: isVeryHigh ? 0.96 : 0.76,
        riskLabels: [rule.label, ...variants.evasionSignals],
        reason: rule.reason,
        level: isVeryHigh ? "very_high" : "high",
        baselineHighRisk: isVeryHigh,
        violationType: rule.violationType,
        requiresManualReview: true,
        hasAdOrUrlRisk: false,
        isCustomMood: true,
        evasionSignals: variants.evasionSignals,
        aiReviewRequired: true,
        sensitiveLexiconLabels: [],
      };
    }
  }

  return {
    decision: "escalate",
    confidence: 0.48,
    riskScore: 0.48,
    riskLabels: variants.evasionSignals,
    reason: "自定义情绪需进入更严格审核",
    level: "medium",
    baselineHighRisk: false,
    violationType: "other",
    requiresManualReview: true,
    hasAdOrUrlRisk: false,
    isCustomMood: true,
    evasionSignals: variants.evasionSignals,
    aiReviewRequired: true,
    sensitiveLexiconLabels: lexiconMatch.labels,
  };
}

export function assessRecordTextRisk(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  extraEmotions?: string[];
  tags?: string[];
  customMoodPhrase?: string | null;
  isPublic?: boolean;
  isCustomMood?: boolean;
}): AutoReviewResult {
  const assessment = assessModeration(input);
  return {
    decision: assessment.decision,
    confidence: assessment.confidence,
    riskScore: assessment.riskScore,
    riskLabels: assessment.riskLabels,
    reason: assessment.reason,
  };
}

export function assessModeration(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  extraEmotions?: string[];
  tags?: string[];
  customMoodPhrase?: string | null;
  isPublic?: boolean;
  isCustomMood?: boolean;
}): ModerationAssessment {
  if (input.isCustomMood && input.customMoodPhrase) {
    const customAssessment = assessCustomMoodModeration({ customMoodPhrase: input.customMoodPhrase });
    if (customAssessment.level === "very_high" || customAssessment.level === "high") {
      return customAssessment;
    }
  }

  const merged = normalize(input);
  const variants = normalizeForModeration(merged);
  const texts = [merged, variants.normalized, variants.compact];
  const lexiconMatch = detectSensitiveLexiconMatches(merged);

  if (lexiconMatch.matched) {
    return buildLexiconAssessment({
      labels: lexiconMatch.labels,
      evasionSignals: [
        ...variants.evasionSignals,
        ...(lexiconMatch.fuzzy ? ["lexicon_fuzzy_match"] : []),
      ],
      isCustomMood: input.isCustomMood,
    });
  }

  for (const rule of veryHighRules) {
    if (texts.some((text) => text.length > 0 && rule.regex.test(text))) {
      return {
        decision: "reject",
        confidence: 0.96,
        riskScore: 0.96,
        riskLabels: [rule.label, ...variants.evasionSignals],
        reason: rule.reason,
        level: "very_high",
        baselineHighRisk: true,
        violationType: rule.violationType,
        requiresManualReview: true,
        hasAdOrUrlRisk: false,
        isCustomMood: Boolean(input.isCustomMood),
        evasionSignals: variants.evasionSignals,
        aiReviewRequired: Boolean(input.isCustomMood),
        sensitiveLexiconLabels: [],
      };
    }
  }

  for (const rule of highRules) {
    if (texts.some((text) => text.length > 0 && rule.regex.test(text))) {
      return {
        decision: "escalate",
        confidence: 0.78,
        riskScore: 0.78,
        riskLabels: [rule.label, ...variants.evasionSignals],
        reason: rule.reason,
        level: "high",
        baselineHighRisk: true,
        violationType: rule.violationType,
        requiresManualReview: true,
        hasAdOrUrlRisk: false,
        isCustomMood: Boolean(input.isCustomMood),
        evasionSignals: variants.evasionSignals,
        aiReviewRequired: Boolean(input.isCustomMood),
        sensitiveLexiconLabels: [],
      };
    }
  }

  const publicSafety = input.isPublic ? assessPublicContentSafety(input) : { hasRisk: false, labels: [] as string[], reason: undefined };
  if (publicSafety.hasRisk) {
    return {
      decision: "escalate",
      confidence: 0.52,
      riskScore: 0.52,
      riskLabels: [...publicSafety.labels, ...variants.evasionSignals],
      reason: publicSafety.reason ?? "公开内容命中网址或广告风险",
      level: "medium",
      baselineHighRisk: false,
      violationType: "other",
      requiresManualReview: true,
      hasAdOrUrlRisk: true,
      isCustomMood: Boolean(input.isCustomMood),
      evasionSignals: variants.evasionSignals,
      aiReviewRequired: Boolean(input.isCustomMood),
      sensitiveLexiconLabels: [],
    };
  }

  for (const rule of mediumRules) {
    if (texts.some((text) => text.length > 0 && rule.regex.test(text))) {
      return {
        decision: "escalate",
        confidence: 0.5,
        riskScore: 0.5,
        riskLabels: [rule.label, ...variants.evasionSignals],
        reason: rule.reason,
        level: "medium",
        baselineHighRisk: false,
        violationType: rule.violationType,
        requiresManualReview: Boolean(input.isCustomMood),
        hasAdOrUrlRisk: false,
        isCustomMood: Boolean(input.isCustomMood),
        evasionSignals: variants.evasionSignals,
        aiReviewRequired: Boolean(input.isCustomMood),
        sensitiveLexiconLabels: [],
      };
    }
  }

  const size = merged.length;
  const heuristicScore = input.isCustomMood ? 0.2 : size > 700 ? 0.36 : size > 300 ? 0.2 : 0.08;
  return {
    decision: input.isCustomMood ? "escalate" : heuristicScore >= 0.45 ? "escalate" : "pass",
    confidence: 0.9,
    riskScore: heuristicScore,
    riskLabels: variants.evasionSignals,
    reason: input.isCustomMood ? "自定义情绪需进入更严格审核" : "未命中已知高风险模式",
    level: mapLevel(heuristicScore),
    baselineHighRisk: false,
    violationType: "other",
    requiresManualReview: Boolean(input.isCustomMood),
    hasAdOrUrlRisk: false,
    isCustomMood: Boolean(input.isCustomMood),
    evasionSignals: variants.evasionSignals,
    aiReviewRequired: Boolean(input.isCustomMood),
    sensitiveLexiconLabels: lexiconMatch.labels,
  };
}

export function parseAiRiskLevel(input: string): RiskLevel | null {
  const value = input.trim().toLowerCase();
  const map: Record<string, RiskLevel> = {
    "极低": "very_low",
    "very_low": "very_low",
    low: "low",
    "较低": "low",
    "中": "medium",
    medium: "medium",
    "较高": "medium",
    elevated: "medium",
    high: "high",
    "高": "high",
    "极高": "very_high",
    very_high: "very_high",
  };
  return map[value] ?? null;
}

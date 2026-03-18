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

const elevatedRules: Rule[] = [
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

function mapLevel(score: number): RiskLevel {
  if (score >= 0.9) {
    return "very_high";
  }
  if (score >= 0.75) {
    return "high";
  }
  if (score >= 0.55) {
    return "elevated";
  }
  if (score >= 0.32) {
    return "medium";
  }
  if (score >= 0.12) {
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
}): string {
  return [input.moodPhrase, input.quote ?? "", input.description ?? "", ...(input.extraEmotions ?? []), ...(input.tags ?? [])]
    .join("\n")
    .trim();
}

export function assessRecordTextRisk(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  extraEmotions?: string[];
  tags?: string[];
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
}): ModerationAssessment {
  const merged = normalize(input);

  for (const rule of veryHighRules) {
    if (rule.regex.test(merged)) {
      return {
        decision: "reject",
        confidence: 0.96,
        riskScore: 0.96,
        riskLabels: [rule.label],
        reason: rule.reason,
        level: "very_high",
        baselineHighRisk: true,
        violationType: rule.violationType,
      };
    }
  }

  for (const rule of highRules) {
    if (rule.regex.test(merged)) {
      return {
        decision: "escalate",
        confidence: 0.82,
        riskScore: 0.82,
        riskLabels: [rule.label],
        reason: rule.reason,
        level: "high",
        baselineHighRisk: true,
        violationType: rule.violationType,
      };
    }
  }

  for (const rule of elevatedRules) {
    if (rule.regex.test(merged)) {
      return {
        decision: "escalate",
        confidence: 0.64,
        riskScore: 0.64,
        riskLabels: [rule.label],
        reason: rule.reason,
        level: "elevated",
        baselineHighRisk: false,
        violationType: rule.violationType,
      };
    }
  }

  const size = merged.length;
  const heuristicScore = size > 700 ? 0.36 : size > 300 ? 0.2 : 0.08;
  return {
    decision: heuristicScore >= 0.55 ? "escalate" : "pass",
    confidence: 0.9,
    riskScore: heuristicScore,
    riskLabels: [],
    reason: "未命中已知高风险模式",
    level: mapLevel(heuristicScore),
    baselineHighRisk: false,
    violationType: "other",
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
    "较高": "elevated",
    elevated: "elevated",
    high: "high",
    "高": "high",
    "极高": "very_high",
    very_high: "very_high",
  };
  return map[value] ?? null;
}

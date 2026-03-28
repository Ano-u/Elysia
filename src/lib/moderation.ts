import { countCjkCharacters, countEnglishWords, isLikelyEnglish } from "./utils.js";

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

export type CustomMoodValidationResult = {
  ok: boolean;
  reason?: string;
  trimmed: string;
  isCustom: boolean;
};

export type TextNormalizationResult = {
  raw: string;
  trimmed: string;
  normalized: string;
  collapsed: string;
  compact: string;
  flags: string[];
};

export type PublicSanitizationResult = {
  displayMoodPhrase: string;
  publicDescription: string | null;
  publicQuote: string | null;
  publicOccurredAt: string | null;
  publicLocationLabel: string | null;
  sanitizationApplied: boolean;
  riskLabels: string[];
  actions: string[];
  hasBlockingRisk: boolean;
};

export type ModerationAssessment = AutoReviewResult & {
  level: RiskLevel;
  baselineHighRisk: boolean;
  violationType: ViolationType;
  normalizedText?: TextNormalizationResult;
  customMood?: {
    isCustom: boolean;
    flags: string[];
  };
  publicSanitization?: {
    applied: boolean;
    actions: string[];
    labels: string[];
    hasBlockingRisk: boolean;
  };
};

type Rule = {
  label: string;
  regex: RegExp;
  reason: string;
  violationType: ViolationType;
};

const SYSTEM_MOOD_POOL = new Set([
  "开心",
  "难过",
  "平静",
  "焦虑",
  "期待",
  "委屈",
  "感动",
  "失落",
  "轻松",
  "疲惫",
  "想你",
  "释然",
  "紧张",
  "治愈",
  "孤单",
  "温柔",
  "兴奋",
  "纠结",
  "安稳",
  "勇敢",
  "happy",
  "sad",
  "calm",
  "anxious",
  "excited",
  "tired",
  "hopeful",
  "lonely",
  "gentle",
  "brave",
]);

const zeroWidthPattern = /[\u200B-\u200D\uFEFF\u2060]/g;
const controlPattern = /[\u0000-\u001F\u007F-\u009F]/g;
const separatorPattern = /[\s._\-~·•・|/\\,，。！？!?:：;'"`()\[\]{}<>《》【】（）]+/g;
const repeatedCharPattern = /(.)\1{3,}/g;
const blockedUrlPattern = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|cn|net|org|io|cc|xyz|top|shop|vip|tv|me|co)(?:\/|\b))/i;
const preciseTimePattern = /(?:\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}(?:日|号)?)?(?:\s*[T ]?\d{1,2}:\d{2})?|\d{1,2}月\d{1,2}[日号]|(?:上午|下午|今晚|凌晨|中午)\s*\d{1,2}(?:[:点时]\d{1,2})?)/g;
const cityPattern = /([\u4e00-\u9fa5]{2,}(?:省|市))/;
const addressFragmentPattern = /([\u4e00-\u9fa5A-Za-z0-9]{2,}(?:区|县|镇|乡).{0,8}(?:路|街|巷|弄|号|栋|单元|室))/g;
const adLikePattern = /(加微|加v|v信|vx|微.?信|wechat|tg|telegram|whatsapp|qq|群|私聊|联系我|推广|返利|代购|优惠|下单|兼职|引流|广告)/i;
const evasionPattern = /(w\s*x|v\s*x|q\s*q|微\s*信|电\s*报|t\s*g|s\s*h\s*o\s*p)/i;

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
  {
    label: "ad_or_contact_evasion",
    regex: /(加微|加v|vx|微.?信|telegram|tg|whatsapp|返利|推广|引流|下单|群号|qq号)/i,
    reason: "命中广告导流或联系方式规避表达",
    violationType: "other",
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
  {
    label: "public_url_or_ad",
    regex: /(?:https?:\/\/|www\.|加微|加v|vx|微.?信|telegram|tg|whatsapp|返利|下单|优惠|推广)/i,
    reason: "疑似包含链接或广告导流信息",
    violationType: "other",
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
  {
    label: "evasion_suspected",
    regex: /(w\s*x|v\s*x|q\s*q|微\s*信|t\s*g|s\s*h\s*o\s*p)/i,
    reason: "疑似通过拆分字符规避审核",
    violationType: "other",
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

function replaceCommonVariants(input: string): string {
  return input
    .replace(/微\s*信/gi, "微信")
    .replace(/v\s*x/gi, "vx")
    .replace(/t\s*g/gi, "tg")
    .replace(/w\s*x/gi, "wx")
    .replace(/q\s*q/gi, "qq")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/5/g, "s")
    .replace(/8/g, "b");
}

export function normalizeModerationText(text: string): TextNormalizationResult {
  const flags: string[] = [];
  const raw = text;
  const trimmed = text.trim();

  let normalized = trimmed.normalize("NFKC");
  if (normalized !== trimmed) {
    flags.push("unicode_normalized");
  }

  if (zeroWidthPattern.test(normalized)) {
    flags.push("zero_width_removed");
    normalized = normalized.replace(zeroWidthPattern, "");
  }

  if (controlPattern.test(normalized)) {
    flags.push("control_char_removed");
    normalized = normalized.replace(controlPattern, "");
  }

  normalized = normalized.replace(/\s+/g, " ").trim();
  const collapsed = replaceCommonVariants(normalized.toLowerCase().replace(separatorPattern, " ").replace(/\s+/g, " ").trim());
  const compact = collapsed.replace(/\s+/g, "");

  if (collapsed !== normalized.toLowerCase()) {
    flags.push("separator_collapsed");
  }
  if (compact !== collapsed.replace(/\s+/g, "")) {
    flags.push("variant_replaced");
  }
  if (repeatedCharPattern.test(compact)) {
    flags.push("repeated_chars_detected");
  }
  if (evasionPattern.test(collapsed)) {
    flags.push("evasion_pattern_detected");
  }

  return {
    raw,
    trimmed,
    normalized,
    collapsed,
    compact,
    flags: Array.from(new Set(flags)),
  };
}

function inferSafeFallbackMood(input: string): string {
  const text = input.trim();
  if (!text) {
    return "此刻";
  }
  if (isLikelyEnglish(text)) {
    return "mixed feelings";
  }
  return "此刻心情";
}

export function isSystemMood(moodPhrase: string): boolean {
  return SYSTEM_MOOD_POOL.has(moodPhrase.trim().toLowerCase()) || SYSTEM_MOOD_POOL.has(moodPhrase.trim());
}

export function validateCustomMoodPhrase(moodPhrase: string): CustomMoodValidationResult {
  const trimmed = moodPhrase.trim();
  if (!trimmed) {
    return { ok: false, reason: "情绪不能为空", trimmed, isCustom: false };
  }

  const isCustom = !isSystemMood(trimmed);
  if (!isCustom) {
    return { ok: true, trimmed, isCustom: false };
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) {
    return { ok: false, reason: "自定义情绪不能只包含符号", trimmed, isCustom: true };
  }

  if (isLikelyEnglish(trimmed)) {
    if (countEnglishWords(trimmed) > 2) {
      return { ok: false, reason: "自定义英文情绪最多 2 个词", trimmed, isCustom: true };
    }
    return { ok: true, trimmed, isCustom: true };
  }

  const cjkCount = countCjkCharacters(trimmed);
  if (cjkCount > 5 || trimmed.length > 8) {
    return { ok: false, reason: "自定义中文情绪最多 5 个字", trimmed, isCustom: true };
  }

  return { ok: true, trimmed, isCustom: true };
}

function extractCityLabel(texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) {
      continue;
    }
    const match = text.match(cityPattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function sanitizeText(text: string | null | undefined, fallbackCity: string | null): { value: string | null; labels: string[]; actions: string[] } {
  if (!text) {
    return { value: text ?? null, labels: [], actions: [] };
  }

  let value = text;
  const labels: string[] = [];
  const actions: string[] = [];

  if (blockedUrlPattern.test(value)) {
    value = value.replace(/(?:https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|cn|net|org|io|cc|xyz|top|shop|vip|tv|me|co)\S*)/gi, "[链接已隐藏]");
    labels.push("public_url_detected");
    actions.push("mask_url");
  }

  if (adLikePattern.test(value)) {
    value = value.replace(adLikePattern, "[疑似推广信息已隐藏]");
    labels.push("ad_like_detected");
    actions.push("mask_ad_like");
  }

  if (preciseTimePattern.test(value)) {
    value = value.replace(preciseTimePattern, "当月");
    labels.push("precise_time_detected");
    actions.push("truncate_time_to_month");
  }

  if (addressFragmentPattern.test(value)) {
    value = value.replace(addressFragmentPattern, fallbackCity ?? "[某城市]");
    labels.push("precise_address_detected");
    actions.push("mask_address_to_city");
  }

  return {
    value,
    labels: Array.from(new Set(labels)),
    actions: Array.from(new Set(actions)),
  };
}

export function buildPublicSanitizedVariant(input: {
  moodPhrase: string;
  description?: string | null;
  quote?: string | null;
  occurredAt?: string | null;
  locationLabel?: string | null;
}): PublicSanitizationResult {
  const fallbackCity = extractCityLabel([input.locationLabel, input.description, input.quote]);
  const moodCheck = validateCustomMoodPhrase(input.moodPhrase);
  const moodNormalized = normalizeModerationText(input.moodPhrase);
  const descriptionResult = sanitizeText(input.description ?? null, fallbackCity);
  const quoteResult = sanitizeText(input.quote ?? null, fallbackCity);

  const actions = [...descriptionResult.actions, ...quoteResult.actions];
  const riskLabels = [...descriptionResult.labels, ...quoteResult.labels];
  const hasBlockingRisk = adLikePattern.test(moodNormalized.compact) || blockedUrlPattern.test(moodNormalized.compact);
  if (moodNormalized.flags.length > 0) {
    riskLabels.push(...moodNormalized.flags.map((flag) => `mood_${flag}`));
  }

  const publicOccurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
  let normalizedOccurredAt: string | null = null;
  if (publicOccurredAt && !Number.isNaN(publicOccurredAt.getTime())) {
    const monthDate = new Date(Date.UTC(publicOccurredAt.getUTCFullYear(), publicOccurredAt.getUTCMonth(), 1, 0, 0, 0, 0));
    normalizedOccurredAt = monthDate.toISOString();
    actions.push("truncate_occurred_at_to_month");
    riskLabels.push("occurred_at_month_only");
  }

  const safeMood = moodCheck.isCustom && (hasBlockingRisk || moodNormalized.flags.length > 0)
    ? inferSafeFallbackMood(input.moodPhrase)
    : input.moodPhrase;

  return {
    displayMoodPhrase: safeMood,
    publicDescription: descriptionResult.value,
    publicQuote: quoteResult.value,
    publicOccurredAt: normalizedOccurredAt,
    publicLocationLabel: fallbackCity,
    sanitizationApplied: actions.length > 0 || safeMood !== input.moodPhrase,
    riskLabels: Array.from(new Set(riskLabels)),
    actions: Array.from(new Set(actions)),
    hasBlockingRisk,
  };
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
  const normalizedText = normalizeModerationText(merged);
  const customMood = validateCustomMoodPhrase(input.moodPhrase);
  const publicSanitization = buildPublicSanitizedVariant({
    moodPhrase: input.moodPhrase,
    description: input.description,
    quote: input.quote,
  });

  for (const rule of veryHighRules) {
    if (rule.regex.test(normalizedText.compact) || rule.regex.test(normalizedText.collapsed) || rule.regex.test(merged)) {
      return {
        decision: "reject",
        confidence: 0.96,
        riskScore: 0.96,
        riskLabels: Array.from(new Set([rule.label, ...publicSanitization.riskLabels])),
        reason: rule.reason,
        level: "very_high",
        baselineHighRisk: true,
        violationType: rule.violationType,
        normalizedText,
        customMood: {
          isCustom: customMood.isCustom,
          flags: normalizedText.flags,
        },
        publicSanitization: {
          applied: publicSanitization.sanitizationApplied,
          actions: publicSanitization.actions,
          labels: publicSanitization.riskLabels,
          hasBlockingRisk: publicSanitization.hasBlockingRisk,
        },
      };
    }
  }

  for (const rule of highRules) {
    if (rule.regex.test(normalizedText.compact) || rule.regex.test(normalizedText.collapsed) || rule.regex.test(merged)) {
      return {
        decision: "escalate",
        confidence: 0.82,
        riskScore: 0.82,
        riskLabels: Array.from(new Set([rule.label, ...publicSanitization.riskLabels])),
        reason: rule.reason,
        level: "high",
        baselineHighRisk: true,
        violationType: rule.violationType,
        normalizedText,
        customMood: {
          isCustom: customMood.isCustom,
          flags: normalizedText.flags,
        },
        publicSanitization: {
          applied: publicSanitization.sanitizationApplied,
          actions: publicSanitization.actions,
          labels: publicSanitization.riskLabels,
          hasBlockingRisk: publicSanitization.hasBlockingRisk,
        },
      };
    }
  }

  for (const rule of elevatedRules) {
    if (rule.regex.test(normalizedText.compact) || rule.regex.test(normalizedText.collapsed) || rule.regex.test(merged)) {
      return {
        decision: "escalate",
        confidence: 0.64,
        riskScore: 0.64,
        riskLabels: Array.from(new Set([rule.label, ...publicSanitization.riskLabels])),
        reason: rule.reason,
        level: "elevated",
        baselineHighRisk: false,
        violationType: rule.violationType,
        normalizedText,
        customMood: {
          isCustom: customMood.isCustom,
          flags: normalizedText.flags,
        },
        publicSanitization: {
          applied: publicSanitization.sanitizationApplied,
          actions: publicSanitization.actions,
          labels: publicSanitization.riskLabels,
          hasBlockingRisk: publicSanitization.hasBlockingRisk,
        },
      };
    }
  }

  const size = merged.length;
  let heuristicScore = size > 700 ? 0.36 : size > 300 ? 0.2 : 0.08;
  if (customMood.isCustom) {
    heuristicScore = Math.max(heuristicScore, 0.35);
  }
  if (normalizedText.flags.length > 0) {
    heuristicScore = Math.max(heuristicScore, 0.58);
  }
  if (publicSanitization.sanitizationApplied) {
    heuristicScore = Math.max(heuristicScore, publicSanitization.hasBlockingRisk ? 0.82 : 0.6);
  }

  return {
    decision: heuristicScore >= 0.55 ? "escalate" : "pass",
    confidence: 0.9,
    riskScore: heuristicScore,
    riskLabels: Array.from(new Set(publicSanitization.riskLabels)),
    reason:
      customMood.isCustom || normalizedText.flags.length > 0 || publicSanitization.sanitizationApplied
        ? "命中自定义情绪严格审核或公开内容脱敏规则"
        : "未命中已知高风险模式",
    level: mapLevel(heuristicScore),
    baselineHighRisk: publicSanitization.hasBlockingRisk,
    violationType: publicSanitization.hasBlockingRisk ? "other" : "other",
    normalizedText,
    customMood: {
      isCustom: customMood.isCustom,
      flags: normalizedText.flags,
    },
    publicSanitization: {
      applied: publicSanitization.sanitizationApplied,
      actions: publicSanitization.actions,
      labels: publicSanitization.riskLabels,
      hasBlockingRisk: publicSanitization.hasBlockingRisk,
    },
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

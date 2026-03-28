import { parseAiRiskLevel, type RiskLevel } from "./moderation.js";
import { validatePublicHttpsUrl } from "./network-safety.js";

export type AiEndpointType = "responses" | "completions";

export type AiReviewConfigResolved = {
  baseUrl: string;
  apiKey: string;
  endpointType: AiEndpointType;
  model: string;
};

export type AiReviewCsvRow = {
  recordId: string;
  userId: string;
  username: string;
  moodPhrase: string;
  quote: string | null;
  description: string | null;
  tags: string[];
  createdAt: string;
};

export type AiStrictReviewRow = {
  recordId: string;
  userId: string;
  username: string;
  moodPhrase: string;
  normalizedMoodPhrase: string;
  quote: string | null;
  description: string | null;
  tags: string[];
  extraEmotions: string[];
  occurredAt: string | null;
  locationHint: string | null;
  normalizationFlags: string[];
  isCustomMood: boolean;
};

export type ParsedAiDecision = {
  recordId: string;
  riskLevel: RiskLevel;
  riskLabels: string[];
  reason: string;
  rawItem: Record<string, unknown>;
};

export type ParsedAiStrictDecision = ParsedAiDecision & {
  customMoodSafe: boolean;
  suggestedAction: "allow" | "allow_with_sanitization" | "manual_review_required" | "reject";
  evasionDetected: boolean;
  adLikeDetected: boolean;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAiReviewCsv(rows: AiReviewCsvRow[]): string {
  const head = "record_id,user_id,username,mood_phrase,quote,description,tags,created_at";
  const body = rows.map((row) => {
    const cols = [
      row.recordId,
      row.userId,
      row.username,
      row.moodPhrase,
      row.quote ?? "",
      row.description ?? "",
      row.tags.join("|"),
      row.createdAt,
    ];
    return cols.map((col) => csvEscape(col)).join(",");
  });
  return [head, ...body].join("\n");
}

function buildPrompt(csv: string): string {
  return [
    "你是内容审核助手。",
    "输入是 CSV，每行一条公开文本申请。",
    "请只返回 JSON 数组，不要返回其他解释。",
    "每项结构：{record_id,risk_level,risk_labels,reason}",
    "risk_level 仅允许: very_low, low, medium, elevated, high, very_high 或对应中文极低/低/中/较高/高/极高。",
    "risk_labels 为字符串数组，reason 为简要原因。",
    "以下是 CSV：",
    csv,
  ].join("\n");
}

export function buildStrictReviewPayload(rows: AiStrictReviewRow[]): string {
  const jsonRows = rows.map((row) => ({
    record_id: row.recordId,
    user_id: row.userId,
    username: row.username,
    mood_phrase: row.moodPhrase,
    normalized_mood_phrase: row.normalizedMoodPhrase,
    quote: row.quote,
    description: row.description,
    tags: row.tags,
    extra_emotions: row.extraEmotions,
    occurred_at: row.occurredAt,
    location_hint: row.locationHint,
    normalization_flags: row.normalizationFlags,
    is_custom_mood: row.isCustomMood,
  }));

  return [
    "你是内容安全与合规审核助手。",
    "输入是 JSON 数组，每项为一条待审核记录（可能包含自定义情绪）。",
    "",
    "审核目标：",
    "1. 判断自定义情绪是否安全（非暴力、非涉政、非广告、非色情）",
    "2. 判断是否存在广告/引流/联系方式导流",
    "3. 判断是否存在谐音、拼凑、零宽字符等规避式写法",
    "4. 判断公开文本是否需要脱敏或拦截",
    "5. 特别注意 normalization_flags 不为空的记录——它们已被系统标记为疑似规避",
    "",
    "请只返回 JSON 数组，不要返回其他解释。",
    "每项结构：",
    "{",
    '  "record_id": "...",',
    '  "risk_level": "very_low|low|medium|elevated|high|very_high",',
    '  "risk_labels": ["..."],',
    '  "reason": "简要中文原因",',
    '  "custom_mood_safe": true|false,',
    '  "suggested_action": "allow|allow_with_sanitization|manual_review_required|reject",',
    '  "evasion_detected": true|false,',
    '  "ad_like_detected": true|false',
    "}",
    "",
    "以下是待审核数据：",
    JSON.stringify(jsonRows, null, 2),
  ].join("\n");
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function validateAiBaseUrl(raw: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const validated = validatePublicHttpsUrl(raw);
  if (!validated.ok) {
    return validated;
  }
  return {
    ok: true,
    normalized: trimTrailingSlash(validated.url.toString()),
  };
}

function extractJsonArray(text: string): unknown[] {
  const direct = JSON.parse(text) as unknown;
  if (Array.isArray(direct)) {
    return direct;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AI 返回中未找到 JSON 数组");
  }
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AI 返回 JSON 不是数组");
  }
  return parsed;
}

function extractTextFromPayload(endpointType: AiEndpointType, payload: unknown): string {
  const value = payload as Record<string, unknown>;

  if (endpointType === "responses") {
    if (typeof value.output_text === "string" && value.output_text.trim()) {
      return value.output_text;
    }
    const output = Array.isArray(value.output) ? value.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      const itemObj = item as Record<string, unknown>;
      const content = Array.isArray(itemObj.content) ? itemObj.content : [];
      for (const c of content) {
        const cObj = c as Record<string, unknown>;
        if (typeof cObj.text === "string") {
          chunks.push(cObj.text);
        }
      }
    }
    return chunks.join("\n").trim();
  }

  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = (choices[0] ?? {}) as Record<string, unknown>;
  const text = first.text;
  if (typeof text === "string") {
    return text.trim();
  }
  return "";
}

export function parseAiDecisions(rawText: string): ParsedAiDecision[] {
  const rows = extractJsonArray(rawText);

  const parsed: ParsedAiDecision[] = [];
  for (const item of rows) {
    const row = (item ?? {}) as Record<string, unknown>;
    const recordId = typeof row.record_id === "string" ? row.record_id : "";
    const riskLevelRaw = typeof row.risk_level === "string" ? row.risk_level : "";
    const mapped = parseAiRiskLevel(riskLevelRaw);

    if (!recordId || !mapped) {
      continue;
    }

    parsed.push({
      recordId,
      riskLevel: mapped,
      riskLabels: Array.isArray(row.risk_labels)
        ? row.risk_labels.filter((label): label is string => typeof label === "string")
        : [],
      reason: typeof row.reason === "string" ? row.reason : "",
      rawItem: row,
    });
  }

  return parsed;
}

export function parseStrictAiDecisions(rawText: string): ParsedAiStrictDecision[] {
  const rows = extractJsonArray(rawText);

  const parsed: ParsedAiStrictDecision[] = [];
  for (const item of rows) {
    const row = (item ?? {}) as Record<string, unknown>;
    const recordId = typeof row.record_id === "string" ? row.record_id : "";
    const riskLevelRaw = typeof row.risk_level === "string" ? row.risk_level : "";
    const mapped = parseAiRiskLevel(riskLevelRaw);

    if (!recordId || !mapped) {
      continue;
    }

    const suggestedActionRaw = typeof row.suggested_action === "string" ? row.suggested_action : "";
    const validActions = new Set(["allow", "allow_with_sanitization", "manual_review_required", "reject"]);
    const suggestedAction = validActions.has(suggestedActionRaw)
      ? (suggestedActionRaw as ParsedAiStrictDecision["suggestedAction"])
      : "manual_review_required";

    parsed.push({
      recordId,
      riskLevel: mapped,
      riskLabels: Array.isArray(row.risk_labels)
        ? row.risk_labels.filter((label): label is string => typeof label === "string")
        : [],
      reason: typeof row.reason === "string" ? row.reason : "",
      rawItem: row,
      customMoodSafe: row.custom_mood_safe === true,
      suggestedAction,
      evasionDetected: row.evasion_detected === true,
      adLikeDetected: row.ad_like_detected === true,
    });
  }

  return parsed;
}

export async function callAiReview(config: AiReviewConfigResolved, csv: string): Promise<{
  requestBody: Record<string, unknown>;
  responsePayload: unknown;
  responseText: string;
  decisions: ParsedAiDecision[];
}> {
  const check = validateAiBaseUrl(config.baseUrl);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const prompt = buildPrompt(csv);
  const endpoint = `${check.normalized}/${config.endpointType}`;

  const requestBody: Record<string, unknown> =
    config.endpointType === "responses"
      ? {
          model: config.model,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: prompt }],
            },
          ],
          temperature: 0,
        }
      : {
          model: config.model,
          prompt,
          temperature: 0,
          max_tokens: 1200,
        };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const responsePayload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(`AI 接口请求失败: ${response.status}`);
  }

  const responseText = extractTextFromPayload(config.endpointType, responsePayload);
  if (!responseText) {
    throw new Error("AI 接口未返回可解析文本");
  }

  const decisions = parseAiDecisions(responseText);

  return {
    requestBody,
    responsePayload,
    responseText,
    decisions,
  };
}

export async function callAiStrictReview(config: AiReviewConfigResolved, rows: AiStrictReviewRow[]): Promise<{
  requestBody: Record<string, unknown>;
  responsePayload: unknown;
  responseText: string;
  decisions: ParsedAiStrictDecision[];
}> {
  const check = validateAiBaseUrl(config.baseUrl);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const prompt = buildStrictReviewPayload(rows);
  const endpoint = `${check.normalized}/${config.endpointType}`;

  const requestBody: Record<string, unknown> =
    config.endpointType === "responses"
      ? {
          model: config.model,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: prompt }],
            },
          ],
          temperature: 0,
        }
      : {
          model: config.model,
          prompt,
          temperature: 0,
          max_tokens: 2400,
        };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const responsePayload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(`AI 严格审核接口请求失败: ${response.status}`);
  }

  const responseText = extractTextFromPayload(config.endpointType, responsePayload);
  if (!responseText) {
    throw new Error("AI 严格审核接口未返回可解析文本");
  }

  const decisions = parseStrictAiDecisions(responseText);

  return {
    requestBody,
    responsePayload,
    responseText,
    decisions,
  };
}

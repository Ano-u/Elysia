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

export type ParsedAiDecision = {
  recordId: string;
  riskLevel: RiskLevel;
  riskLabels: string[];
  reason: string;
  rawItem: Record<string, unknown>;
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

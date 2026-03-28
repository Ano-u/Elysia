import { env } from "../config/env.js";
import type {
  AnalysisScope,
  AnalyzerEmbeddingResult,
  AnalyzerLinkCandidate,
  AnalyzerLinkResult,
  AnalyzerRecordPayload,
} from "./analysis.js";

type JsonObject = Record<string, unknown>;

async function postJson<T>(path: string, payload: JsonObject): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ANALYZER_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path, env.ANALYZER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.ANALYZER_INTERNAL_TOKEN ? { "x-analyzer-token": env.ANALYZER_INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Analyzer request failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestEmbeddings(args: {
  scope: AnalysisScope;
  records: AnalyzerRecordPayload[];
}): Promise<AnalyzerEmbeddingResult[]> {
  const response = await postJson<{ records: AnalyzerEmbeddingResult[] }>("/internal/analyzer/embed-batch", {
    scope: args.scope,
    records: args.records,
  });
  return response.records;
}

export async function requestLinks(args: {
  scope: AnalysisScope;
  source: AnalyzerEmbeddingResult & { createdAt: string };
  candidates: AnalyzerLinkCandidate[];
  maxLinks?: number;
}): Promise<AnalyzerLinkResult[]> {
  const response = await postJson<{ links: AnalyzerLinkResult[] }>("/internal/analyzer/link-batch", {
    scope: args.scope,
    source: args.source,
    candidates: args.candidates,
    maxLinks: args.maxLinks ?? 8,
  });
  return response.links;
}

export async function requestRecluster(args: {
  scope: AnalysisScope;
  clusterVersion: number;
  records: AnalyzerRecordPayload[];
}): Promise<{
  scope: AnalysisScope;
  clusterVersion: number;
  records: AnalyzerEmbeddingResult[];
}> {
  return postJson("/internal/analyzer/recluster-scope", {
    scope: args.scope,
    clusterVersion: args.clusterVersion,
    records: args.records,
  });
}

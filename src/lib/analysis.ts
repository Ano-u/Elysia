import type { AutoLinkingScope } from "./auto-linking.js";

import { env } from "../config/env.js";

export const PUBLIC_ANALYSIS_SCOPE = "public" as const;
export const SHARED_LINK_SCOPE = "shared" as const;
export const ANALYSIS_LINK_TYPES = ["semantic", "resonance", "time"] as const;

export type AnalysisScope = typeof PUBLIC_ANALYSIS_SCOPE | `personal:${string}`;
export type AnalysisLoadState = "BUSY" | "NORMAL" | "IDLE";
export type AnalysisSentimentPolarity = "positive" | "neutral" | "negative";
export type AnalysisLinkType = (typeof ANALYSIS_LINK_TYPES)[number];

export type RecordAnalysisSource = {
  recordId: string;
  userId: string;
  moodPhrase: string;
  quote: string | null;
  description: string | null;
  tags: string[];
  extraEmotions: string[];
  customMoodPhrase: string | null;
  createdAt: string;
  isPublic: boolean;
  publicationStatus: string;
};

export type AnalyzerRecordPayload = {
  recordId: string;
  moodPhrase: string;
  quote: string | null;
  description: string | null;
  tags: string[];
  extraEmotions: string[];
  customMoodPhrase: string | null;
  createdAt: string;
  isPublic: boolean;
};

export type AnalyzerEmbeddingResult = {
  recordId: string;
  modelName: string;
  vector: number[];
  topicId: string | null;
  topicLabel: string | null;
  moodLabels: string[];
  sentimentPolarity: AnalysisSentimentPolarity;
  coordX: number | null;
  coordY: number | null;
  analysisVersion: string;
};

export type AnalyzerLinkCandidate = {
  recordId: string;
  createdAt: string;
  vector: number[];
  topicId: string | null;
  moodLabels: string[];
};

export type AnalyzerLinkResult = {
  targetRecordId: string;
  linkType: AnalysisLinkType;
  strength: number;
  linkReason: string;
};

export type AnalysisLoadSnapshot = {
  loadAverage1m: number;
  availableParallelism: number;
  freeMemBytes: number;
  apiP95Ms: number;
  recentRequestCount: number;
};

export function isAnalysisEnabled(): boolean {
  return env.ANALYSIS_ENABLED;
}

export function isAnalysisClusteringEnabled(): boolean {
  return env.ANALYSIS_ENABLED && env.ANALYSIS_CLUSTERING_ENABLED;
}

export function personalAnalysisScope(userId: string): AnalysisScope {
  return `personal:${userId}`;
}

export function isPersonalAnalysisScope(scope: string): scope is `personal:${string}` {
  return scope.startsWith("personal:");
}

export function ownerUserIdFromScope(scope: AnalysisScope): string | null {
  return isPersonalAnalysisScope(scope) ? scope.slice("personal:".length) : null;
}

export function normalizeAnalysisText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function buildAnalysisText(source: RecordAnalysisSource): string {
  return normalizeAnalysisText([
    source.moodPhrase,
    source.quote,
    source.description,
    source.tags.join(" "),
    source.extraEmotions.join(" "),
    source.customMoodPhrase,
  ]);
}

export function mergeMoodSignals(extraEmotions: string[], customMoodPhrase: string | null): string[] {
  const deduped = new Set<string>();
  for (const emotion of extraEmotions) {
    const cleaned = emotion.trim();
    if (cleaned) {
      deduped.add(cleaned);
    }
  }
  const cleanedCustom = customMoodPhrase?.trim();
  if (cleanedCustom) {
    deduped.add(cleanedCustom);
  }
  return Array.from(deduped).slice(0, 3);
}

export function mapRecordToAnalyzerPayload(source: RecordAnalysisSource): AnalyzerRecordPayload {
  return {
    recordId: source.recordId,
    moodPhrase: source.moodPhrase,
    quote: source.quote,
    description: source.description,
    tags: source.tags,
    extraEmotions: source.extraEmotions,
    customMoodPhrase: source.customMoodPhrase,
    createdAt: source.createdAt,
    isPublic: source.isPublic,
  };
}

export function resolveAutoAnalysisScopes(args: {
  autoLinkingEnabled: boolean;
  autoLinkingScope: AutoLinkingScope;
  userId: string;
  isPublicVisible: boolean;
}): AnalysisScope[] {
  if (!args.autoLinkingEnabled) {
    return [];
  }

  const scopes: AnalysisScope[] = [personalAnalysisScope(args.userId)];
  if (args.autoLinkingScope === "public_recommendation" && args.isPublicVisible) {
    scopes.push(PUBLIC_ANALYSIS_SCOPE);
  }
  return scopes;
}

export function resolveMindMapLinkScopes(args: {
  ownerUserId: string;
  requesterUserId: string;
  includePublicScope?: boolean;
}): string[] {
  const scopes: string[] = [SHARED_LINK_SCOPE];
  if (args.ownerUserId === args.requesterUserId) {
    scopes.push(personalAnalysisScope(args.ownerUserId));
  } else if (args.includePublicScope !== false) {
    scopes.push(PUBLIC_ANALYSIS_SCOPE);
  }
  return scopes;
}

export function determineAnalysisLoadState(snapshot: AnalysisLoadSnapshot, idleFreeMemBytes: number): AnalysisLoadState {
  const normalizedLoad =
    snapshot.availableParallelism > 0 ? snapshot.loadAverage1m / snapshot.availableParallelism : 0;

  if (normalizedLoad >= 0.7 || snapshot.apiP95Ms > 250) {
    return "BUSY";
  }

  if (
    normalizedLoad < 0.4 &&
    snapshot.freeMemBytes > idleFreeMemBytes &&
    snapshot.recentRequestCount < 120
  ) {
    return "IDLE";
  }

  return "NORMAL";
}

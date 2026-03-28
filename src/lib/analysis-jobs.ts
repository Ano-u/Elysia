import { query } from "./db.js";
import { analysisBackfillQueue, analysisReclusterQueue, embeddingQueue } from "./queue.js";
import {
  PUBLIC_ANALYSIS_SCOPE,
  isAnalysisClusteringEnabled,
  isAnalysisEnabled,
  resolveAutoAnalysisScopes,
  type AnalysisScope,
} from "./analysis.js";
import { loadAutoLinkingPreferenceForAnalysis } from "./analysis-store.js";

export type LightAnalysisJob =
  | { kind: "analyze_record"; scope: AnalysisScope; recordId: string }
  | { kind: "remove_record"; scope: AnalysisScope; recordId: string };

export type ScopeMaintenanceJob =
  | { kind: "scope_backfill"; scope: AnalysisScope }
  | { kind: "scope_recluster"; scope: AnalysisScope };

export async function enqueueRecordAnalysis(args: {
  recordId: string;
  userId: string;
  isPublicVisible: boolean;
}): Promise<void> {
  if (!isAnalysisEnabled()) {
    return;
  }

  const preference = await loadAutoLinkingPreferenceForAnalysis(args.userId);
  const scopes = resolveAutoAnalysisScopes({
    autoLinkingEnabled: preference.enabled,
    autoLinkingScope: preference.scope,
    userId: args.userId,
    isPublicVisible: args.isPublicVisible,
  });

  await Promise.all(
    scopes.map((scope) =>
      embeddingQueue.add(
        "analyze-record",
        {
          kind: "analyze_record",
          scope,
          recordId: args.recordId,
        } satisfies LightAnalysisJob,
        {
          jobId: `analysis:${scope}:${args.recordId}`,
          removeOnComplete: 500,
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 },
        },
      ),
    ),
  );
}

export async function enqueueRecordRemoval(args: {
  recordId: string;
  userId: string;
}): Promise<void> {
  if (!isAnalysisEnabled()) {
    return;
  }

  const scopes: AnalysisScope[] = [PUBLIC_ANALYSIS_SCOPE, `personal:${args.userId}`];
  await Promise.all(
    scopes.map((scope) =>
      embeddingQueue.add(
        "remove-record",
        {
          kind: "remove_record",
          scope,
          recordId: args.recordId,
        } satisfies LightAnalysisJob,
        {
          jobId: `analysis-remove:${scope}:${args.recordId}`,
          removeOnComplete: 500,
          removeOnFail: 1000,
          attempts: 2,
          backoff: { type: "exponential", delay: 1_000 },
        },
      ),
    ),
  );
}

export async function enqueueScopeBackfill(scope: AnalysisScope): Promise<void> {
  if (!isAnalysisClusteringEnabled()) {
    return;
  }

  await analysisBackfillQueue.add(
    "scope-backfill",
    {
      kind: "scope_backfill",
      scope,
    } satisfies ScopeMaintenanceJob,
    {
      jobId: `analysis-backfill:${scope}`,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );
}

export async function enqueueScopeRecluster(scope: AnalysisScope): Promise<void> {
  if (!isAnalysisClusteringEnabled()) {
    return;
  }

  await analysisReclusterQueue.add(
    "scope-recluster",
    {
      kind: "scope_recluster",
      scope,
    } satisfies ScopeMaintenanceJob,
    {
      jobId: `analysis-recluster:${scope}`,
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
    },
  );
}

export async function enqueueUserScopeRefresh(userId: string): Promise<void> {
  if (!isAnalysisClusteringEnabled()) {
    return;
  }

  const pref = await loadAutoLinkingPreferenceForAnalysis(userId);
  if (!pref.enabled) {
    return;
  }

  await enqueueScopeBackfill(`personal:${userId}`);
  if (pref.scope === "public_recommendation") {
    const hasPublic = await query<{ has_public: boolean }>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM records
          WHERE user_id = $1
            AND deleted_at IS NULL
            AND is_public = TRUE
            AND publication_status = 'published'
        ) AS has_public
      `,
      [userId],
    );
    if (hasPublic.rows[0]?.has_public) {
      await enqueueScopeBackfill(PUBLIC_ANALYSIS_SCOPE);
    }
  }
}

import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { query } from "./db.js";
import {
  ANALYSIS_LINK_TYPES,
  PUBLIC_ANALYSIS_SCOPE,
  isPersonalAnalysisScope,
  mapRecordToAnalyzerPayload,
  ownerUserIdFromScope,
  type AnalyzerLinkResult,
  type AnalysisScope,
  type AnalyzerEmbeddingResult,
  type RecordAnalysisSource,
} from "./analysis.js";
import type { AutoLinkingScope } from "./auto-linking.js";

type SqlExecutor = Pick<PoolClient, "query"> | {
  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type RecordAnalysisSourceRow = {
  record_id: string;
  user_id: string;
  mood_phrase: string;
  quote: string | null;
  description: string | null;
  tags: string[];
  extra_emotions: string[];
  custom_mood_phrase: string | null;
  created_at: string;
  is_public: boolean;
  publication_status: string;
};

type AutoLinkingPreferenceRow = {
  auto_linking_enabled: boolean;
  auto_linking_scope: AutoLinkingScope;
};

type AnalysisCandidateRow = {
  record_id: string;
  created_at: string;
  vector_json: number[];
  topic_id: string | null;
  mood_labels: string[];
};

type AnalysisControlRow = {
  cluster_version: number;
  last_backfill_at: string | null;
  last_recluster_at: string | null;
};

const dbExecutor: SqlExecutor = {
  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]) {
    return query<T>(sql, params ?? []);
  },
};

function runQuery<T extends QueryResultRow = any>(
  executor: SqlExecutor,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return (executor.query as any)(sql, params);
}

function mapRecordSource(row: RecordAnalysisSourceRow): RecordAnalysisSource {
  return {
    recordId: row.record_id,
    userId: row.user_id,
    moodPhrase: row.mood_phrase,
    quote: row.quote,
    description: row.description,
    tags: row.tags,
    extraEmotions: row.extra_emotions,
    customMoodPhrase: row.custom_mood_phrase,
    createdAt: row.created_at,
    isPublic: row.is_public,
    publicationStatus: row.publication_status,
  };
}

function eligibleScopeKind(scope: AnalysisScope): "public" | "personal" {
  return scope === PUBLIC_ANALYSIS_SCOPE ? "public" : "personal";
}

export async function ensureAnalysisControl(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; ownerUserId?: string | null },
): Promise<void> {
  await runQuery(
    executor,
    `
      INSERT INTO analysis_control (scope, scope_kind, owner_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (scope)
      DO UPDATE SET
        scope_kind = EXCLUDED.scope_kind,
        owner_user_id = EXCLUDED.owner_user_id,
        updated_at = NOW()
    `,
    [args.scope, eligibleScopeKind(args.scope), args.ownerUserId ?? ownerUserIdFromScope(args.scope)],
  );
}

export async function loadAutoLinkingPreferenceForAnalysis(userId: string): Promise<{
  enabled: boolean;
  scope: AutoLinkingScope;
}> {
  const rows = await query<AutoLinkingPreferenceRow>(
    `
      SELECT
        COALESCE(auto_linking_enabled, FALSE) AS auto_linking_enabled,
        COALESCE(auto_linking_scope, 'private_only') AS auto_linking_scope
      FROM user_preferences
      WHERE user_id = $1
    `,
    [userId],
  );

  return {
    enabled: rows.rows[0]?.auto_linking_enabled ?? false,
    scope: rows.rows[0]?.auto_linking_scope ?? "private_only",
  };
}

export async function loadScopedRecordSource(
  executor: SqlExecutor,
  args: { recordId: string; scope: AnalysisScope },
): Promise<RecordAnalysisSource | null> {
  if (args.scope === PUBLIC_ANALYSIS_SCOPE) {
    const rows = await runQuery<RecordAnalysisSourceRow>(
      executor,
      `
        SELECT
          r.id AS record_id,
          r.user_id,
          r.mood_phrase,
          rq.quote,
          r.description,
          COALESCE((
            SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
            FROM record_tags rt
            WHERE rt.record_id = r.id
          ), ARRAY[]::text[]) AS tags,
          COALESCE((
            SELECT ARRAY_AGG(re.emotion ORDER BY re.created_at ASC)
            FROM record_emotions re
            WHERE re.record_id = r.id
          ), ARRAY[]::text[]) AS extra_emotions,
          r.custom_mood_phrase,
          r.created_at,
          r.is_public,
          r.publication_status
        FROM records r
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE r.id = $1
          AND r.deleted_at IS NULL
          AND r.is_public = TRUE
          AND r.publication_status = 'published'
          AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
          AND COALESCE(up.auto_linking_scope, 'private_only') = 'public_recommendation'
        LIMIT 1
      `,
      [args.recordId],
    );
    return rows.rows[0] ? mapRecordSource(rows.rows[0]) : null;
  }

  const ownerUserId = ownerUserIdFromScope(args.scope);
  if (!ownerUserId) {
    return null;
  }

  const rows = await runQuery<RecordAnalysisSourceRow>(
    executor,
    `
      SELECT
        r.id AS record_id,
        r.user_id,
        r.mood_phrase,
        rq.quote,
        r.description,
        COALESCE((
          SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
          FROM record_tags rt
          WHERE rt.record_id = r.id
        ), ARRAY[]::text[]) AS tags,
        COALESCE((
          SELECT ARRAY_AGG(re.emotion ORDER BY re.created_at ASC)
          FROM record_emotions re
          WHERE re.record_id = r.id
        ), ARRAY[]::text[]) AS extra_emotions,
        r.custom_mood_phrase,
        r.created_at,
        r.is_public,
        r.publication_status
      FROM records r
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      LEFT JOIN user_preferences up ON up.user_id = r.user_id
      WHERE r.id = $1
        AND r.user_id = $2
        AND r.deleted_at IS NULL
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
      LIMIT 1
    `,
    [args.recordId, ownerUserId],
  );
  return rows.rows[0] ? mapRecordSource(rows.rows[0]) : null;
}

export async function loadScopeCandidateEmbeddings(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; sourceRecordId: string },
): Promise<AnalysisCandidateRow[]> {
  if (args.scope === PUBLIC_ANALYSIS_SCOPE) {
    const rows = await runQuery<AnalysisCandidateRow>(
      executor,
      `
        SELECT
          re.record_id,
          r.created_at,
          re.vector_json::jsonb AS vector_json,
          ra.topic_id,
          COALESCE(ra.mood_labels, ARRAY[]::text[]) AS mood_labels
        FROM record_embeddings re
        JOIN records r ON r.id = re.record_id
        LEFT JOIN record_analysis ra
          ON ra.record_id = re.record_id
         AND ra.scope = re.scope
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE re.scope = $1
          AND re.record_id <> $2
          AND r.deleted_at IS NULL
          AND r.is_public = TRUE
          AND r.publication_status = 'published'
          AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
          AND COALESCE(up.auto_linking_scope, 'private_only') = 'public_recommendation'
        ORDER BY COALESCE(ra.updated_at, re.updated_at) DESC, r.created_at DESC
        LIMIT 600
      `,
      [args.scope, args.sourceRecordId],
    );
    return rows.rows;
  }

  const ownerUserId = ownerUserIdFromScope(args.scope);
  if (!ownerUserId) {
    return [];
  }

  const rows = await runQuery<AnalysisCandidateRow>(
    executor,
    `
      SELECT
        re.record_id,
        r.created_at,
        re.vector_json::jsonb AS vector_json,
        ra.topic_id,
        COALESCE(ra.mood_labels, ARRAY[]::text[]) AS mood_labels
      FROM record_embeddings re
      JOIN records r ON r.id = re.record_id
      LEFT JOIN record_analysis ra
        ON ra.record_id = re.record_id
       AND ra.scope = re.scope
      LEFT JOIN user_preferences up ON up.user_id = r.user_id
      WHERE re.scope = $1
        AND re.record_id <> $2
        AND r.user_id = $3
        AND r.deleted_at IS NULL
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
      ORDER BY r.created_at DESC
      LIMIT 5000
    `,
    [args.scope, args.sourceRecordId, ownerUserId],
  );
  return rows.rows;
}

export async function upsertEmbeddingAndAnalysis(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; result: AnalyzerEmbeddingResult; ownerUserId?: string | null },
): Promise<void> {
  await ensureAnalysisControl(executor, {
    scope: args.scope,
    ownerUserId: args.ownerUserId ?? null,
  });

  await runQuery(
    executor,
    `
      INSERT INTO record_embeddings (record_id, scope, model_name, vector_json, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (record_id, scope)
      DO UPDATE SET
        model_name = EXCLUDED.model_name,
        vector_json = EXCLUDED.vector_json,
        updated_at = NOW()
    `,
    [args.result.recordId, args.scope, args.result.modelName, JSON.stringify(args.result.vector)],
  );

  await runQuery(
    executor,
    `
      INSERT INTO record_analysis (
        record_id,
        scope,
        topic_id,
        topic_label,
        mood_labels,
        sentiment_polarity,
        coord_x,
        coord_y,
        analysis_version,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9, NOW())
      ON CONFLICT (record_id, scope)
      DO UPDATE SET
        topic_id = EXCLUDED.topic_id,
        topic_label = EXCLUDED.topic_label,
        mood_labels = EXCLUDED.mood_labels,
        sentiment_polarity = EXCLUDED.sentiment_polarity,
        coord_x = EXCLUDED.coord_x,
        coord_y = EXCLUDED.coord_y,
        analysis_version = EXCLUDED.analysis_version,
        updated_at = NOW()
    `,
    [
      args.result.recordId,
      args.scope,
      args.result.topicId,
      args.result.topicLabel,
      args.result.moodLabels,
      args.result.sentimentPolarity,
      args.result.coordX,
      args.result.coordY,
      args.result.analysisVersion,
    ],
  );
}

export async function deleteScopeArtifactsForRecord(
  executor: SqlExecutor,
  args: { recordId: string; scope: AnalysisScope },
): Promise<void> {
  await runQuery(
    executor,
    `
      DELETE FROM record_links
      WHERE scope = $1
        AND (source_record_id = $2 OR target_record_id = $2)
        AND link_type = ANY($3::text[])
    `,
    [args.scope, args.recordId, Array.from(ANALYSIS_LINK_TYPES)],
  );

  await runQuery(
    executor,
    `
      DELETE FROM record_analysis
      WHERE record_id = $1
        AND scope = $2
    `,
    [args.recordId, args.scope],
  );

  await runQuery(
    executor,
    `
      DELETE FROM record_embeddings
      WHERE record_id = $1
        AND scope = $2
    `,
    [args.recordId, args.scope],
  );
}

export async function syncAutomaticLinks(
  executor: SqlExecutor,
  args: { sourceRecordId: string; scope: AnalysisScope; links: AnalyzerLinkResult[] },
): Promise<void> {
  await runQuery(
    executor,
    `
      DELETE FROM record_links
      WHERE source_record_id = $1
        AND scope = $2
        AND link_type = ANY($3::text[])
    `,
    [args.sourceRecordId, args.scope, Array.from(ANALYSIS_LINK_TYPES)],
  );

  for (const link of args.links) {
    await runQuery(
      executor,
      `
        INSERT INTO record_links (
          source_record_id,
          target_record_id,
          link_type,
          strength,
          created_by,
          scope
        )
        VALUES ($1, $2, $3, $4, NULL, $5)
        ON CONFLICT (source_record_id, target_record_id, link_type, scope)
        DO UPDATE SET
          strength = EXCLUDED.strength,
          created_at = NOW()
      `,
      [args.sourceRecordId, link.targetRecordId, link.linkType, link.strength, args.scope],
    );
  }
}

export async function loadScopeControl(executor: SqlExecutor, scope: AnalysisScope): Promise<AnalysisControlRow | null> {
  const rows = await runQuery<AnalysisControlRow>(
    executor,
    `
      SELECT cluster_version, last_backfill_at, last_recluster_at
      FROM analysis_control
      WHERE scope = $1
      LIMIT 1
    `,
    [scope],
  );
  return rows.rows[0] ?? null;
}

export async function markScopeBackfill(executor: SqlExecutor, scope: AnalysisScope): Promise<void> {
  await ensureAnalysisControl(executor, { scope });
  await runQuery(
    executor,
    `
      UPDATE analysis_control
      SET last_backfill_at = NOW(), updated_at = NOW()
      WHERE scope = $1
    `,
    [scope],
  );
}

export async function markScopeRecluster(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; clusterVersion: number },
): Promise<void> {
  await ensureAnalysisControl(executor, { scope: args.scope });
  await runQuery(
    executor,
    `
      UPDATE analysis_control
      SET
        cluster_version = $2,
        last_recluster_at = NOW(),
        updated_at = NOW()
      WHERE scope = $1
    `,
    [args.scope, args.clusterVersion],
  );
}

export async function loadScopeBackfillRecordIds(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; limit: number },
): Promise<string[]> {
  if (args.scope === PUBLIC_ANALYSIS_SCOPE) {
    const rows = await runQuery<{ id: string }>(
      executor,
      `
        SELECT r.id
        FROM records r
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        LEFT JOIN record_embeddings re
          ON re.record_id = r.id
         AND re.scope = $1
        LEFT JOIN record_analysis ra
          ON ra.record_id = r.id
         AND ra.scope = $1
        WHERE r.deleted_at IS NULL
          AND r.is_public = TRUE
          AND r.publication_status = 'published'
          AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
          AND COALESCE(up.auto_linking_scope, 'private_only') = 'public_recommendation'
          AND (
            re.record_id IS NULL
            OR ra.record_id IS NULL
            OR r.updated_at > COALESCE(re.updated_at, TIMESTAMPTZ 'epoch')
            OR r.updated_at > COALESCE(ra.updated_at, TIMESTAMPTZ 'epoch')
          )
        ORDER BY r.updated_at DESC
        LIMIT $2
      `,
      [args.scope, args.limit],
    );
    return rows.rows.map((row) => row.id);
  }

  const ownerUserId = ownerUserIdFromScope(args.scope);
  if (!ownerUserId) {
    return [];
  }

  const rows = await runQuery<{ id: string }>(
    executor,
    `
      SELECT r.id
      FROM records r
      LEFT JOIN user_preferences up ON up.user_id = r.user_id
      LEFT JOIN record_embeddings re
        ON re.record_id = r.id
       AND re.scope = $1
      LEFT JOIN record_analysis ra
        ON ra.record_id = r.id
       AND ra.scope = $1
      WHERE r.deleted_at IS NULL
        AND r.user_id = $2
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
        AND (
          re.record_id IS NULL
          OR ra.record_id IS NULL
          OR r.updated_at > COALESCE(re.updated_at, TIMESTAMPTZ 'epoch')
          OR r.updated_at > COALESCE(ra.updated_at, TIMESTAMPTZ 'epoch')
        )
      ORDER BY r.updated_at DESC
      LIMIT $3
    `,
    [args.scope, ownerUserId, args.limit],
  );
  return rows.rows.map((row) => row.id);
}

export async function loadScopeRecordsForRecluster(
  executor: SqlExecutor,
  args: { scope: AnalysisScope },
): Promise<RecordAnalysisSource[]> {
  if (args.scope === PUBLIC_ANALYSIS_SCOPE) {
    const rows = await runQuery<RecordAnalysisSourceRow>(
      executor,
      `
        SELECT
          r.id AS record_id,
          r.user_id,
          r.mood_phrase,
          rq.quote,
          r.description,
          COALESCE((
            SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
            FROM record_tags rt
            WHERE rt.record_id = r.id
          ), ARRAY[]::text[]) AS tags,
          COALESCE((
            SELECT ARRAY_AGG(re.emotion ORDER BY re.created_at ASC)
            FROM record_emotions re
            WHERE re.record_id = r.id
          ), ARRAY[]::text[]) AS extra_emotions,
          r.custom_mood_phrase,
          r.created_at,
          r.is_public,
          r.publication_status
        FROM records r
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE r.deleted_at IS NULL
          AND r.is_public = TRUE
          AND r.publication_status = 'published'
          AND r.created_at >= NOW() - INTERVAL '120 days'
          AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
          AND COALESCE(up.auto_linking_scope, 'private_only') = 'public_recommendation'
        ORDER BY r.created_at DESC
      `,
    );
    return rows.rows.map(mapRecordSource);
  }

  const ownerUserId = ownerUserIdFromScope(args.scope);
  if (!ownerUserId) {
    return [];
  }

  const rows = await runQuery<RecordAnalysisSourceRow>(
    executor,
    `
      SELECT
        r.id AS record_id,
        r.user_id,
        r.mood_phrase,
        rq.quote,
        r.description,
        COALESCE((
          SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
          FROM record_tags rt
          WHERE rt.record_id = r.id
        ), ARRAY[]::text[]) AS tags,
        COALESCE((
          SELECT ARRAY_AGG(re.emotion ORDER BY re.created_at ASC)
          FROM record_emotions re
          WHERE re.record_id = r.id
        ), ARRAY[]::text[]) AS extra_emotions,
        r.custom_mood_phrase,
        r.created_at,
        r.is_public,
        r.publication_status
      FROM records r
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      LEFT JOIN user_preferences up ON up.user_id = r.user_id
      WHERE r.deleted_at IS NULL
        AND r.user_id = $1
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
      ORDER BY r.created_at DESC
      LIMIT 5000
    `,
    [ownerUserId],
  );
  return rows.rows.map(mapRecordSource);
}

export async function cleanupScopeArtifacts(executor: SqlExecutor, scope: AnalysisScope): Promise<void> {
  if (scope === PUBLIC_ANALYSIS_SCOPE) {
    await runQuery(
      executor,
      `
        DELETE FROM record_links rl
        USING records r
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE rl.source_record_id = r.id
          AND rl.scope = $1
          AND rl.link_type = ANY($2::text[])
          AND (
            r.deleted_at IS NOT NULL
            OR r.is_public = FALSE
            OR r.publication_status <> 'published'
            OR COALESCE(up.auto_linking_enabled, FALSE) = FALSE
            OR COALESCE(up.auto_linking_scope, 'private_only') <> 'public_recommendation'
          )
      `,
      [scope, Array.from(ANALYSIS_LINK_TYPES)],
    );
    await runQuery(
      executor,
      `
        DELETE FROM record_analysis ra
        USING records r
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE ra.record_id = r.id
          AND ra.scope = $1
          AND (
            r.deleted_at IS NOT NULL
            OR r.is_public = FALSE
            OR r.publication_status <> 'published'
            OR COALESCE(up.auto_linking_enabled, FALSE) = FALSE
            OR COALESCE(up.auto_linking_scope, 'private_only') <> 'public_recommendation'
          )
      `,
      [scope],
    );
    await runQuery(
      executor,
      `
        DELETE FROM record_embeddings re
        USING records r
        LEFT JOIN user_preferences up ON up.user_id = r.user_id
        WHERE re.record_id = r.id
          AND re.scope = $1
          AND (
            r.deleted_at IS NOT NULL
            OR r.is_public = FALSE
            OR r.publication_status <> 'published'
            OR COALESCE(up.auto_linking_enabled, FALSE) = FALSE
            OR COALESCE(up.auto_linking_scope, 'private_only') <> 'public_recommendation'
          )
      `,
      [scope],
    );
    return;
  }

  const ownerUserId = ownerUserIdFromScope(scope);
  if (!ownerUserId) {
    return;
  }

  await runQuery(
    executor,
    `
      DELETE FROM record_links
      WHERE scope = $1
        AND link_type = ANY($2::text[])
        AND (
          source_record_id IN (
            SELECT r.id
            FROM records r
            LEFT JOIN user_preferences up ON up.user_id = r.user_id
            WHERE r.user_id = $3
              AND (
                r.deleted_at IS NOT NULL
                OR COALESCE(up.auto_linking_enabled, FALSE) = FALSE
              )
          )
          OR target_record_id IN (
            SELECT r.id
            FROM records r
            LEFT JOIN user_preferences up ON up.user_id = r.user_id
            WHERE r.user_id = $3
              AND (
                r.deleted_at IS NOT NULL
                OR COALESCE(up.auto_linking_enabled, FALSE) = FALSE
              )
          )
        )
    `,
    [scope, Array.from(ANALYSIS_LINK_TYPES), ownerUserId],
  );
}

export async function loadRecentApiMetrics(minutes = 3): Promise<{
  apiP95Ms: number;
  recentRequestCount: number;
}> {
  const rows = await query<{ api_p95_ms: string | null; recent_request_count: string | null }>(
    `
      SELECT
        COALESCE(MAX(p95_latency_ms), 0)::text AS api_p95_ms,
        COALESCE(SUM(requests), 0)::text AS recent_request_count
      FROM endpoint_minute_stats
      WHERE minute_at >= NOW() - ($1::int * INTERVAL '1 minute')
    `,
    [minutes],
  );

  return {
    apiP95Ms: Number(rows.rows[0]?.api_p95_ms ?? "0"),
    recentRequestCount: Number(rows.rows[0]?.recent_request_count ?? "0"),
  };
}

export async function listScopesMissingBackfill(limitPerKind = 2): Promise<AnalysisScope[]> {
  const publicMissing = await loadScopeBackfillRecordIds(dbExecutor, {
    scope: PUBLIC_ANALYSIS_SCOPE,
    limit: 1,
  });

  const scopes: AnalysisScope[] = [];
  if (publicMissing.length > 0) {
    scopes.push(PUBLIC_ANALYSIS_SCOPE);
  }

  const personalRows = await query<{ user_id: string }>(
    `
      SELECT DISTINCT r.user_id
      FROM records r
      LEFT JOIN user_preferences up ON up.user_id = r.user_id
      LEFT JOIN record_analysis ra
        ON ra.record_id = r.id
       AND ra.scope = CONCAT('personal:', r.user_id::text)
      LEFT JOIN record_embeddings re
        ON re.record_id = r.id
       AND re.scope = CONCAT('personal:', r.user_id::text)
      WHERE r.deleted_at IS NULL
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
        AND (
          ra.record_id IS NULL
          OR re.record_id IS NULL
          OR r.updated_at > COALESCE(ra.updated_at, TIMESTAMPTZ 'epoch')
          OR r.updated_at > COALESCE(re.updated_at, TIMESTAMPTZ 'epoch')
        )
      ORDER BY r.user_id
      LIMIT $1
    `,
    [limitPerKind],
  );

  for (const row of personalRows.rows) {
    scopes.push(`personal:${row.user_id}`);
  }

  return scopes;
}

export async function listScopesDueForRecluster(args: {
  publicIntervalMinutes: number;
  personalIntervalMinutes: number;
  limitPersonal: number;
}): Promise<AnalysisScope[]> {
  const scopes: AnalysisScope[] = [];
  const publicDue = await query<{ scope: string }>(
    `
      SELECT scope
      FROM analysis_control
      WHERE scope = 'public'
        AND (
          last_recluster_at IS NULL
          OR last_recluster_at < NOW() - ($1::int * INTERVAL '1 minute')
        )
      LIMIT 1
    `,
    [args.publicIntervalMinutes],
  );
  if (publicDue.rowCount === 1) {
    scopes.push(PUBLIC_ANALYSIS_SCOPE);
  }

  const personalDue = await query<{ scope: string }>(
    `
      SELECT ac.scope
      FROM analysis_control ac
      JOIN user_preferences up ON up.user_id = ac.owner_user_id
      WHERE ac.scope_kind = 'personal'
        AND COALESCE(up.auto_linking_enabled, FALSE) = TRUE
        AND (
          ac.last_recluster_at IS NULL
          OR ac.last_recluster_at < NOW() - ($1::int * INTERVAL '1 minute')
        )
      ORDER BY COALESCE(ac.last_recluster_at, TIMESTAMPTZ 'epoch') ASC
      LIMIT $2
    `,
    [args.personalIntervalMinutes, args.limitPersonal],
  );
  for (const row of personalDue.rows) {
    if (isPersonalAnalysisScope(row.scope)) {
      scopes.push(row.scope);
    }
  }

  return scopes;
}

export async function replaceScopeAnalyses(
  executor: SqlExecutor,
  args: { scope: AnalysisScope; records: AnalyzerEmbeddingResult[] },
): Promise<void> {
  await cleanupScopeArtifacts(executor, args.scope);
  for (const record of args.records) {
    await upsertEmbeddingAndAnalysis(executor, {
      scope: args.scope,
      result: record,
    });
  }
}

export function toAnalyzerPayloads(records: RecordAnalysisSource[]) {
  return records.map(mapRecordToAnalyzerPayload);
}

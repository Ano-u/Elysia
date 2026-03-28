import type { PoolClient, QueryResult, QueryResultRow } from "pg";

type SqlExecutor = Pick<PoolClient, "query"> | {
  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

async function runQuery<T extends QueryResultRow = any>(
  client: SqlExecutor,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return (client.query as any)(sql, params);
}

export async function ensureRecordMindMapNodes(
  client: SqlExecutor,
  args: { ownerUserId: string; recordIds?: string[] },
): Promise<void> {
  const targetRecordIds = args.recordIds && args.recordIds.length > 0 ? Array.from(new Set(args.recordIds)) : null;

  await runQuery(
    client,
    `
      INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
      SELECT
        r.user_id,
        r.id,
        'record',
        r.mood_phrase,
        jsonb_build_object(
          'visibilityIntent', r.visibility_intent,
          'publicationStatus', r.publication_status,
          'moodMode', COALESCE(r.mood_mode, 'preset'),
          'customMoodPhrase', r.custom_mood_phrase
        )
      FROM records r
      WHERE r.user_id = $1
        AND ($2::uuid[] IS NULL OR r.id = ANY($2::uuid[]))
        AND NOT EXISTS (
          SELECT 1
          FROM mindmap_nodes mn
          WHERE mn.record_id = r.id
            AND mn.node_type = 'record'
        )
    `,
    [args.ownerUserId, targetRecordIds],
  );
}

export async function syncRecordMindMapNode(
  client: SqlExecutor,
  args: { ownerUserId: string; recordId: string },
): Promise<string | null> {
  await ensureRecordMindMapNodes(client, {
    ownerUserId: args.ownerUserId,
    recordIds: [args.recordId],
  });

  await runQuery(
    client,
    `
      UPDATE mindmap_nodes mn
      SET
        label = r.mood_phrase,
        payload = COALESCE(mn.payload, '{}'::jsonb) || jsonb_build_object(
          'visibilityIntent', r.visibility_intent,
          'publicationStatus', r.publication_status,
          'moodMode', COALESCE(r.mood_mode, 'preset'),
          'customMoodPhrase', r.custom_mood_phrase
        )
      FROM records r
      WHERE mn.record_id = r.id
        AND mn.node_type = 'record'
        AND r.id = $1
        AND r.user_id = $2
    `,
    [args.recordId, args.ownerUserId],
  );

  const node = await runQuery<{ id: string }>(
    client,
    `
      SELECT id
      FROM mindmap_nodes
      WHERE record_id = $1
        AND node_type = 'record'
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [args.recordId],
  );

  return node.rows[0]?.id ?? null;
}

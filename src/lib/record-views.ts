import type { PoolClient, QueryResult, QueryResultRow } from "pg";

type Queryable = {
  query<T extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

async function runQuery<T extends QueryResultRow = any>(
  queryable: Queryable | Pick<PoolClient, "query">,
  sql: string,
  params: unknown[],
): Promise<QueryResult<T>> {
  return (queryable.query as any)(sql, params);
}

export type RecordSummaryRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  display_mood_phrase: string | null;
  description: string | null;
  public_description: string | null;
  is_public: boolean;
  visibility_intent: string;
  publication_status: string;
  publish_requested_at: string | null;
  published_at: string | null;
  risk_summary: unknown;
  review_notes: string | null;
  occurred_at: string | null;
  public_occurred_at: string | null;
  location_id: string | null;
  public_location_label: string | null;
  edit_deadline_at: string;
  created_at: string;
  updated_at: string;
  source_record_id: string | null;
  source_comment_id: string | null;
  quote: string | null;
  public_quote: string | null;
  extra_emotions: string[];
  tags: string[];
  display_name: string;
  avatar_url: string | null;
};

type ReplyMetaRow = {
  content: string;
  parent_record_id: string;
  root_record_id: string;
};

type ReplyTargetRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  display_mood_phrase: string | null;
  quote: string | null;
  public_quote: string | null;
  is_public: boolean;
  publication_status: string;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
};

export type ReplyTargetPayload = {
  id: string;
  moodPhrase: string;
  quote: string | null;
  createdAt: string;
  isPublic: boolean;
  publicationStatus: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type ReplyContextPayload = {
  content: string;
  parentRecordId: string;
  rootRecordId: string;
  parentTarget: ReplyTargetPayload | null;
  rootTarget: ReplyTargetPayload | null;
};

function pickVisibleText<T>(args: { requesterOwnsRecord: boolean; raw: T; publicValue: T | null }): T {
  if (args.requesterOwnsRecord) {
    return args.raw;
  }
  return args.publicValue ?? args.raw;
}

function toReplyTargetPayload(row: ReplyTargetRow, requesterOwnsRecord: boolean): ReplyTargetPayload {
  return {
    id: row.id,
    moodPhrase: pickVisibleText({
      requesterOwnsRecord,
      raw: row.mood_phrase,
      publicValue: row.display_mood_phrase,
    }),
    quote: pickVisibleText({
      requesterOwnsRecord,
      raw: row.quote,
      publicValue: row.public_quote,
    }),
    createdAt: row.created_at,
    isPublic: row.is_public,
    publicationStatus: row.publication_status,
    author: {
      id: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

export async function loadReplyTargetMap(
  queryable: Queryable | Pick<PoolClient, "query">,
  args: { targetIds: string[]; requesterUserId?: string | null },
): Promise<Map<string, ReplyTargetPayload>> {
  const targetIds = Array.from(new Set(args.targetIds.filter(Boolean)));
  if (targetIds.length === 0) {
    return new Map();
  }

  const visibleTargets = await runQuery<ReplyTargetRow>(
    queryable,
    `
      SELECT
        r.id,
        r.user_id,
        r.mood_phrase,
        r.display_mood_phrase,
        rq.quote,
        r.public_quote,
        r.is_public,
        r.publication_status,
        r.created_at,
        u.display_name,
        u.avatar_url
      FROM records r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      WHERE r.id = ANY($1::uuid[])
        AND (
          (r.is_public = TRUE AND r.publication_status = 'published')
          OR ($2::uuid IS NOT NULL AND r.user_id = $2::uuid)
        )
    `,
    [targetIds, args.requesterUserId ?? null],
  );

  return new Map<string, ReplyTargetPayload>(
    visibleTargets.rows.map((row: ReplyTargetRow) => [
      row.id,
      toReplyTargetPayload(row, !!args.requesterUserId && row.user_id === args.requesterUserId),
    ]),
  );
}

export async function loadRecordSummary(
  queryable: Queryable | Pick<PoolClient, "query">,
  recordId: string,
): Promise<RecordSummaryRow | null> {
  const rows = await runQuery<RecordSummaryRow>(
    queryable,
    `
      SELECT
        r.id,
        r.user_id,
        r.mood_phrase,
        r.display_mood_phrase,
        r.description,
        r.public_description,
        r.is_public,
        r.visibility_intent,
        r.publication_status,
        r.publish_requested_at,
        r.published_at,
        r.risk_summary,
        r.review_notes,
        r.occurred_at,
        r.public_occurred_at,
        r.location_id,
        r.public_location_label,
        r.edit_deadline_at,
        r.created_at,
        r.updated_at,
        r.source_record_id,
        r.source_comment_id,
        rq.quote,
        r.public_quote,
        COALESCE((
          SELECT ARRAY_AGG(re.emotion ORDER BY re.created_at ASC)
          FROM record_emotions re
          WHERE re.record_id = r.id
        ), ARRAY[]::text[]) AS extra_emotions,
        COALESCE((
          SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
          FROM record_tags rt
          WHERE rt.record_id = r.id
        ), ARRAY[]::text[]) AS tags,
        u.display_name,
        u.avatar_url
      FROM records r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      WHERE r.id = $1
      LIMIT 1
    `,
    [recordId],
  );

  return rows.rows[0] ?? null;
}

export async function loadReplyContext(
  queryable: Queryable | Pick<PoolClient, "query">,
  args: { sourceCommentId: string | null; requesterUserId?: string | null },
): Promise<ReplyContextPayload | null> {
  if (!args.sourceCommentId) {
    return null;
  }

  const meta = await runQuery<ReplyMetaRow>(
    queryable,
    `
      SELECT content, parent_record_id, root_record_id
      FROM comments
      WHERE id = $1
      LIMIT 1
    `,
    [args.sourceCommentId],
  );
  if (meta.rowCount !== 1) {
    return null;
  }

  const replyMeta = meta.rows[0];
  const targetMap = await loadReplyTargetMap(queryable, {
    targetIds: [replyMeta.parent_record_id, replyMeta.root_record_id],
    requesterUserId: args.requesterUserId ?? null,
  });
  return {
    content: replyMeta.content,
    parentRecordId: replyMeta.parent_record_id,
    rootRecordId: replyMeta.root_record_id,
    parentTarget: targetMap.get(replyMeta.parent_record_id) ?? null,
    rootTarget: targetMap.get(replyMeta.root_record_id) ?? null,
  };
}

export function buildRecordSummaryPayload(args: {
  summary: RecordSummaryRow;
  replyContext: ReplyContextPayload | null;
  requesterUserId?: string | null;
}) {
  const isOwner = !!args.requesterUserId && args.requesterUserId === args.summary.user_id;
  return {
    id: args.summary.id,
    user_id: args.summary.user_id,
    mood_phrase: pickVisibleText({
      requesterOwnsRecord: isOwner,
      raw: args.summary.mood_phrase,
      publicValue: args.summary.display_mood_phrase,
    }),
    quote: pickVisibleText({
      requesterOwnsRecord: isOwner,
      raw: args.summary.quote,
      publicValue: args.summary.public_quote,
    }),
    extra_emotions: args.summary.extra_emotions,
    tags: args.summary.tags,
    description: pickVisibleText({
      requesterOwnsRecord: isOwner,
      raw: args.summary.description,
      publicValue: args.summary.public_description,
    }),
    occurred_at: pickVisibleText({
      requesterOwnsRecord: isOwner,
      raw: args.summary.occurred_at,
      publicValue: args.summary.public_occurred_at,
    }),
    public_location_label: isOwner ? null : args.summary.public_location_label,
    sanitized: !isOwner && !!(args.summary.display_mood_phrase || args.summary.public_description || args.summary.public_quote),
    visibility_intent: args.summary.visibility_intent,
    publication_status: args.summary.publication_status,
    is_public: args.summary.is_public,
    created_at: args.summary.created_at,
    updated_at: args.summary.updated_at,
    replyContext: args.replyContext,
  };
}

export function buildRecordAuthorPayload(summary: RecordSummaryRow) {
  return {
    id: summary.user_id,
    displayName: summary.display_name,
    avatarUrl: summary.avatar_url,
  };
}

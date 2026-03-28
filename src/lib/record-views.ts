import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import {
  buildPublicLocationSummary,
  redactOccurredAtToMonth,
  redactPublicText,
  type PublicLocationSummary,
} from "./public-redaction.js";

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
  mood_mode?: "preset" | "other_random" | "custom" | null;
  custom_mood_phrase?: string | null;
  description: string | null;
  is_public: boolean;
  visibility_intent: string;
  publication_status: string;
  publish_requested_at: string | null;
  published_at: string | null;
  risk_summary: unknown;
  review_notes: string | null;
  occurred_at: string | null;
  location_id: string | null;
  edit_deadline_at: string;
  created_at: string;
  updated_at: string;
  source_record_id: string | null;
  source_comment_id: string | null;
  quote: string | null;
  extra_emotions: string[];
  tags: string[];
  display_name: string;
  avatar_url: string | null;
  location_country?: string | null;
  location_region?: string | null;
  location_city?: string | null;
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
  quote: string | null;
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
  occurredAt?: string | null;
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

function toReplyTargetPayload(row: ReplyTargetRow): ReplyTargetPayload {
  return {
    id: row.id,
    moodPhrase: row.mood_phrase,
    quote: row.quote,
    createdAt: row.created_at,
    isPublic: row.is_public,
    publicationStatus: row.publication_status,
    occurredAt: row.created_at,
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
        rq.quote,
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
    visibleTargets.rows.map((row: ReplyTargetRow) => [row.id, toReplyTargetPayload(row)]),
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
        r.mood_mode,
        r.custom_mood_phrase,
        r.description,
        r.is_public,
        r.visibility_intent,
        r.publication_status,
        r.publish_requested_at,
        r.published_at,
        r.risk_summary,
        r.review_notes,
        r.occurred_at,
        r.location_id,
        r.edit_deadline_at,
        r.created_at,
        r.updated_at,
        r.source_record_id,
        r.source_comment_id,
        rq.quote,
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
        loc.country AS location_country,
        loc.region AS location_region,
        loc.city AS location_city,
        u.display_name,
        u.avatar_url
      FROM records r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      LEFT JOIN locations loc ON loc.id = r.location_id
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
  isOwner?: boolean;
}) {
  const isOwner = Boolean(args.isOwner);
  const locationSummary = buildPublicLocationSummary({
    country: args.summary.location_country,
    region: args.summary.location_region,
    city: args.summary.location_city,
  });

  return {
    id: args.summary.id,
    user_id: args.summary.user_id,
    mood_phrase: args.summary.mood_phrase,
    quote: isOwner ? args.summary.quote : redactPublicText(args.summary.quote),
    extra_emotions: args.summary.extra_emotions,
    tags: args.summary.tags,
    description: isOwner ? args.summary.description : redactPublicText(args.summary.description),
    visibility_intent: args.summary.visibility_intent,
    publication_status: args.summary.publication_status,
    is_public: args.summary.is_public,
    created_at: args.summary.created_at,
    updated_at: args.summary.updated_at,
    occurred_at: isOwner ? args.summary.occurred_at : redactOccurredAtToMonth(args.summary.occurred_at),
    location_id: isOwner ? args.summary.location_id : null,
    location_summary: locationSummary as PublicLocationSummary | null,
    mood_mode: args.summary.mood_mode ?? "preset",
    custom_mood_phrase: args.summary.custom_mood_phrase,
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

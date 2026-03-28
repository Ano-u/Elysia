import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { writeAuditLog } from "../lib/audit.js";
import { ensureRecordMindMapNodes } from "../lib/mindmap-records.js";
import { loadReplyTargetMap, type ReplyTargetPayload } from "../lib/record-views.js";

type MindMapRecordRow = {
  node_id: string;
  record_id: string;
  mood_phrase: string;
  label: string;
  created_at: string;
  reply_content: string | null;
  parent_record_id: string | null;
  root_record_id: string | null;
  is_self_reply: boolean;
};

type RecordTagRow = {
  record_id: string;
  tag: string;
};

type MindMapReplyContext = {
  isReply: true;
  content: string;
  parentRecordId: string;
  rootRecordId: string;
  parentTarget: ReplyTargetPayload | null;
  rootTarget: ReplyTargetPayload | null;
};

type MindMapNodePayload = {
  id: string;
  recordId: string;
  type: "record";
  label: string;
  createdAt: string;
  isSelfReply: boolean;
  isFocus?: boolean;
  replyContext: MindMapReplyContext | null;
};

type MindMapEdgePayload = {
  id: string;
  source: string;
  target: string;
  type: "theme_link" | "self_reply";
  strength: number;
};

type PreparedMindMapRecord = MindMapRecordRow & {
  created_at_ms: number;
};

type MindMapQueryable = {
  query: typeof query;
};

type FocusRecordRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  is_public: boolean;
  publication_status: string;
};

type MindMapHintsPayload = {
  layout: "spiral-bloom";
  selfReplyClusters: true;
  hoverReplyGhosts: true;
  focusRecordId?: string;
};

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function buildTagMap(rows: RecordTagRow[]): Map<string, Set<string>> {
  const tagMap = new Map<string, Set<string>>();
  for (const row of rows) {
    const normalizedTag = normalizeText(row.tag);
    if (!normalizedTag) {
      continue;
    }
    const entry = tagMap.get(row.record_id) ?? new Set<string>();
    entry.add(normalizedTag);
    tagMap.set(row.record_id, entry);
  }
  return tagMap;
}

function countSharedTags(left: Set<string>, right: Set<string>): number {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;
  for (const tag of smaller) {
    if (larger.has(tag)) {
      count += 1;
    }
  }
  return count;
}

function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
}

function buildThemeEdges(args: {
  records: PreparedMindMapRecord[];
  tagMap: Map<string, Set<string>>;
  selfReplyPairKeys: Set<string>;
  edgeLimit: number;
  perNodeLimit: number;
}): MindMapEdgePayload[] {
  const candidates: Array<{
    source: string;
    target: string;
    strength: number;
    newestCreatedAtMs: number;
  }> = [];

  for (let index = 0; index < args.records.length; index += 1) {
    const sourceRecord = args.records[index];
    const sourceTags = args.tagMap.get(sourceRecord.record_id) ?? new Set<string>();
    const normalizedSourceMood = normalizeText(sourceRecord.mood_phrase);

    for (let innerIndex = index + 1; innerIndex < args.records.length; innerIndex += 1) {
      const targetRecord = args.records[innerIndex];
      if (args.selfReplyPairKeys.has(pairKey(sourceRecord.node_id, targetRecord.node_id))) {
        continue;
      }

      const targetTags = args.tagMap.get(targetRecord.record_id) ?? new Set<string>();
      const sharedTagCount =
        sourceTags.size > 0 && targetTags.size > 0 ? countSharedTags(sourceTags, targetTags) : 0;
      const normalizedTargetMood = normalizeText(targetRecord.mood_phrase);
      const sameMoodPhrase =
        normalizedSourceMood.length > 0 && normalizedSourceMood === normalizedTargetMood;

      if (sharedTagCount === 0 && !sameMoodPhrase) {
        continue;
      }

      let strength = 0.24 + sharedTagCount * 0.18 + (sameMoodPhrase ? 0.22 : 0);
      const isRecentPair = Math.abs(sourceRecord.created_at_ms - targetRecord.created_at_ms) <= 30 * 24 * 60 * 60 * 1000;
      if (isRecentPair) {
        strength += 0.06;
      }

      candidates.push({
        source: sourceRecord.node_id,
        target: targetRecord.node_id,
        strength: Number(Math.min(0.95, strength).toFixed(2)),
        newestCreatedAtMs: Math.max(sourceRecord.created_at_ms, targetRecord.created_at_ms),
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.strength !== left.strength) {
      return right.strength - left.strength;
    }
    return right.newestCreatedAtMs - left.newestCreatedAtMs;
  });

  const perNodeCounts = new Map<string, number>();
  const edges: MindMapEdgePayload[] = [];

  for (const candidate of candidates) {
    if (edges.length >= args.edgeLimit) {
      break;
    }

    const sourceCount = perNodeCounts.get(candidate.source) ?? 0;
    const targetCount = perNodeCounts.get(candidate.target) ?? 0;
    if (sourceCount >= args.perNodeLimit || targetCount >= args.perNodeLimit) {
      continue;
    }

    edges.push({
      id: `theme:${pairKey(candidate.source, candidate.target)}`,
      source: candidate.source,
      target: candidate.target,
      type: "theme_link",
      strength: candidate.strength,
    });
    perNodeCounts.set(candidate.source, sourceCount + 1);
    perNodeCounts.set(candidate.target, targetCount + 1);
  }

  return edges;
}

async function loadMindMapRecords(args: {
  queryable: MindMapQueryable;
  ownerUserId: string;
  requesterUserId: string;
  limit: number;
  recordIds?: string[];
}): Promise<PreparedMindMapRecord[]> {
  const filterRecordIds = args.recordIds && args.recordIds.length > 0 ? args.recordIds : null;
  const rows = await args.queryable.query<MindMapRecordRow>(
    `
      SELECT
        node.id AS node_id,
        r.id AS record_id,
        r.mood_phrase,
        COALESCE(NULLIF(node.label, ''), r.mood_phrase) AS label,
        r.created_at,
        c.content AS reply_content,
        c.parent_record_id,
        c.root_record_id,
        COALESCE(parent.user_id = r.user_id, FALSE) AS is_self_reply
      FROM records r
      JOIN LATERAL (
        SELECT mn.id, mn.label
        FROM mindmap_nodes mn
        WHERE mn.user_id = r.user_id
          AND mn.record_id = r.id
          AND mn.node_type = 'record'
        ORDER BY mn.created_at ASC
        LIMIT 1
      ) node ON TRUE
      LEFT JOIN comments c ON c.derived_record_id = r.id
      LEFT JOIN records parent ON parent.id = c.parent_record_id
      WHERE r.user_id = $1
        AND ($2::uuid[] IS NULL OR r.id = ANY($2::uuid[]))
        AND ($3::uuid = $1 OR (r.is_public = TRUE AND r.publication_status = 'published'))
      ORDER BY r.created_at DESC
      LIMIT $4
    `,
    [args.ownerUserId, filterRecordIds, args.requesterUserId, args.limit],
  );

  return rows.rows.map((row) => ({
    ...row,
    created_at_ms: new Date(row.created_at).getTime(),
  }));
}

async function buildMindMapProjection(args: {
  queryable: MindMapQueryable;
  ownerUserId: string;
  requesterUserId: string;
  nodeLimit: number;
  edgeLimit: number;
  perNodeThemeLimit: number;
  recordIds?: string[];
  focusRecordId?: string;
}): Promise<{
  nodes: MindMapNodePayload[];
  edges: MindMapEdgePayload[];
  hints: MindMapHintsPayload;
}> {
  await ensureRecordMindMapNodes(args.queryable, {
    ownerUserId: args.ownerUserId,
    recordIds: args.recordIds,
  });

  const preparedRecords = await loadMindMapRecords({
    queryable: args.queryable,
    ownerUserId: args.ownerUserId,
    requesterUserId: args.requesterUserId,
    limit: args.nodeLimit,
    recordIds: args.recordIds,
  });
  const recordIds = preparedRecords.map((row) => row.record_id);

  const tagRows =
    recordIds.length > 0
      ? await args.queryable.query<RecordTagRow>(
          `
            SELECT record_id, tag
            FROM record_tags
            WHERE record_id = ANY($1::uuid[])
          `,
          [recordIds],
        )
      : { rows: [] as RecordTagRow[] };

  const replyTargetMap = await loadReplyTargetMap(args.queryable, {
    targetIds: preparedRecords.flatMap((row) => [row.parent_record_id ?? "", row.root_record_id ?? ""]),
    requesterUserId: args.requesterUserId,
  });

  const nodes: MindMapNodePayload[] = preparedRecords.map((row) => {
    const hasReplyMeta = Boolean(row.parent_record_id);
    return {
      id: row.node_id,
      recordId: row.record_id,
      type: "record",
      label: row.label,
      createdAt: row.created_at,
      isSelfReply: row.is_self_reply,
      ...(args.focusRecordId === row.record_id ? { isFocus: true } : {}),
      replyContext:
        hasReplyMeta && row.parent_record_id
          ? {
              isReply: true,
              content: row.reply_content ?? "",
              parentRecordId: row.parent_record_id,
              rootRecordId: row.root_record_id ?? row.parent_record_id,
              parentTarget: replyTargetMap.get(row.parent_record_id) ?? null,
              rootTarget: row.root_record_id ? replyTargetMap.get(row.root_record_id) ?? null : null,
            }
          : null,
    };
  });

  const recordIdToNodeId = new Map(nodes.map((node) => [node.recordId, node.id]));
  const selfReplyEdges: MindMapEdgePayload[] = [];
  const selfReplyPairKeys = new Set<string>();
  for (const row of preparedRecords) {
    if (!row.is_self_reply || !row.parent_record_id) {
      continue;
    }
    const parentNodeId = recordIdToNodeId.get(row.parent_record_id);
    if (!parentNodeId) {
      continue;
    }
    selfReplyEdges.push({
      id: `self:${row.node_id}:${parentNodeId}`,
      source: row.node_id,
      target: parentNodeId,
      type: "self_reply",
      strength: 1,
    });
    selfReplyPairKeys.add(pairKey(row.node_id, parentNodeId));
  }

  const themeEdges = buildThemeEdges({
    records: preparedRecords,
    tagMap: buildTagMap(tagRows.rows),
    selfReplyPairKeys,
    edgeLimit: Math.max(args.edgeLimit - selfReplyEdges.length, 0),
    perNodeLimit: args.perNodeThemeLimit,
  });

  return {
    nodes,
    edges: [...selfReplyEdges, ...themeEdges],
    hints: {
      layout: "spiral-bloom",
      selfReplyClusters: true,
      hoverReplyGhosts: true,
      ...(args.focusRecordId ? { focusRecordId: args.focusRecordId } : {}),
    },
  };
}

async function loadMindMapContextRecordIds(args: {
  queryable: MindMapQueryable;
  recordId: string;
  ownerUserId: string;
  requesterUserId: string;
}): Promise<string[]> {
  const rows = await args.queryable.query<{ record_id: string }>(
    `
      WITH target AS (
        SELECT id, mood_phrase
        FROM records
        WHERE id = $1
      ),
      target_tags AS (
        SELECT DISTINCT tag
        FROM record_tags
        WHERE record_id = $1
      ),
      thread_ids AS (
        SELECT $1::uuid AS record_id
        UNION
        SELECT c.parent_record_id
        FROM comments c
        WHERE c.derived_record_id = $1
        UNION
        SELECT c.root_record_id
        FROM comments c
        WHERE c.derived_record_id = $1
      ),
      child_ids AS (
        SELECT child.id AS record_id
        FROM comments c
        JOIN records child ON child.id = c.derived_record_id
        WHERE c.parent_record_id = $1
          AND child.user_id = $2
          AND ($3::uuid = $2 OR (child.is_public = TRUE AND child.publication_status = 'published'))
        ORDER BY child.created_at DESC
        LIMIT 24
      ),
      theme_ids AS (
        SELECT r.id AS record_id
        FROM records r
        CROSS JOIN target t
        WHERE r.user_id = $2
          AND r.id <> $1
          AND ($3::uuid = $2 OR (r.is_public = TRUE AND r.publication_status = 'published'))
          AND (
            LOWER(BTRIM(r.mood_phrase)) = LOWER(BTRIM(t.mood_phrase))
            OR EXISTS (
              SELECT 1
              FROM record_tags rt
              JOIN target_tags tt ON tt.tag = rt.tag
              WHERE rt.record_id = r.id
            )
          )
        ORDER BY
          CASE WHEN LOWER(BTRIM(r.mood_phrase)) = LOWER(BTRIM(t.mood_phrase)) THEN 0 ELSE 1 END,
          r.created_at DESC
        LIMIT 40
      ),
      recent_ids AS (
        SELECT r.id AS record_id
        FROM records r
        WHERE r.user_id = $2
          AND r.id <> $1
          AND ($3::uuid = $2 OR (r.is_public = TRUE AND r.publication_status = 'published'))
        ORDER BY r.created_at DESC
        LIMIT 24
      )
      SELECT DISTINCT record_id
      FROM (
        SELECT record_id FROM thread_ids
        UNION ALL
        SELECT record_id FROM child_ids
        UNION ALL
        SELECT record_id FROM theme_ids
        UNION ALL
        SELECT record_id FROM recent_ids
      ) combined
      WHERE record_id IS NOT NULL
    `,
    [args.recordId, args.ownerUserId, args.requesterUserId],
  );

  return Array.from(new Set(rows.rows.map((row) => row.record_id)));
}

export async function mindmapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mindmap/me", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const mode = z
      .object({
        mode: z.enum(["simple", "deep"]).default("simple"),
      })
      .parse(req.query);

    const nodeLimit = mode.mode === "simple" ? 120 : 500;
    const edgeLimit = mode.mode === "simple" ? 180 : 720;
    const perNodeThemeLimit = mode.mode === "simple" ? 3 : 5;
    const projection = await buildMindMapProjection({
      queryable: { query },
      ownerUserId: user.id,
      requesterUserId: user.id,
      nodeLimit,
      edgeLimit,
      perNodeThemeLimit,
    });

    return {
      mode: mode.mode,
      nodes: projection.nodes,
      edges: projection.edges,
      hints: projection.hints,
    };
  });

  app.get("/mindmap/:recordId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ recordId: z.string().uuid() }).parse(req.params);
    const mode = z
      .object({
        mode: z.enum(["simple", "deep"]).default("simple"),
      })
      .parse(req.query);

    const record = await query<FocusRecordRow>(
      `
        SELECT id, user_id, mood_phrase, is_public, publication_status
        FROM records
        WHERE id = $1
      `,
      [params.recordId],
    );
    if (record.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }
    const r = record.rows[0];
    const isPublished = r.is_public && r.publication_status === "published";
    if (!isPublished && r.user_id !== user.id) {
      reply.code(403).send({ message: "无权查看该图谱节点" });
      return;
    }

    const nodeLimit = mode.mode === "simple" ? 72 : 180;
    const edgeLimit = mode.mode === "simple" ? 120 : 240;
    const perNodeThemeLimit = mode.mode === "simple" ? 3 : 4;
    const contextRecordIds = await loadMindMapContextRecordIds({
      queryable: { query },
      recordId: params.recordId,
      ownerUserId: r.user_id,
      requesterUserId: user.id,
    });
    const projection = await buildMindMapProjection({
      queryable: { query },
      ownerUserId: r.user_id,
      requesterUserId: user.id,
      nodeLimit,
      edgeLimit,
      perNodeThemeLimit,
      recordIds: contextRecordIds,
      focusRecordId: params.recordId,
    });

    return {
      mode: mode.mode,
      focusRecordId: params.recordId,
      nodes: projection.nodes,
      edges: projection.edges,
      hints: projection.hints,
    };
  });

  app.post("/mindmap/manual-link", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        sourceRecordId: z.string().uuid(),
        targetRecordId: z.string().uuid(),
        strength: z.coerce.number().min(0).max(1).default(0.6),
      })
      .parse(req.body);

    if (body.sourceRecordId === body.targetRecordId) {
      reply.code(400).send({ message: "不能将记录与自身链接" });
      return;
    }

    await query(
      `
        INSERT INTO record_links (source_record_id, target_record_id, link_type, strength, created_by)
        VALUES ($1, $2, 'manual', $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [body.sourceRecordId, body.targetRecordId, body.strength, user.id],
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: "mindmap.manual_link",
      targetType: "record_link",
      payload: {
        sourceRecordId: body.sourceRecordId,
        targetRecordId: body.targetRecordId,
        strength: body.strength,
      },
    });

    return { ok: true };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAccessApproved, requireNotInRiskControl } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { hashIp, validateMoodPhraseLength, validateQuoteLength } from "../lib/utils.js";
import { writeAuditLog } from "../lib/audit.js";
import { assessModeration } from "../lib/moderation.js";
import { decidePublication } from "../lib/publication-workflow.js";
import {
  applyPublicationDecision,
  buildRiskSummary,
  createRecordRevision,
  parseRecordVisibilityIntent,
  publicationLabel,
} from "../lib/record-publication.js";
import { buildRecordSummaryPayload, loadRecordSummary, loadReplyContext } from "../lib/record-views.js";

type CommentRow = {
  id: string;
  record_id: string;
  user_id: string;
  content: string;
  parent_record_id: string;
  root_record_id: string;
  created_at: string;
};

type ReplyTargetRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  is_public: boolean;
  publication_status: string;
  root_record_id: string;
};

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(300),
  moodPhrase: z.string().min(1).max(140),
  quote: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
  isPublic: z.boolean().optional(),
});

export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/records/:id/comments", async (req, reply) => {
    const approvedUser = await requireAccessApproved(req, reply);
    if (!approvedUser) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createCommentSchema.parse(req.body);
    const visibilityIntent = parseRecordVisibilityIntent(body.isPublic ?? true);
    const user =
      visibilityIntent === "public"
        ? await requireNotInRiskControl(req, reply)
        : approvedUser;
    if (!user) {
      return;
    }

    const moodPhraseCheck = validateMoodPhraseLength(body.moodPhrase);
    if (!moodPhraseCheck.ok) {
      reply.code(400).send({ message: moodPhraseCheck.reason });
      return;
    }

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    const record = await query<ReplyTargetRow>(
      `
        SELECT
          r.id,
          r.user_id,
          r.mood_phrase,
          r.is_public,
          r.publication_status,
          COALESCE(c.root_record_id, r.id) AS root_record_id
        FROM records r
        LEFT JOIN comments c ON c.derived_record_id = r.id
        WHERE r.id = $1
        LIMIT 1
      `,
      [params.id],
    );
    if (record.rowCount !== 1) {
      reply.code(404).send({ message: "目标记录不存在" });
      return;
    }

    const target = record.rows[0];
    const isPublished = target.is_public && target.publication_status === "published";
    if (!isPublished) {
      reply.code(403).send({ message: "仅可回复已公开内容" });
      return;
    }

    const textAssessment = assessModeration({
      moodPhrase: `${body.moodPhrase}\n${body.content}`,
      quote: body.quote ?? undefined,
      description: body.description ?? undefined,
      extraEmotions: body.extraEmotions ?? [],
      tags: [],
    });
    const decision = decidePublication({
      visibilityIntent,
      hasImages: false,
      textAssessment,
    });
    const triggerIpHash = hashIp(req.ip);

    const result = await withTransaction(async (client) => {
      const insertedComment = await client.query<CommentRow>(
        `
          INSERT INTO comments (record_id, user_id, content, parent_record_id, root_record_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, record_id, user_id, content, parent_record_id, root_record_id, created_at
        `,
        [params.id, user.id, body.content, params.id, target.root_record_id],
      );
      const comment = insertedComment.rows[0];

      const insertedRecord = await client.query<{ id: string }>(
        `
          INSERT INTO records (
            user_id,
            mood_phrase,
            description,
            is_public,
            visibility_intent,
            publication_status,
            publish_requested_at,
            published_at,
            risk_summary,
            review_notes,
            source_record_id,
            source_comment_id
          ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'public' THEN NOW() ELSE NULL END, CASE WHEN $4 THEN NOW() ELSE NULL END, $7::jsonb, $8, $9, $10)
          RETURNING id
        `,
        [
          user.id,
          body.moodPhrase,
          body.description ?? null,
          decision.isPublic,
          visibilityIntent,
          decision.publicationStatus,
          JSON.stringify(buildRiskSummary({ assessment: textAssessment, decision })),
          decision.reason,
          params.id,
          comment.id,
        ],
      );
      const replyRecordId = insertedRecord.rows[0].id;

      await client.query(
        `
          UPDATE comments
          SET derived_record_id = $2, updated_at = NOW()
          WHERE id = $1
        `,
        [comment.id, replyRecordId],
      );

      if (body.quote) {
        await client.query(
          `
            INSERT INTO record_quotes (record_id, quote)
            VALUES ($1, $2)
          `,
          [replyRecordId, body.quote],
        );
      }

      for (const emotion of body.extraEmotions ?? []) {
        await client.query(
          `
            INSERT INTO record_emotions (record_id, emotion)
            VALUES ($1, $2)
          `,
          [replyRecordId, emotion],
        );
      }

      await client.query(
        `
          INSERT INTO record_links (source_record_id, target_record_id, link_type, strength, created_by)
          VALUES ($1, $2, 'reply', 0.45, $3)
          ON CONFLICT DO NOTHING
        `,
        [replyRecordId, params.id, user.id],
      );

      if (target.root_record_id !== params.id) {
        await client.query(
          `
            INSERT INTO record_links (source_record_id, target_record_id, link_type, strength, created_by)
            VALUES ($1, $2, 'reply', 0.25, $3)
            ON CONFLICT DO NOTHING
          `,
          [replyRecordId, target.root_record_id, user.id],
        );
      }

      const relatedNodeRows = await client.query<{ id: string; record_id: string }>(
        `
          SELECT id, record_id
          FROM mindmap_nodes
          WHERE record_id = ANY($1::uuid[])
            AND node_type = 'record'
          ORDER BY created_at ASC
        `,
        [Array.from(new Set([params.id, target.root_record_id]))],
      );
      const nodeMap = new Map<string, string>();
      for (const row of relatedNodeRows.rows) {
        if (!nodeMap.has(row.record_id)) {
          nodeMap.set(row.record_id, row.id);
        }
      }

      const replyNode = await client.query<{ id: string }>(
        `
          INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
          VALUES ($1, $2, 'record', $3, $4::jsonb)
          RETURNING id
        `,
        [
          user.id,
          replyRecordId,
          body.moodPhrase,
          JSON.stringify({
            visibilityIntent,
            publicationStatus: decision.publicationStatus,
            replyTo: params.id,
            rootRecordId: target.root_record_id,
          }),
        ],
      );

      const parentNodeId = nodeMap.get(params.id);
      if (parentNodeId) {
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'reply', 0.45)
          `,
          [replyNode.rows[0].id, parentNodeId],
        );
      }

      const rootNodeId = nodeMap.get(target.root_record_id);
      if (rootNodeId && target.root_record_id !== params.id) {
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'reply', 0.25)
          `,
          [replyNode.rows[0].id, rootNodeId],
        );
      }

      const revisionNo = await createRecordRevision({
        client,
        recordId: replyRecordId,
        editedBy: user.id,
        snapshot: {
          content: body.content,
          moodPhrase: body.moodPhrase,
          description: body.description ?? null,
          quote: body.quote ?? null,
          extraEmotions: body.extraEmotions ?? [],
          visibilityIntent,
          parentRecordId: params.id,
          rootRecordId: target.root_record_id,
          sourceCommentId: comment.id,
        },
      });

      await applyPublicationDecision({
        client,
        recordId: replyRecordId,
        userId: user.id,
        triggerIpHash,
        visibilityIntent,
        assessment: textAssessment,
        decision,
        revisionNo,
        reviewStage: "auto",
        modelMeta: {
          source: "reply_comment",
          parentRecordId: params.id,
          rootRecordId: target.root_record_id,
        },
      });

      const summary = await loadRecordSummary(client, replyRecordId);
      if (!summary) {
        throw new Error("回复记录创建后读取失败");
      }
      const replyContext = await loadReplyContext(client, {
        sourceCommentId: summary.source_comment_id,
        requesterUserId: user.id,
      });

      return {
        comment: {
          id: comment.id,
          content: comment.content,
          parentRecordId: comment.parent_record_id,
          rootRecordId: comment.root_record_id,
          createdAt: comment.created_at,
        },
        record: buildRecordSummaryPayload({
          summary,
          replyContext,
        }),
        publishStatus: {
          status: summary.publication_status,
          label: publicationLabel(summary.publication_status),
        },
      };
    });

    broadcast("record.created", {
      recordId: result.record.id,
      userId: user.id,
      parentRecordId: result.comment.parentRecordId,
      rootRecordId: result.comment.rootRecordId,
      isPublic: result.record.is_public,
      publicationStatus: result.record.publication_status,
      event: "reply_created",
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "comment.create_reply_record",
      targetType: "record",
      targetId: result.record.id,
      payload: {
        commentId: result.comment.id,
        parentRecordId: result.comment.parentRecordId,
        rootRecordId: result.comment.rootRecordId,
        visibilityIntent,
      },
    });

    return result;
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAccessApproved, requireNotInRiskControl } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { hashIp, validateQuoteLength } from "../lib/utils.js";
import { writeAuditLog } from "../lib/audit.js";
import { assessModeration } from "../lib/moderation.js";
import { decidePublication } from "../lib/publication-workflow.js";
import { activateRiskControl, enqueueModerationQueue } from "../lib/risk-control.js";

type CommentRow = {
  id: string;
  record_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type RecordRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  is_public: boolean;
  publication_status: string;
};

const createCommentSchema = z.object({
  content: z.string().min(1).max(300),
  quote: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
});

export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/records/:id/comments", async (req, reply) => {
    const accessUser = await requireAccessApproved(req, reply);
    if (!accessUser) {
      return;
    }
    const user = await requireNotInRiskControl(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = createCommentSchema.parse(req.body);

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    const record = await query<RecordRow>(
      "SELECT id, user_id, mood_phrase, is_public, publication_status FROM records WHERE id = $1",
      [params.id],
    );
    if (record.rowCount !== 1) {
      reply.code(404).send({ message: "目标记录不存在" });
      return;
    }
    const target = record.rows[0];
    const isPublished = target.is_public && target.publication_status === "published";
    if (!isPublished) {
      reply.code(403).send({ message: "仅可评论已公开内容" });
      return;
    }

    const textAssessment = assessModeration({
      moodPhrase: body.content.slice(0, 140),
      quote: body.quote ?? undefined,
      description: body.description ?? undefined,
      extraEmotions: body.extraEmotions ?? [],
      tags: [],
    });
    const decision = decidePublication({
      visibilityIntent: "private",
      hasImages: false,
      textAssessment,
    });
    const riskSummary = {
      source: "comment_derived",
      textAssessment: {
        level: textAssessment.level,
        decision: textAssessment.decision,
        confidence: textAssessment.confidence,
        riskScore: textAssessment.riskScore,
        riskLabels: textAssessment.riskLabels,
        reason: textAssessment.reason,
        violationType: textAssessment.violationType,
      },
      effectiveRiskLevel: decision.effectiveRiskLevel,
    };

    const result = await withTransaction(async (client) => {
      const insertedComment = await client.query<CommentRow>(
        `
          INSERT INTO comments (record_id, user_id, content)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [params.id, user.id, body.content],
      );
      const comment = insertedComment.rows[0];

      const derivedRecord = await client.query<{ id: string }>(
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
          ) VALUES ($1, $2, $3, $4, 'private', $5, NULL, NULL, $6::jsonb, $7, $8, $9)
          RETURNING id
        `,
        [
          user.id,
          body.content.slice(0, 140),
          body.description ?? null,
          decision.isPublic,
          decision.publicationStatus,
          JSON.stringify(riskSummary),
          decision.reason,
          params.id,
          comment.id,
        ],
      );
      const derivedId = derivedRecord.rows[0].id;

      if (body.quote) {
        await client.query(
          `
            INSERT INTO record_quotes (record_id, quote)
            VALUES ($1, $2)
          `,
          [derivedId, body.quote],
        );
      }

      for (const emotion of body.extraEmotions ?? []) {
        await client.query(
          `
            INSERT INTO record_emotions (record_id, emotion)
            VALUES ($1, $2)
          `,
          [derivedId, emotion],
        );
      }

      // 双向关联：派生和共鸣
      await client.query(
        `
          INSERT INTO record_links (source_record_id, target_record_id, link_type, strength, created_by)
          VALUES ($1, $2, 'derived', 0.9, $3),
                 ($2, $1, 'resonance', 0.7, $3)
          ON CONFLICT DO NOTHING
        `,
        [derivedId, params.id, user.id],
      );

      const sourceNode = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mindmap_nodes
          WHERE record_id = $1 AND node_type = 'record'
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [params.id],
      );
      const derivedNode = await client.query<{ id: string }>(
        `
          INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
          VALUES ($1, $2, 'record', $3, $4::jsonb)
          RETURNING id
        `,
        [user.id, derivedId, body.content.slice(0, 140), JSON.stringify({ derivedFrom: params.id })],
      );

      if (sourceNode.rowCount === 1) {
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'resonance', 0.7)
          `,
          [derivedNode.rows[0].id, sourceNode.rows[0].id],
        );
      }

      if (decision.queueType) {
        await enqueueModerationQueue(client, {
          targetType: "record",
          targetId: derivedId,
          queueType: decision.queueType,
          reason: decision.reason,
          priority: decision.queuePriority ?? 5,
          payload: {
            from: "comment_derived",
            sourceRecordId: params.id,
            riskLabels: textAssessment.riskLabels,
            violationType: textAssessment.violationType,
          },
        });
      }

      if (decision.triggerRiskControl) {
        await activateRiskControl(client, {
          userId: user.id,
          recordId: derivedId,
          reason: decision.reason,
          riskLevel: decision.effectiveRiskLevel === "very_high" ? "very_high" : "high",
          triggerSource: "auto_text",
          triggerIpHash: hashIp(req.ip),
          payload: {
            source: "comment_derived",
            sourceRecordId: params.id,
            riskLabels: textAssessment.riskLabels,
            violationType: textAssessment.violationType,
          },
        });
      }

      return {
        comment,
        derivedRecordId: derivedId,
      };
    });

    broadcast("record.created", {
      recordId: result.derivedRecordId,
      sourceRecordId: params.id,
      event: "derived_by_comment",
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "comment.create_and_derive",
      targetType: "record",
      targetId: result.derivedRecordId,
      payload: { sourceRecordId: params.id, commentId: result.comment.id },
    });

    return result;
  });
}

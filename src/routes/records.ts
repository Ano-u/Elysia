import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAccessApproved, requireNotInRiskControl, requireUser } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { validateMoodPhraseLength, validateQuoteLength, hashIp } from "../lib/utils.js";
import { writeAuditLog } from "../lib/audit.js";
import { assessModeration, buildPublicSanitizedVariant, validateCustomMoodPhrase } from "../lib/moderation.js";
import {
  decidePublication,
  isPubliclyVisibleStatus,
  type PublicationDecision,
  type VisibilityIntent,
} from "../lib/publication-workflow.js";
import {
  applyPublicationDecision,
  buildRiskSummary,
  createRecordRevision,
  parseRecordVisibilityIntent,
  publicationLabel,
} from "../lib/record-publication.js";
import { buildRecordAuthorPayload, buildRecordSummaryPayload, loadRecordSummary, loadReplyContext } from "../lib/record-views.js";

const recordCreateSchema = z.object({
  moodPhrase: z.string().min(1).max(140),
  quote: z.string().trim().min(1).max(200).optional(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
  imageIds: z.array(z.string().uuid()).max(4).optional(),
  drawingId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

const recordPatchSchema = z.object({
  moodPhrase: z.string().min(1).max(140).optional(),
  quote: z.string().max(200).optional().nullable(),
  extraEmotions: z.array(z.string().min(1).max(32)).max(8).optional(),
  description: z.string().max(1000).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

type RecordRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  display_mood_phrase: string | null;
  description: string | null;
  public_description: string | null;
  is_public: boolean;
  visibility_intent: VisibilityIntent;
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
};

type RecordFeedRow = RecordRow & {
  quote: string | null;
  public_quote: string | null;
  extra_emotions: string[];
  tags: string[];
};

type RecordModerationInput = {
  id: string;
  user_id: string;
  mood_phrase: string;
  description: string | null;
  occurred_at: string | null;
  visibility_intent: VisibilityIntent;
  quote: string | null;
  extra_emotions: string[];
  tags: string[];
  has_images: boolean;
};

async function ensureImageQuota(userId: string, imageIds: string[]): Promise<void> {
  if (imageIds.length > 4) {
    throw new Error("单条记录最多 4 张图片");
  }

  const count = await query<{ image_count: string }>(
    `
      SELECT COUNT(*)::text AS image_count
      FROM media_assets
      WHERE owner_user_id = $1 AND media_type = 'image'
    `,
    [userId],
  );
  const existing = Number(count.rows[0]?.image_count ?? "0");
  if (existing >= 60) {
    throw new Error("每用户最多可保存 60 张图片");
  }

  if (imageIds.length > 0) {
    const ownership = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM media_assets
        WHERE owner_user_id = $1
          AND id = ANY($2::uuid[])
          AND media_type = 'image'
      `,
      [userId, imageIds],
    );
    if (Number(ownership.rows[0]?.total ?? "0") !== imageIds.length) {
      throw new Error("存在无权限图片或图片不存在");
    }
  }
}

async function loadRecordModerationInput(client: Pick<PoolClient, "query">, recordId: string): Promise<RecordModerationInput | null> {
  const rows = await client.query<RecordModerationInput>(
    `
      SELECT
        r.id,
        r.user_id,
        r.mood_phrase,
        r.description,
        r.occurred_at,
        r.visibility_intent,
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
        EXISTS(
          SELECT 1
          FROM media_assets ma
          WHERE ma.record_id = r.id
            AND ma.media_type = 'image'
        ) AS has_images
      FROM records r
      LEFT JOIN record_quotes rq ON rq.record_id = r.id
      WHERE r.id = $1
      LIMIT 1
      FOR UPDATE OF r
    `,
    [recordId],
  );

  if (rows.rowCount !== 1) {
    return null;
  }

  return rows.rows[0];
}

async function requireWriteUser(
  req: FastifyRequest,
  reply: FastifyReply,
  options?: { checkRiskControl?: boolean },
) {
  const approved = await requireAccessApproved(req, reply);
  if (!approved) {
    return null;
  }

  if (options?.checkRiskControl !== false) {
    const allowed = await requireNotInRiskControl(req, reply);
    if (!allowed) {
      return null;
    }
    return allowed;
  }

  return approved;
}

function validateMoodInputOrReply(reply: FastifyReply, moodPhrase: string): { ok: true; customMood: ReturnType<typeof validateCustomMoodPhrase> } | { ok: false } {
  const moodPhraseCheck = validateMoodPhraseLength(moodPhrase);
  if (!moodPhraseCheck.ok) {
    reply.code(400).send({ message: moodPhraseCheck.reason });
    return { ok: false };
  }

  const customMood = validateCustomMoodPhrase(moodPhrase);
  if (!customMood.ok) {
    reply.code(400).send({ message: customMood.reason });
    return { ok: false };
  }

  return { ok: true, customMood };
}

export async function recordsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/records", async (req, reply) => {
    const user = await requireWriteUser(req, reply, { checkRiskControl: false });
    if (!user) {
      return;
    }

    const body = recordCreateSchema.parse(req.body);
    const moodCheck = validateMoodInputOrReply(reply, body.moodPhrase);
    if (!moodCheck.ok) {
      return;
    }

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    const imageIds = body.imageIds ?? [];
    try {
      await ensureImageQuota(user.id, imageIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片校验失败";
      reply.code(400).send({ message });
      return;
    }

    const visibilityIntent = parseRecordVisibilityIntent(body.isPublic);
    if (visibilityIntent === "public") {
      const allowed = await requireNotInRiskControl(req, reply);
      if (!allowed) {
        return;
      }
    }
    const assessment = assessModeration({
      moodPhrase: body.moodPhrase,
      description: body.description ?? null,
      quote: body.quote ?? null,
      extraEmotions: body.extraEmotions ?? [],
      tags: body.tags ?? [],
    });
    const publicSanitization = buildPublicSanitizedVariant({
      moodPhrase: body.moodPhrase,
      description: body.description ?? null,
      quote: body.quote ?? null,
      occurredAt: body.occurredAt ?? null,
    });
    const publicationDecision = decidePublication({
      visibilityIntent,
      hasImages: imageIds.length > 0,
      textAssessment: assessment,
      hasCustomMood: moodCheck.customMood.isCustom,
      strictReviewRequired: moodCheck.customMood.isCustom || (assessment.normalizedText?.flags.length ?? 0) > 0,
      hasPublicSanitizationRisk: publicSanitization.sanitizationApplied,
    });

    const triggerIpHash = hashIp(req.ip);
    const result = await withTransaction(async (client) => {
      const inserted = await client.query<RecordRow>(
        `
          INSERT INTO records (
            user_id,
            mood_phrase,
            display_mood_phrase,
            description,
            public_description,
            is_public,
            visibility_intent,
            publication_status,
            publish_requested_at,
            published_at,
            risk_summary,
            occurred_at,
            public_occurred_at,
            location_id,
            public_location_label,
            public_quote
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7 = 'public' THEN NOW() ELSE NULL END, CASE WHEN $6 THEN NOW() ELSE NULL END, $9::jsonb, $10, $11, $12, $13, $14)
          RETURNING *
        `,
        [
          user.id,
          body.moodPhrase,
          publicSanitization.displayMoodPhrase,
          body.description ?? null,
          publicSanitization.publicDescription,
          publicationDecision.isPublic,
          visibilityIntent,
          publicationDecision.publicationStatus,
          JSON.stringify(buildRiskSummary({ assessment, decision: publicationDecision, publicSanitization })),
          body.occurredAt ?? null,
          publicSanitization.publicOccurredAt,
          body.locationId ?? null,
          publicSanitization.publicLocationLabel,
          publicSanitization.publicQuote,
        ],
      );
      const record = inserted.rows[0];

      await client.query(
        `
          INSERT INTO user_preferences (user_id, last_visibility_public)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET last_visibility_public = EXCLUDED.last_visibility_public, updated_at = NOW()
        `,
        [user.id, visibilityIntent === "public"],
      );

      if (body.quote) {
        await client.query(
          `
            INSERT INTO record_quotes (record_id, quote)
            VALUES ($1, $2)
          `,
          [record.id, body.quote],
        );
      }

      for (const emotion of body.extraEmotions ?? []) {
        await client.query(
          `
            INSERT INTO record_emotions (record_id, emotion)
            VALUES ($1, $2)
          `,
          [record.id, emotion],
        );
      }

      for (const tag of body.tags ?? []) {
        await client.query(
          `
            INSERT INTO record_tags (record_id, tag)
            VALUES ($1, $2)
          `,
          [record.id, tag],
        );
      }

      if (body.drawingId) {
        await client.query(
          `
            UPDATE drawing_docs
            SET record_id = $1, updated_at = NOW()
            WHERE id = $2 AND owner_user_id = $3
          `,
          [record.id, body.drawingId, user.id],
        );
      }

      if (imageIds.length > 0) {
        await client.query(
          `
            UPDATE media_assets
            SET
              record_id = $1,
              manual_review_required = TRUE,
              content_moderation_status = 'pending_manual',
              content_reviewed_by = NULL,
              content_reviewed_at = NULL,
              content_review_notes = NULL,
              updated_at = NOW()
            WHERE owner_user_id = $2
              AND id = ANY($3::uuid[])
              AND media_type = 'image'
          `,
          [record.id, user.id, imageIds],
        );
      }

      const recordNode = await client.query<{ id: string }>(
        `
          INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
          VALUES ($1, $2, 'record', $3, $4::jsonb)
          RETURNING id
        `,
        [
          user.id,
          record.id,
          publicSanitization.displayMoodPhrase,
          JSON.stringify({
            visibilityIntent,
            publicationStatus: publicationDecision.publicationStatus,
          }),
        ],
      );

      if (body.quote) {
        const quoteNode = await client.query<{ id: string }>(
          `
            INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
            VALUES ($1, $2, 'quote', $3, '{}'::jsonb)
            RETURNING id
          `,
          [user.id, record.id, publicSanitization.publicQuote ?? body.quote],
        );
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'manual', 0.8)
          `,
          [recordNode.rows[0].id, quoteNode.rows[0].id],
        );
      }

      const revisionNo = await createRecordRevision({
        client,
        recordId: record.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: body.moodPhrase,
          description: body.description ?? null,
          quote: body.quote ?? null,
          extraEmotions: body.extraEmotions ?? [],
          tags: body.tags ?? [],
          visibilityIntent,
          imageIds,
          publicSanitization,
        },
      });

      await applyPublicationDecision({
        client,
        recordId: record.id,
        userId: user.id,
        triggerIpHash,
        visibilityIntent,
        assessment,
        decision: publicationDecision,
        revisionNo,
        reviewStage: "auto",
        modelMeta: {
          source: "text_rules",
        },
        publicSanitization,
      });

      const summary = await loadRecordSummary(client, record.id);
      if (!summary) {
        throw new Error("记录创建后读取失败");
      }
      const replyContext = await loadReplyContext(client, {
        sourceCommentId: summary.source_comment_id,
        requesterUserId: user.id,
      });
      return {
        record: buildRecordSummaryPayload({ summary, replyContext, requesterUserId: user.id }),
        raw: summary,
      };
    });

    broadcast("record.created", {
      recordId: result.raw.id,
      userId: user.id,
      isPublic: result.raw.is_public,
      publicationStatus: result.raw.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.create",
      targetType: "record",
      targetId: result.raw.id,
      payload: {
        isPublic: result.raw.is_public,
        publicationStatus: result.raw.publication_status,
        visibilityIntent: result.raw.visibility_intent,
      },
    });

    return {
      record: result.record,
      publishStatus: {
        status: result.raw.publication_status,
        label: publicationLabel(result.raw.publication_status),
      },
      moderation: {
        customMood: moodCheck.customMood.isCustom,
        strictReviewRequired: moodCheck.customMood.isCustom || (assessment.normalizedText?.flags.length ?? 0) > 0,
        publicSanitizationApplied: publicSanitization.sanitizationApplied,
        publicSanitizationPreview: {
          displayMoodPhrase: publicSanitization.displayMoodPhrase,
          description: publicSanitization.publicDescription,
          quote: publicSanitization.publicQuote,
        },
      },
    };
  });

  app.patch("/records/:id", async (req, reply) => {
    const user = await requireWriteUser(req, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = recordPatchSchema.parse(req.body);
    if (body.moodPhrase) {
      const moodCheck = validateMoodInputOrReply(reply, body.moodPhrase);
      if (!moodCheck.ok) {
        return;
      }
    }

    const current = await query<RecordRow>(
      `
        SELECT *
        FROM records
        WHERE id = $1 AND user_id = $2
      `,
      [params.id, user.id],
    );
    if (current.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    const record = current.rows[0];
    if (new Date(record.edit_deadline_at).getTime() < Date.now()) {
      reply.code(403).send({ message: "正文编辑窗口已超过 30 天" });
      return;
    }

    if (body.quote) {
      const quoteCheck = validateQuoteLength(body.quote);
      if (!quoteCheck.ok) {
        reply.code(400).send({ message: quoteCheck.reason });
        return;
      }
    }

    const triggerIpHash = hashIp(req.ip);
    const updatedRecord = await withTransaction(async (client) => {
      const hasMoodPhrase = Object.prototype.hasOwnProperty.call(body, "moodPhrase");
      const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
      const hasOccurredAt = Object.prototype.hasOwnProperty.call(body, "occurredAt");
      const hasLocationId = Object.prototype.hasOwnProperty.call(body, "locationId");

      await client.query(
        `
          UPDATE records
          SET
            mood_phrase = CASE WHEN $1 THEN $2 ELSE mood_phrase END,
            description = CASE WHEN $3 THEN $4 ELSE description END,
            occurred_at = CASE WHEN $5 THEN $6 ELSE occurred_at END,
            location_id = CASE WHEN $7 THEN $8 ELSE location_id END,
            requires_re_review = TRUE,
            updated_at = NOW()
          WHERE id = $9 AND user_id = $10
        `,
        [
          hasMoodPhrase,
          body.moodPhrase ?? null,
          hasDescription,
          body.description ?? null,
          hasOccurredAt,
          body.occurredAt ?? null,
          hasLocationId,
          body.locationId ?? null,
          params.id,
          user.id,
        ],
      );

      if (Object.prototype.hasOwnProperty.call(body, "quote")) {
        if (!body.quote || body.quote.trim().length === 0) {
          await client.query("DELETE FROM record_quotes WHERE record_id = $1", [params.id]);
        } else {
          await client.query(
            `
              INSERT INTO record_quotes (record_id, quote)
              VALUES ($1, $2)
              ON CONFLICT (record_id)
              DO UPDATE SET quote = EXCLUDED.quote, updated_at = NOW()
            `,
            [params.id, body.quote],
          );
        }
      }

      if (body.extraEmotions) {
        await client.query("DELETE FROM record_emotions WHERE record_id = $1", [params.id]);
        for (const emotion of body.extraEmotions) {
          await client.query(
            `
              INSERT INTO record_emotions (record_id, emotion)
              VALUES ($1, $2)
            `,
            [params.id, emotion],
          );
        }
      }

      if (body.tags) {
        await client.query("DELETE FROM record_tags WHERE record_id = $1", [params.id]);
        for (const tag of body.tags) {
          await client.query(
            `
              INSERT INTO record_tags (record_id, tag)
              VALUES ($1, $2)
            `,
            [params.id, tag],
          );
        }
      }

      const moderationInput = await loadRecordModerationInput(client, params.id);
      if (!moderationInput || moderationInput.user_id !== user.id) {
        throw new Error("记录不存在");
      }

      const customMood = validateCustomMoodPhrase(moderationInput.mood_phrase);
      const assessment = assessModeration({
        moodPhrase: moderationInput.mood_phrase,
        description: moderationInput.description,
        quote: moderationInput.quote,
        extraEmotions: moderationInput.extra_emotions,
        tags: moderationInput.tags,
      });
      const publicSanitization = buildPublicSanitizedVariant({
        moodPhrase: moderationInput.mood_phrase,
        description: moderationInput.description,
        quote: moderationInput.quote,
        occurredAt: moderationInput.occurred_at,
      });
      const publicationDecision = decidePublication({
        visibilityIntent: moderationInput.visibility_intent,
        hasImages: moderationInput.has_images,
        textAssessment: assessment,
        hasCustomMood: customMood.isCustom,
        strictReviewRequired: customMood.isCustom || (assessment.normalizedText?.flags.length ?? 0) > 0,
        hasPublicSanitizationRisk: publicSanitization.sanitizationApplied,
      });
      const finalDecision: PublicationDecision =
        publicationDecision.publicationStatus === "risk_control_24h"
          ? publicationDecision
          : {
              ...publicationDecision,
              publicationStatus: "pending_second_review",
              isPublic: false,
              queueType: "second_review",
              queuePriority: publicationDecision.queuePriority ?? 4,
              reason: "内容修改后进入二次审查",
            };

      const revisionNo = await createRecordRevision({
        client,
        recordId: params.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: moderationInput.mood_phrase,
          description: moderationInput.description,
          quote: moderationInput.quote,
          extraEmotions: moderationInput.extra_emotions,
          tags: moderationInput.tags,
          visibilityIntent: moderationInput.visibility_intent,
          hasImages: moderationInput.has_images,
          publicSanitization,
        },
      });

      await applyPublicationDecision({
        client,
        recordId: params.id,
        userId: user.id,
        triggerIpHash,
        visibilityIntent: moderationInput.visibility_intent,
        assessment,
        decision: finalDecision,
        revisionNo,
        reviewStage: "auto",
        modelMeta: {
          source: "text_rules_edit",
        },
        publicSanitization,
      });

      const summary = await loadRecordSummary(client, params.id);
      if (!summary) {
        throw new Error("记录读取失败");
      }
      const replyContext = await loadReplyContext(client, {
        sourceCommentId: summary.source_comment_id,
        requesterUserId: user.id,
      });

      return {
        summary,
        record: buildRecordSummaryPayload({ summary, replyContext, requesterUserId: user.id }),
      };
    });

    broadcast("record.updated", {
      recordId: params.id,
      userId: user.id,
      publicationStatus: updatedRecord.summary.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.update",
      targetType: "record",
      targetId: params.id,
      payload: {
        publicationStatus: updatedRecord.summary.publication_status,
      },
    });

    return {
      ok: true,
      record: updatedRecord.record,
      publishStatus: {
        status: updatedRecord.summary.publication_status,
        label: publicationLabel(updatedRecord.summary.publication_status),
      },
    };
  });

  app.patch("/records/:id/visibility", async (req, reply) => {
    const user = await requireWriteUser(req, reply);
    if (!user) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ isPublic: z.boolean() }).parse(req.body);

    const triggerIpHash = hashIp(req.ip);
    const result = await withTransaction(async (client) => {
      const existing = await loadRecordModerationInput(client, params.id);
      if (!existing || existing.user_id !== user.id) {
        return null;
      }

      const visibilityIntent = parseRecordVisibilityIntent(body.isPublic);
      const customMood = validateCustomMoodPhrase(existing.mood_phrase);
      const assessment = assessModeration({
        moodPhrase: existing.mood_phrase,
        description: existing.description,
        quote: existing.quote,
        extraEmotions: existing.extra_emotions,
        tags: existing.tags,
      });
      const publicSanitization = buildPublicSanitizedVariant({
        moodPhrase: existing.mood_phrase,
        description: existing.description,
        quote: existing.quote,
        occurredAt: existing.occurred_at,
      });
      const publicationDecision = decidePublication({
        visibilityIntent,
        hasImages: existing.has_images,
        textAssessment: assessment,
        hasCustomMood: customMood.isCustom,
        strictReviewRequired: customMood.isCustom || (assessment.normalizedText?.flags.length ?? 0) > 0,
        hasPublicSanitizationRisk: publicSanitization.sanitizationApplied,
      });

      const revisionNo = await createRecordRevision({
        client,
        recordId: params.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: existing.mood_phrase,
          description: existing.description,
          quote: existing.quote,
          extraEmotions: existing.extra_emotions,
          tags: existing.tags,
          visibilityIntent,
          hasImages: existing.has_images,
          publicSanitization,
        },
      });

      await applyPublicationDecision({
        client,
        recordId: params.id,
        userId: user.id,
        triggerIpHash,
        visibilityIntent,
        assessment,
        decision: publicationDecision,
        revisionNo,
        reviewStage: "auto",
        modelMeta: {
          source: "visibility_switch",
        },
        publicSanitization,
      });

      await client.query(
        `
          INSERT INTO user_preferences (user_id, last_visibility_public)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET last_visibility_public = EXCLUDED.last_visibility_public, updated_at = NOW()
        `,
        [user.id, body.isPublic],
      );

      const latest = await loadRecordSummary(client, params.id);
      if (!latest) {
        return null;
      }
      const replyContext = await loadReplyContext(client, {
        sourceCommentId: latest.source_comment_id,
        requesterUserId: user.id,
      });
      return {
        raw: latest,
        record: buildRecordSummaryPayload({ summary: latest, replyContext, requesterUserId: user.id }),
      };
    });

    if (!result) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    broadcast("record.updated", {
      recordId: params.id,
      isPublic: result.raw.is_public,
      publicationStatus: result.raw.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.visibility_update",
      targetType: "record",
      targetId: params.id,
      payload: {
        isPublic: result.raw.is_public,
        publicationStatus: result.raw.publication_status,
      },
    });

    return {
      record: result.record,
      publishStatus: {
        status: result.raw.publication_status,
        label: publicationLabel(result.raw.publication_status),
      },
    };
  });

  app.get("/records/:id/publish-status", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const rows = await query<RecordRow>(
      `
        SELECT *
        FROM records
        WHERE id = $1
      `,
      [params.id],
    );

    if (rows.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    const target = rows.rows[0];
    const isOwner = !!req.user && req.user.id === target.user_id;
    if (!isOwner && !isPubliclyVisibleStatus(target.publication_status)) {
      reply.code(403).send({ message: "无权限访问该记录状态" });
      return;
    }

    return {
      recordId: target.id,
      visibilityIntent: target.visibility_intent,
      status: target.publication_status,
      label: publicationLabel(target.publication_status),
      isPublic: target.is_public,
      publishRequestedAt: target.publish_requested_at,
      publishedAt: target.published_at,
      reviewNotes: target.review_notes,
      riskSummary: target.risk_summary,
    };
  });

  app.get("/records/:id", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const summary = await loadRecordSummary({ query }, params.id);
    if (!summary) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    const canRead =
      isPubliclyVisibleStatus(summary.publication_status) || (req.user && req.user.id === summary.user_id);
    if (!canRead) {
      reply.code(403).send({ message: "无权限访问该记录" });
      return;
    }

    const isOwner = !!req.user && req.user.id === summary.user_id;
    const replyContext = await loadReplyContext({ query }, {
      sourceCommentId: summary.source_comment_id,
      requesterUserId: req.user?.id ?? null,
    });

    return {
      record: {
        id: summary.id,
        user_id: summary.user_id,
        mood_phrase: isOwner ? summary.mood_phrase : summary.display_mood_phrase ?? summary.mood_phrase,
        description: isOwner ? summary.description : summary.public_description ?? summary.description,
        is_public: summary.is_public,
        visibility_intent: summary.visibility_intent,
        publication_status: summary.publication_status,
        publish_requested_at: summary.publish_requested_at,
        published_at: summary.published_at,
        risk_summary: summary.risk_summary,
        review_notes: summary.review_notes,
        occurred_at: isOwner ? summary.occurred_at : summary.public_occurred_at ?? summary.occurred_at,
        location_id: isOwner ? summary.location_id : null,
        public_location_label: isOwner ? null : summary.public_location_label,
        source_record_id: summary.source_record_id,
        source_comment_id: summary.source_comment_id,
        edit_deadline_at: summary.edit_deadline_at,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        sanitized: !isOwner && !!(summary.display_mood_phrase || summary.public_description || summary.public_quote || summary.public_location_label),
      },
      quote: isOwner ? summary.quote : summary.public_quote ?? summary.quote,
      extraEmotions: summary.extra_emotions,
      tags: summary.tags,
      author: buildRecordAuthorPayload(summary),
      replyContext,
      rawContent: isOwner
        ? {
            moodPhrase: summary.mood_phrase,
            description: summary.description,
            quote: summary.quote,
            occurredAt: summary.occurred_at,
            locationId: summary.location_id,
          }
        : null,
    };
  });

  app.get("/home/feed", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const querySchema = z.object({
      limit: z.coerce.number().int().positive().max(50).default(20),
      cursor: z.string().optional(),
    });
    const q = querySchema.parse(req.query);

    const rows = await query<RecordFeedRow>(
      `
        SELECT
          r.*,
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
          ), ARRAY[]::text[]) AS tags
        FROM records r
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        WHERE r.user_id = $1
          AND ($2::timestamptz IS NULL OR r.created_at < $2::timestamptz)
        ORDER BY r.created_at DESC
        LIMIT $3
      `,
      [user.id, q.cursor ?? null, q.limit],
    );

    const nextCursor = rows.rows.length > 0 ? rows.rows[rows.rows.length - 1].created_at : null;
    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        mood_phrase: row.display_mood_phrase ?? row.mood_phrase,
        quote: row.public_quote ?? row.quote,
        extra_emotions: row.extra_emotions,
        tags: row.tags,
        description: row.public_description ?? row.description,
        occurred_at: row.public_occurred_at ?? row.occurred_at,
        public_location_label: row.public_location_label,
        public_occurred_at: row.public_occurred_at,
        sanitized: !!(row.display_mood_phrase || row.public_description || row.public_quote || row.public_location_label),
        visibility_intent: row.visibility_intent,
        publication_status: row.publication_status,
        is_public: row.is_public,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      nextCursor,
    };
  });
}

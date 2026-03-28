import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAccessApproved, requireNotInRiskControl, requireUser } from "../lib/auth.js";
import { query, withTransaction } from "../lib/db.js";
import { broadcast } from "../lib/realtime.js";
import { validateMoodPhraseLength, validateQuoteLength, hashIp } from "../lib/utils.js";
import { writeAuditLog } from "../lib/audit.js";
import { assessModeration } from "../lib/moderation.js";
import { buildMoodCatalog } from "../lib/mood-catalog.js";
import { moodModeValues, normalizeEmotionSelection, type EmotionSelection, type MoodMode } from "../lib/emotion-selection.js";
import { syncRecordMindMapNode } from "../lib/mindmap-records.js";
import { buildPublicLocationSummary, redactOccurredAtToMonth, redactPublicText } from "../lib/public-redaction.js";
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
import { buildRecordAuthorPayload, loadRecordSummary, loadReplyContext } from "../lib/record-views.js";

const moodModeSchema = z.enum(moodModeValues);

const recordCreateSchema = z.object({
  moodPhrase: z.string().trim().min(1).max(140),
  moodMode: moodModeSchema.optional(),
  customMoodPhrase: z.string().trim().min(1).max(32).optional().nullable(),
  quote: z.string().trim().min(1).max(200).optional(),
  extraEmotions: z.array(z.string().trim().min(1).max(32)).optional(),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
  imageIds: z.array(z.string().uuid()).max(4).optional(),
  drawingId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

const recordPatchSchema = z.object({
  moodPhrase: z.string().trim().min(1).max(140).optional(),
  moodMode: moodModeSchema.optional(),
  customMoodPhrase: z.string().trim().min(1).max(32).optional().nullable(),
  quote: z.string().max(200).optional().nullable(),
  extraEmotions: z.array(z.string().trim().min(1).max(32)).optional(),
  description: z.string().max(1000).optional(),
  occurredAt: z.string().datetime().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

type RecordRow = {
  id: string;
  user_id: string;
  mood_phrase: string;
  mood_mode?: MoodMode;
  custom_mood_phrase?: string | null;
  description: string | null;
  is_public: boolean;
  visibility_intent: VisibilityIntent;
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
};

type RecordFeedRow = RecordRow & {
  quote: string | null;
  extra_emotions: string[];
  tags: string[];
};

type RecordModerationInput = {
  id: string;
  user_id: string;
  mood_phrase: string;
  description: string | null;
  quote: string | null;
  extra_emotions: string[];
  tags: string[];
  has_images: boolean;
  visibility_intent: VisibilityIntent;
  occurred_at?: string | null;
  location_id?: string | null;
  mood_mode?: MoodMode;
  custom_mood_phrase?: string | null;
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
        r.visibility_intent,
        r.occurred_at,
        r.location_id,
        r.mood_mode,
        r.custom_mood_phrase,
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

export async function recordsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/records/mood-options", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const seed = `${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return buildMoodCatalog(seed);
  });

  app.post("/records", async (req, reply) => {
    const user = await requireWriteUser(req, reply, { checkRiskControl: false });
    if (!user) {
      return;
    }

    const body = recordCreateSchema.parse(req.body);
    const title = body.moodPhrase.trim();
    const moodPhraseCheck = validateMoodPhraseLength(title);
    if (!moodPhraseCheck.ok) {
      reply.code(400).send({ message: moodPhraseCheck.reason });
      return;
    }

    let emotionSelection: EmotionSelection;
    try {
      emotionSelection = normalizeEmotionSelection({
        extraEmotions: body.extraEmotions ?? [],
        moodMode: body.moodMode,
        customMoodPhrase: body.customMoodPhrase ?? null,
      });
    } catch (error) {
      reply.code(400).send({ message: error instanceof Error ? error.message : "情绪标签校验失败" });
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
      moodPhrase: title,
      customMoodPhrase: emotionSelection.customMoodPhrase,
      description: body.description ?? null,
      quote: body.quote ?? null,
      extraEmotions: emotionSelection.extraEmotions,
      tags: body.tags ?? [],
      isPublic: visibilityIntent === "public",
      isCustomMood: emotionSelection.isCustomMood,
    });
    const publicationDecision = decidePublication({
      visibilityIntent,
      hasImages: imageIds.length > 0,
      textAssessment: assessment,
      isCustomMood: emotionSelection.isCustomMood,
      hasAdOrUrlRisk: assessment.hasAdOrUrlRisk,
      requiresManualReview: assessment.requiresManualReview,
    });

    const triggerIpHash = hashIp(req.ip);
    const result = await withTransaction(async (client) => {
      const inserted = await client.query<RecordRow>(
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
            occurred_at,
            location_id,
            mood_mode,
            custom_mood_phrase
          ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'public' THEN NOW() ELSE NULL END, CASE WHEN $4 THEN NOW() ELSE NULL END, $7::jsonb, $8, $9, $10, $11)
          RETURNING *
        `,
        [
          user.id,
          title,
          body.description ?? null,
          publicationDecision.isPublic,
          visibilityIntent,
          publicationDecision.publicationStatus,
          JSON.stringify(
            buildRiskSummary({
              assessment,
              decision: publicationDecision,
              moodMode: emotionSelection.moodMode,
              customMoodPhrase: emotionSelection.customMoodPhrase,
            }),
          ),
          body.occurredAt ?? null,
          body.locationId ?? null,
          emotionSelection.moodMode,
          emotionSelection.customMoodPhrase,
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

      for (const emotion of emotionSelection.extraEmotions) {
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

      const recordNodeId = await syncRecordMindMapNode(client, {
        ownerUserId: user.id,
        recordId: record.id,
      });

      if (body.quote && recordNodeId) {
        const quoteNode = await client.query<{ id: string }>(
          `
            INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
            VALUES ($1, $2, 'quote', $3, '{}'::jsonb)
            RETURNING id
          `,
          [user.id, record.id, body.quote],
        );
        await client.query(
          `
            INSERT INTO mindmap_edges (source_node_id, target_node_id, edge_type, weight)
            VALUES ($1, $2, 'manual', 0.8)
          `,
          [recordNodeId, quoteNode.rows[0].id],
        );
      }

      const revisionNo = await createRecordRevision({
        client,
        recordId: record.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: title,
          customMoodPhrase: emotionSelection.customMoodPhrase,
          description: body.description ?? null,
          quote: body.quote ?? null,
          extraEmotions: emotionSelection.extraEmotions,
          tags: body.tags ?? [],
          visibilityIntent,
          imageIds,
          moodMode: emotionSelection.moodMode,
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
        moodMode: emotionSelection.moodMode,
        customMoodPhrase: emotionSelection.customMoodPhrase,
      });

      const latest = await client.query<RecordRow>(
        `
          SELECT *
          FROM records
          WHERE id = $1
        `,
        [record.id],
      );

      return latest.rows[0];
    });

    broadcast("record.created", {
      recordId: result.id,
      userId: user.id,
      isPublic: result.is_public,
      publicationStatus: result.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.create",
      targetType: "record",
      targetId: result.id,
      payload: {
        isPublic: result.is_public,
        publicationStatus: result.publication_status,
        visibilityIntent: result.visibility_intent,
      },
    });

    return {
      record: result,
      publishStatus: {
        status: result.publication_status,
        label: publicationLabel(result.publication_status),
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

    const nextTitle = body.moodPhrase?.trim() ?? record.mood_phrase;
    const titleCheck = validateMoodPhraseLength(nextTitle);
    if (!titleCheck.ok) {
      reply.code(400).send({ message: titleCheck.reason });
      return;
    }

    const triggerIpHash = hashIp(req.ip);
    const updatedRecord = await withTransaction(async (client) => {
      const hasMoodPhrase = Object.prototype.hasOwnProperty.call(body, "moodPhrase");
      const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
      const hasOccurredAt = Object.prototype.hasOwnProperty.call(body, "occurredAt");
      const hasLocationId = Object.prototype.hasOwnProperty.call(body, "locationId");
      const hasCustomMoodPhrase = Object.prototype.hasOwnProperty.call(body, "customMoodPhrase");
      const hasMoodMode = Object.prototype.hasOwnProperty.call(body, "moodMode");
      const hasExtraEmotions = Object.prototype.hasOwnProperty.call(body, "extraEmotions");
      const moderationInput = await loadRecordModerationInput(client, params.id);
      if (!moderationInput || moderationInput.user_id !== user.id) {
        throw new Error("记录不存在");
      }

      const existingCustomMood = moderationInput.custom_mood_phrase?.trim() || null;
      let rawNextExtraEmotions = hasExtraEmotions ? body.extraEmotions ?? [] : [...moderationInput.extra_emotions];
      if (!hasExtraEmotions && existingCustomMood) {
        const requestedCustomMood = hasCustomMoodPhrase ? body.customMoodPhrase?.trim() || null : existingCustomMood;
        const shouldDropExistingCustom = requestedCustomMood !== existingCustomMood || (hasMoodMode && body.moodMode !== "custom");
        if (shouldDropExistingCustom) {
          rawNextExtraEmotions = rawNextExtraEmotions.filter((emotion) => emotion !== existingCustomMood);
        }
        if (requestedCustomMood && !rawNextExtraEmotions.includes(requestedCustomMood)) {
          rawNextExtraEmotions.push(requestedCustomMood);
        }
      }

      let nextEmotionSelection: EmotionSelection;
      try {
        nextEmotionSelection = normalizeEmotionSelection({
          extraEmotions: rawNextExtraEmotions,
          moodMode: body.moodMode ?? (hasExtraEmotions ? "preset" : moderationInput.mood_mode ?? "preset"),
          customMoodPhrase:
            hasCustomMoodPhrase
              ? body.customMoodPhrase ?? null
              : hasExtraEmotions
                ? null
              : hasMoodMode && body.moodMode !== "custom"
                ? null
                : moderationInput.custom_mood_phrase ?? null,
        });
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : "情绪标签校验失败" });
        return null;
      }

      const nextTitleValue = hasMoodPhrase ? body.moodPhrase?.trim() ?? moderationInput.mood_phrase : moderationInput.mood_phrase;
      const nextQuote = Object.prototype.hasOwnProperty.call(body, "quote")
        ? body.quote?.trim() || null
        : moderationInput.quote;
      const nextDescription = hasDescription ? body.description ?? null : moderationInput.description;
      const nextOccurredAt = hasOccurredAt ? body.occurredAt ?? null : moderationInput.occurred_at ?? null;
      const nextLocationId = hasLocationId ? body.locationId ?? null : moderationInput.location_id ?? null;
      const nextExtraEmotions = nextEmotionSelection.extraEmotions;
      const nextTags = body.tags ?? moderationInput.tags;
      const shouldSyncEmotions = hasExtraEmotions || hasCustomMoodPhrase || hasMoodMode;
      await client.query(
        `
          UPDATE records
          SET
            mood_phrase = CASE WHEN $1 THEN $2 ELSE mood_phrase END,
            description = CASE WHEN $3 THEN $4 ELSE description END,
            occurred_at = CASE WHEN $5 THEN $6 ELSE occurred_at END,
            location_id = CASE WHEN $7 THEN $8 ELSE location_id END,
            mood_mode = CASE WHEN $9 THEN $10 ELSE mood_mode END,
            custom_mood_phrase = CASE WHEN $11 THEN $12 ELSE custom_mood_phrase END,
            requires_re_review = TRUE,
            updated_at = NOW()
          WHERE id = $13 AND user_id = $14
        `,
        [
          hasMoodPhrase || nextTitleValue !== moderationInput.mood_phrase,
          nextTitleValue,
          hasDescription,
          nextDescription,
          hasOccurredAt,
          nextOccurredAt,
          hasLocationId,
          nextLocationId,
          hasMoodMode || nextEmotionSelection.moodMode !== moderationInput.mood_mode,
          nextEmotionSelection.moodMode,
          hasCustomMoodPhrase || nextEmotionSelection.customMoodPhrase !== (moderationInput.custom_mood_phrase ?? null),
          nextEmotionSelection.customMoodPhrase,
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

      if (shouldSyncEmotions) {
        await client.query("DELETE FROM record_emotions WHERE record_id = $1", [params.id]);
        for (const emotion of nextExtraEmotions) {
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

      const assessment = assessModeration({
        moodPhrase: nextTitleValue,
        customMoodPhrase: nextEmotionSelection.customMoodPhrase,
        description: nextDescription,
        quote: nextQuote,
        extraEmotions: nextExtraEmotions,
        tags: nextTags,
        isPublic: moderationInput.visibility_intent === "public",
        isCustomMood: nextEmotionSelection.isCustomMood,
      });
      const publicationDecision = decidePublication({
        visibilityIntent: moderationInput.visibility_intent,
        hasImages: moderationInput.has_images,
        textAssessment: assessment,
        isCustomMood: nextEmotionSelection.isCustomMood,
        hasAdOrUrlRisk: assessment.hasAdOrUrlRisk,
        requiresManualReview: assessment.requiresManualReview,
      });
      const finalDecision: PublicationDecision =
        publicationDecision.publicationStatus === "risk_control_24h"
          ? publicationDecision
          : {
              ...publicationDecision,
              isPublic: false,
              reason: publicationDecision.reason === "低/极低风险公开内容可直发" ? "内容修改后重新进入审核" : publicationDecision.reason,
            };

      const revisionNo = await createRecordRevision({
        client,
        recordId: params.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: nextTitleValue,
          customMoodPhrase: nextEmotionSelection.customMoodPhrase,
          description: nextDescription,
          quote: nextQuote,
          extraEmotions: nextExtraEmotions,
          tags: nextTags,
          visibilityIntent: moderationInput.visibility_intent,
          hasImages: moderationInput.has_images,
          moodMode: nextEmotionSelection.moodMode,
          occurredAt: nextOccurredAt,
          locationId: nextLocationId,
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
        moodMode: nextEmotionSelection.moodMode,
        customMoodPhrase: nextEmotionSelection.customMoodPhrase,
      });

      await syncRecordMindMapNode(client, {
        ownerUserId: user.id,
        recordId: params.id,
      });

      const latest = await client.query<RecordRow>(
        `
          SELECT *
          FROM records
          WHERE id = $1
        `,
        [params.id],
      );

      return latest.rows[0];
    });

    if (!updatedRecord) {
      return;
    }

    broadcast("record.updated", {
      recordId: params.id,
      userId: user.id,
      publicationStatus: updatedRecord.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.update",
      targetType: "record",
      targetId: params.id,
      payload: {
        publicationStatus: updatedRecord.publication_status,
      },
    });

    return {
      ok: true,
      record: updatedRecord,
      publishStatus: {
        status: updatedRecord.publication_status,
        label: publicationLabel(updatedRecord.publication_status),
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

    if (body.isPublic) {
      const allowed = await requireNotInRiskControl(req, reply);
      if (!allowed) {
        return;
      }
    }

    const triggerIpHash = hashIp(req.ip);
    const result = await withTransaction(async (client) => {
      const existing = await loadRecordModerationInput(client, params.id);
      if (!existing || existing.user_id !== user.id) {
        return null;
      }

      const visibilityIntent = parseRecordVisibilityIntent(body.isPublic);
      const assessment = assessModeration({
        moodPhrase: existing.mood_phrase,
        customMoodPhrase: existing.custom_mood_phrase ?? null,
        description: existing.description,
        quote: existing.quote,
        extraEmotions: existing.extra_emotions,
        tags: existing.tags,
        isPublic: visibilityIntent === "public",
        isCustomMood: existing.mood_mode === "custom",
      });
      const publicationDecision = decidePublication({
        visibilityIntent,
        hasImages: existing.has_images,
        textAssessment: assessment,
        isCustomMood: existing.mood_mode === "custom",
        hasAdOrUrlRisk: assessment.hasAdOrUrlRisk,
        requiresManualReview: assessment.requiresManualReview,
      });

      const revisionNo = await createRecordRevision({
        client,
        recordId: params.id,
        editedBy: user.id,
        snapshot: {
          moodPhrase: existing.mood_phrase,
          customMoodPhrase: existing.custom_mood_phrase ?? null,
          description: existing.description,
          quote: existing.quote,
          extraEmotions: existing.extra_emotions,
          tags: existing.tags,
          visibilityIntent,
          hasImages: existing.has_images,
          moodMode: existing.mood_mode ?? "preset",
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
        moodMode: existing.mood_mode ?? "preset",
        customMoodPhrase: existing.custom_mood_phrase ?? null,
      });

      await syncRecordMindMapNode(client, {
        ownerUserId: user.id,
        recordId: params.id,
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

      const latest = await client.query<RecordRow>(
        `
          SELECT *
          FROM records
          WHERE id = $1
        `,
        [params.id],
      );
      return latest.rows[0] ?? null;
    });

    if (!result) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }

    broadcast("record.updated", {
      recordId: params.id,
      isPublic: result.is_public,
      publicationStatus: result.publication_status,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "record.visibility_update",
      targetType: "record",
      targetId: params.id,
      payload: {
        isPublic: result.is_public,
        publicationStatus: result.publication_status,
      },
    });

    return {
      record: result,
      publishStatus: {
        status: result.publication_status,
        label: publicationLabel(result.publication_status),
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

    const replyContext = await loadReplyContext({ query }, {
      sourceCommentId: summary.source_comment_id,
      requesterUserId: req.user?.id ?? null,
    });

    const isOwner = !!req.user && req.user.id === summary.user_id;
    const locationSummary = buildPublicLocationSummary({
      country: summary.location_country,
      region: summary.location_region,
      city: summary.location_city,
    });

    return {
      record: {
        id: summary.id,
        user_id: summary.user_id,
        mood_phrase: summary.mood_phrase,
        description: isOwner ? summary.description : redactPublicText(summary.description),
        is_public: summary.is_public,
        visibility_intent: summary.visibility_intent,
        publication_status: summary.publication_status,
        publish_requested_at: summary.publish_requested_at,
        published_at: summary.published_at,
        risk_summary: summary.risk_summary,
        review_notes: summary.review_notes,
        occurred_at: isOwner ? summary.occurred_at : redactOccurredAtToMonth(summary.occurred_at),
        location_id: isOwner ? summary.location_id : null,
        location_summary: locationSummary,
        mood_mode: summary.mood_mode ?? "preset",
        custom_mood_phrase: summary.custom_mood_phrase ?? null,
        source_record_id: summary.source_record_id,
        source_comment_id: summary.source_comment_id,
        edit_deadline_at: summary.edit_deadline_at,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
      },
      quote: isOwner ? summary.quote : redactPublicText(summary.quote),
      extraEmotions: summary.extra_emotions,
      tags: summary.tags,
      author: buildRecordAuthorPayload(summary),
      replyContext,
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
      items: rows.rows,
      nextCursor,
    };
  });
}

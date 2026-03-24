import type { PoolClient } from "pg";
import type { ModerationAssessment, RiskLevel } from "./moderation.js";
import {
  publicationStateLabel,
  type PublicationDecision,
  type VisibilityIntent,
} from "./publication-workflow.js";
import { activateRiskControl, enqueueModerationQueue } from "./risk-control.js";

function toRiskControlLevel(level: RiskLevel): "medium" | "elevated" | "high" | "very_high" {
  if (level === "very_high") {
    return "very_high";
  }
  if (level === "high") {
    return "high";
  }
  if (level === "elevated") {
    return "elevated";
  }
  return "medium";
}

export function buildRiskSummary(args: {
  assessment: ModerationAssessment;
  decision: PublicationDecision;
  aiRiskLevel?: RiskLevel | null;
}): Record<string, unknown> {
  return {
    level: args.decision.effectiveRiskLevel,
    labels: args.assessment.riskLabels,
    reason: args.decision.reason,
    autoReason: args.assessment.reason,
    baselineHighRisk: args.assessment.baselineHighRisk,
    violationType: args.assessment.violationType,
    confidence: args.assessment.confidence,
    score: args.assessment.riskScore,
    aiRiskLevel: args.aiRiskLevel ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export async function createRecordRevision(args: {
  client: Pick<PoolClient, "query">;
  recordId: string;
  editedBy: string;
  snapshot: Record<string, unknown>;
}): Promise<number> {
  const nextNo = await args.client.query<{ next_no: string }>(
    `
      SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no
      FROM record_revisions
      WHERE record_id = $1
    `,
    [args.recordId],
  );

  const revisionNo = Number(nextNo.rows[0]?.next_no ?? "1");
  await args.client.query(
    `
      INSERT INTO record_revisions (record_id, revision_no, edited_by, content_snapshot)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [args.recordId, revisionNo, args.editedBy, JSON.stringify(args.snapshot)],
  );
  return revisionNo;
}

export async function applyPublicationDecision(args: {
  client: Pick<PoolClient, "query">;
  recordId: string;
  userId: string;
  triggerIpHash: string;
  visibilityIntent: VisibilityIntent;
  assessment: ModerationAssessment;
  decision: PublicationDecision;
  revisionNo: number | null;
  reviewStage: "auto" | "manual";
  reviewerUserId?: string | null;
  modelMeta?: Record<string, unknown>;
  aiRiskLevel?: RiskLevel | null;
}): Promise<{ riskControlEventId: string | null; riskControlEndsAt: string | null }> {
  const riskSummary = buildRiskSummary({
    assessment: args.assessment,
    decision: args.decision,
    aiRiskLevel: args.aiRiskLevel ?? null,
  });

  const reviewDecision = args.assessment.decision;
  const review = await args.client.query<{ id: string }>(
    `
      INSERT INTO content_reviews (
        target_type,
        target_id,
        target_revision_no,
        review_stage,
        decision,
        confidence,
        risk_score,
        risk_labels,
        reason,
        model_meta,
        reviewer_user_id
      )
      VALUES (
        'record',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10
      )
      RETURNING id
    `,
    [
      args.recordId,
      args.revisionNo,
      args.reviewStage,
      reviewDecision,
      args.assessment.confidence,
      args.assessment.riskScore,
      args.assessment.riskLabels,
      args.assessment.reason,
      JSON.stringify({
        ...args.modelMeta,
        effectiveRiskLevel: args.decision.effectiveRiskLevel,
        publicationDecision: args.decision.publicationStatus,
      }),
      args.reviewerUserId ?? null,
    ],
  );

  await args.client.query(
    `
      UPDATE records
      SET
        visibility_intent = $2,
        publication_status = $3,
        is_public = $4,
        publish_requested_at = CASE WHEN $2 = 'public' THEN COALESCE(publish_requested_at, NOW()) ELSE NULL END,
        published_at = CASE WHEN $4 THEN COALESCE(published_at, NOW()) ELSE NULL END,
        last_review_id = $5,
        requires_re_review = FALSE,
        risk_summary = $6::jsonb,
        review_notes = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      args.recordId,
      args.visibilityIntent,
      args.decision.publicationStatus,
      args.decision.isPublic,
      review.rows[0].id,
      JSON.stringify(riskSummary),
    ],
  );

  if (args.decision.queueType) {
    await enqueueModerationQueue(args.client, {
      targetType: "record",
      targetId: args.recordId,
      targetRevisionNo: args.revisionNo,
      queueType: args.decision.queueType,
      reason: args.decision.reason,
      priority: args.decision.queuePriority ?? 5,
      payload: {
        assessmentReason: args.assessment.reason,
        riskLevel: args.decision.effectiveRiskLevel,
        riskLabels: args.assessment.riskLabels,
        visibilityIntent: args.visibilityIntent,
      },
      slaHours: args.decision.queueType === "risk_control" ? 4 : 24,
    });
  }

  if (!args.decision.triggerRiskControl) {
    return {
      riskControlEventId: null,
      riskControlEndsAt: null,
    };
  }

  const riskControl = await activateRiskControl(args.client, {
    userId: args.userId,
    recordId: args.recordId,
    reason: args.decision.reason,
    riskLevel: toRiskControlLevel(args.decision.effectiveRiskLevel),
    triggerSource: args.aiRiskLevel ? "auto_ai" : "auto_text",
    triggerIpHash: args.triggerIpHash,
    payload: {
      riskLabels: args.assessment.riskLabels,
      violationType: args.assessment.violationType,
      baselineHighRisk: args.assessment.baselineHighRisk,
      assessmentReason: args.assessment.reason,
    },
    durationHours: 24,
  });

  return {
    riskControlEventId: riskControl.eventId,
    riskControlEndsAt: riskControl.endsAt,
  };
}

export function parseRecordVisibilityIntent(isPublic: boolean | undefined): VisibilityIntent {
  return isPublic ? "public" : "private";
}

export function publicationLabel(status: string): string {
  return publicationStateLabel(status as Parameters<typeof publicationStateLabel>[0]);
}

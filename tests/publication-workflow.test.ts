import { describe, expect, it } from "vitest";
import type { ModerationAssessment } from "../src/lib/moderation.js";
import { decidePublication, isPubliclyVisibleStatus, publicationStateLabel } from "../src/lib/publication-workflow.js";
import { assessModeration, buildPublicSanitizedVariant } from "../src/lib/moderation.js";

function buildAssessment(partial: Partial<ModerationAssessment>): ModerationAssessment {
  return {
    decision: "pass",
    confidence: 0.9,
    riskScore: 0.05,
    riskLabels: [],
    reason: "mock",
    level: "very_low",
    baselineHighRisk: false,
    violationType: "other",
    ...partial,
  };
}

describe("decidePublication", () => {
  it("公开低风险文本可直发", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: false,
      textAssessment: buildAssessment({ level: "low" }),
    });

    expect(decision.publicationStatus).toBe("published");
    expect(decision.isPublic).toBe(true);
    expect(decision.queueType).toBeNull();
  });

  it("公开高风险文本进入二次审查", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: false,
      textAssessment: buildAssessment({ level: "high", decision: "escalate", riskScore: 0.82 }),
    });

    expect(decision.publicationStatus).toBe("pending_second_review");
    expect(decision.queueType).toBe("second_review");
    expect(decision.triggerRiskControl).toBe(false);
  });

  it("公开图片统一进入人工图片审核队列", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: true,
      textAssessment: buildAssessment({ level: "high", decision: "escalate", riskScore: 0.82 }),
    });

    expect(decision.publicationStatus).toBe("pending_manual");
    expect(decision.queueType).toBe("media_review");
    expect(decision.triggerRiskControl).toBe(false);
  });

  it("公开极高风险进入24h风控", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: false,
      textAssessment: buildAssessment({ level: "very_high", decision: "reject", riskScore: 0.96 }),
    });

    expect(decision.publicationStatus).toBe("risk_control_24h");
    expect(decision.queueType).toBe("risk_control");
    expect(decision.triggerRiskControl).toBe(true);
  });

  it("私密命中高危底线也进入24h风控", () => {
    const decision = decidePublication({
      visibilityIntent: "private",
      hasImages: false,
      textAssessment: buildAssessment({
        level: "high",
        decision: "escalate",
        baselineHighRisk: true,
        riskScore: 0.81,
      }),
    });

    expect(decision.publicationStatus).toBe("risk_control_24h");
    expect(decision.triggerRiskControl).toBe(true);
  });

  it("私密图片默认仅自己可见并进入人工图片审核队列", () => {
    const decision = decidePublication({
      visibilityIntent: "private",
      hasImages: true,
      textAssessment: buildAssessment({ level: "low" }),
    });

    expect(decision.publicationStatus).toBe("private");
    expect(decision.isPublic).toBe(false);
    expect(decision.queueType).toBe("media_review");
  });

  it("公开自定义情绪必须进入人工审核", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: false,
      textAssessment: buildAssessment({
        level: "low",
        customMood: { isCustom: true, flags: [] },
      }),
      hasCustomMood: true,
    });

    expect(decision.publicationStatus).toBe("pending_manual");
    expect(decision.queueType).toBe("moderation");
    expect(decision.isPublic).toBe(false);
  });

  it("公开命中脱敏阻断风险时进入风控", () => {
    const decision = decidePublication({
      visibilityIntent: "public",
      hasImages: false,
      textAssessment: buildAssessment({
        level: "elevated",
        publicSanitization: {
          applied: true,
          actions: ["mask_url"],
          labels: ["public_url_detected"],
          hasBlockingRisk: true,
        },
      }),
      hasPublicSanitizationRisk: true,
    });

    expect(decision.publicationStatus).toBe("risk_control_24h");
    expect(decision.triggerRiskControl).toBe(true);
  });
});

describe("visibility helpers", () => {
  it("只有 published 才是公开可见", () => {
    expect(isPubliclyVisibleStatus("published")).toBe(true);
    expect(isPubliclyVisibleStatus("pending_manual")).toBe(false);
    expect(isPubliclyVisibleStatus("risk_control_24h")).toBe(false);
  });

  it("状态标签映射正确", () => {
    expect(publicationStateLabel("risk_control_24h")).toBe("风控24h");
    expect(publicationStateLabel("pending_second_review")).toBe("二次审查");
  });
});

describe("moderation baseline high-risk", () => {
  it("高危隐私规则命中应触发 baselineHighRisk", () => {
    const assessment = assessModeration({
      moodPhrase: "我住在上海市浦东新区世纪大道88号",
      description: "",
      quote: "",
      extraEmotions: [],
      tags: [],
    });

    expect(assessment.level).toBe("high");
    expect(assessment.baselineHighRisk).toBe(true);
  });

  it("自定义情绪和规避式写法应进入严格审核", () => {
    const assessment = assessModeration({
      moodPhrase: "v x",
      description: "今天这样记录一下",
      quote: "",
      extraEmotions: [],
      tags: [],
    });

    expect(assessment.customMood?.isCustom).toBe(true);
    expect(assessment.decision).toBe("reject");
    expect(assessment.normalizedText?.flags.length).toBeGreaterThan(0);
  });
});

describe("buildPublicSanitizedVariant", () => {
  it("应隐藏 URL 并把时间模糊到月", () => {
    const result = buildPublicSanitizedVariant({
      moodPhrase: "想说说",
      description: "2026-03-27 18:30 见到了 https://example.com/offer",
      quote: "今晚8点见",
      occurredAt: "2026-03-27T18:30:00.000Z",
    });

    expect(result.publicDescription).toContain("[链接已隐藏]");
    expect(result.publicDescription).toContain("当月");
    expect(result.publicQuote).toContain("当月");
    expect(result.publicOccurredAt).toBe("2026-03-01T00:00:00.000Z");
  });
});

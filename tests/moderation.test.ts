import { describe, expect, it } from "vitest";
import { assessCustomMoodModeration, assessModeration } from "../src/lib/moderation.js";

describe("custom mood moderation", () => {
  it("自定义情绪默认进入更严格审核并标记 AI 审核需求", () => {
    const assessment = assessCustomMoodModeration({
      customMoodPhrase: "松弛",
    });

    expect(assessment.decision).toBe("escalate");
    expect(assessment.requiresManualReview).toBe(true);
    expect(assessment.aiReviewRequired).toBe(true);
    expect(assessment.isCustomMood).toBe(true);
  });

  it("自定义情绪命中禁用语义时应升级风险", () => {
    const assessment = assessCustomMoodModeration({
      customMoodPhrase: "卖号",
    });

    expect(assessment.level).toBe("high");
    expect(assessment.riskLabels.length).toBeGreaterThan(0);
  });
});

describe("public content moderation", () => {
  it("公开内容中的拼接广告语义会进入人工审核", () => {
    const assessment = assessModeration({
      moodPhrase: "t g 群 推广",
      description: "来这里看更多内容",
      quote: null,
      extraEmotions: [],
      tags: [],
      isPublic: true,
    });

    expect(assessment.level).toBe("high");
    expect(assessment.hasAdOrUrlRisk).toBe(true);
    expect(assessment.requiresManualReview).toBe(true);
  });

  it("高度重复文本命中中风险规则", () => {
    const assessment = assessModeration({
      moodPhrase: "哈哈哈哈哈哈哈哈哈哈",
      description: "重复重复重复重复重复重复重复重复重复重复",
      quote: null,
      extraEmotions: [],
      tags: [],
      isPublic: true,
    });

    expect(assessment.level).toBe("medium");
    expect(assessment.riskScore).toBe(0.5);
    expect(assessment.riskLabels).toContain("repetitive_content");
    expect(assessment.decision).toBe("escalate");
  });
});

import { describe, expect, it } from "vitest";
import {
  countCjkCharacters,
  countEnglishWords,
  validateQuoteLength,
} from "../src/lib/utils.js";
import {
  buildPublicSanitizedVariant,
  normalizeModerationText,
  validateCustomMoodPhrase,
} from "../src/lib/moderation.js";

describe("validateQuoteLength", () => {
  it("中文超过 20 字应失败", () => {
    const result = validateQuoteLength("这是一段超过二十个汉字的金句测试内容用于校验");
    expect(result.ok).toBe(false);
  });

  it("英文超过 30 词应失败", () => {
    const words = new Array(31).fill("hello").join(" ");
    const result = validateQuoteLength(words);
    expect(result.ok).toBe(false);
  });

  it("合法中文金句应通过", () => {
    const result = validateQuoteLength("愿今日有光");
    expect(result.ok).toBe(true);
  });
});

describe("countEnglishWords", () => {
  it("应正确统计英文词数", () => {
    expect(countEnglishWords("hello world from elysia")).toBe(4);
  });
});

describe("countCjkCharacters", () => {
  it("应只统计汉字字符", () => {
    expect(countCjkCharacters("爱莉希雅 hi 123")).toBe(4);
  });
});

describe("validateCustomMoodPhrase", () => {
  it("中文自定义情绪超过 5 字应失败", () => {
    const result = validateCustomMoodPhrase("今天有一点点难过");
    expect(result.ok).toBe(false);
  });

  it("英文自定义情绪超过 2 词应失败", () => {
    const result = validateCustomMoodPhrase("very sad today");
    expect(result.ok).toBe(false);
  });

  it("短中文自定义情绪应通过", () => {
    const result = validateCustomMoodPhrase("心乱乱");
    expect(result.ok).toBe(true);
    expect(result.isCustom).toBe(true);
  });
});

describe("normalizeModerationText", () => {
  it("应识别零宽字符与拆分规避", () => {
    const result = normalizeModerationText("微\u200b 信 v x");
    expect(result.flags).toContain("zero_width_removed");
    expect(result.flags).toContain("separator_collapsed");
  });
});

describe("buildPublicSanitizedVariant", () => {
  it("应隐藏 URL、模糊时间与地址", () => {
    const result = buildPublicSanitizedVariant({
      moodPhrase: "想说说",
      description: "2026年3月27日晚上8点在上海市浦东新区世纪大道88号见到了 https://example.com",
      quote: "今晚8点也会再去",
      occurredAt: "2026-03-27T18:30:00.000Z",
    });

    expect(result.publicDescription).toContain("[链接已隐藏]");
    expect(result.publicDescription).toContain("上海市");
    expect(result.publicQuote).toContain("当月");
    expect(result.publicOccurredAt).toBe("2026-03-01T00:00:00.000Z");
    expect(result.sanitizationApplied).toBe(true);
  });
});

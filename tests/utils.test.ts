import { describe, expect, it } from "vitest";
import { countEnglishWords, validateCustomMoodLength, validateQuoteLength } from "../src/lib/utils.js";

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

describe("validateCustomMoodLength", () => {
  it("中文自定义情绪超过 5 字应失败", () => {
    const result = validateCustomMoodLength("特别特别累呀");
    expect(result.ok).toBe(false);
  });

  it("英文自定义情绪超过 2 个词应失败", () => {
    const result = validateCustomMoodLength("very tired now");
    expect(result.ok).toBe(false);
  });

  it("合法自定义情绪应通过", () => {
    const result = validateCustomMoodLength("松弛");
    expect(result.ok).toBe(true);
  });
});

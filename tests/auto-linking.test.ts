import { describe, expect, it } from "vitest";
import { defaultAutoLinkingPreference, resolveAutoLinkingPreference } from "../src/lib/auto-linking.js";

describe("auto linking defaults", () => {
  it("默认关闭且为建议模式", () => {
    const pref = defaultAutoLinkingPreference();
    expect(pref.enabled).toBe(false);
    expect(pref.scope).toBe("private_only");
    expect(pref.mode).toBe("suggestion");
    expect(pref.consentedAt).toBeNull();
  });

  it("未读取到偏好时回退默认值", () => {
    const pref = resolveAutoLinkingPreference(null);
    expect(pref).toEqual(defaultAutoLinkingPreference());
  });

  it("读取到偏好时保持数据库值", () => {
    const pref = resolveAutoLinkingPreference({
      auto_linking_enabled: true,
      auto_linking_scope: "public_recommendation",
      auto_linking_mode: "suggestion",
      auto_linking_consented_at: "2026-03-18T10:00:00.000Z",
    });

    expect(pref).toEqual({
      enabled: true,
      scope: "public_recommendation",
      mode: "suggestion",
      consentedAt: "2026-03-18T10:00:00.000Z",
    });
  });
});

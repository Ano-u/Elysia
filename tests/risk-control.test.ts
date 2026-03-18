import { describe, expect, it } from "vitest";
import { canSubmitAppeal, isRiskControlActive } from "../src/lib/risk-control.js";

describe("canSubmitAppeal", () => {
  it("无历史申诉可提交", () => {
    const verdict = canSubmitAppeal(null);
    expect(verdict.ok).toBe(true);
    expect(verdict.code).toBeNull();
  });

  it("存在 pending 申诉时禁止重复提交", () => {
    const verdict = canSubmitAppeal("pending");
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("APPEAL_PENDING");
  });

  it("每个封禁事件仅允许一次申诉", () => {
    const verdict = canSubmitAppeal("rejected");
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("APPEAL_USED");
  });
});

describe("isRiskControlActive", () => {
  it("未来时间应视为风控中", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(isRiskControlActive(future)).toBe(true);
  });

  it("过去时间应视为风控已结束", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isRiskControlActive(past)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isPubliclyVisibleStatus } from "../src/lib/publication-workflow.js";

describe("public visibility boundary", () => {
  it("只有 published 状态可外部可见", () => {
    const statuses = [
      "private",
      "pending_auto",
      "pending_manual",
      "pending_second_review",
      "risk_control_24h",
      "rejected",
      "needs_changes",
    ];
    for (const status of statuses) {
      expect(isPubliclyVisibleStatus(status)).toBe(false);
    }
    expect(isPubliclyVisibleStatus("published")).toBe(true);
  });
});

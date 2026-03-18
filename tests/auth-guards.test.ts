import { describe, expect, it } from "vitest";
import { requireAccessApproved, requireNotInRiskControl } from "../src/lib/auth.js";

function createReply() {
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    code(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };

  return reply;
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    username: "tester",
    displayName: "Tester",
    avatarUrl: null,
    role: "user" as const,
    isBanned: false,
    banUntil: null,
    accessStatus: "approved" as const,
    riskControlUntil: null,
    riskControlReason: null,
    ...overrides,
  };
}

describe("requireAccessApproved", () => {
  it("未通过准入时返回 ACCESS_GATE_BLOCKED", async () => {
    const req = { user: createUser({ accessStatus: "pending" }) } as any;
    const reply = createReply() as any;

    const result = await requireAccessApproved(req, reply);

    expect(result).toBeNull();
    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toMatchObject({ code: "ACCESS_GATE_BLOCKED", accessStatus: "pending" });
  });

  it("管理员绕过准入门禁", async () => {
    const req = { user: createUser({ role: "admin", accessStatus: "pending" }) } as any;
    const reply = createReply() as any;

    const result = await requireAccessApproved(req, reply);

    expect(result).not.toBeNull();
    expect(reply.statusCode).toBe(200);
  });
});

describe("requireNotInRiskControl", () => {
  it("风控生效期内返回 RISK_CONTROL_ACTIVE", async () => {
    const req = {
      user: createUser({
        riskControlUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        riskControlReason: "unit-test",
      }),
    } as any;
    const reply = createReply() as any;

    const result = await requireNotInRiskControl(req, reply);

    expect(result).toBeNull();
    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toMatchObject({ code: "RISK_CONTROL_ACTIVE" });
  });

  it("管理员绕过风控限制", async () => {
    const req = {
      user: createUser({
        role: "admin",
        riskControlUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    } as any;
    const reply = createReply() as any;

    const result = await requireNotInRiskControl(req, reply);

    expect(result).not.toBeNull();
    expect(reply.statusCode).toBe(200);
  });
});

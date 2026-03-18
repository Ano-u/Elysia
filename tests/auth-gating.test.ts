import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAccessApproved, requireNotInRiskControl } from "../src/lib/auth.js";
import type { AuthUser } from "../src/lib/auth.js";

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

function makeReply(): FastifyReply & { statusCode?: number; payload?: unknown } {
  const reply = {
    code(status: number) {
      (this as { statusCode?: number }).statusCode = status;
      return this;
    },
    send(payload: unknown) {
      (this as { payload?: unknown }).payload = payload;
      return this;
    },
  } as FastifyReply & { statusCode?: number; payload?: unknown };
  return reply;
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    username: "tester",
    displayName: "Tester",
    avatarUrl: null,
    role: "user",
    isBanned: false,
    banUntil: null,
    accessStatus: "approved",
    riskControlUntil: null,
    riskControlReason: null,
    ...overrides,
  };
}

function makeReq(user: AuthUser | null): FastifyRequest {
  return { user } as FastifyRequest;
}

describe("access and risk-control permission gates", () => {
  it("blocks when access is not approved", async () => {
    const req = makeReq(makeUser({ accessStatus: "pending" }));
    const reply = makeReply();

    const allowed = await requireAccessApproved(req, reply);

    expect(allowed).toBeNull();
    expect(reply.statusCode).toBe(403);
    expect((reply.payload as { code?: string }).code).toBe("ACCESS_GATE_BLOCKED");
  });

  it("allows admin bypass on access gate", async () => {
    const req = makeReq(makeUser({ role: "admin", accessStatus: "pending" }));
    const reply = makeReply();

    const allowed = await requireAccessApproved(req, reply);

    expect(allowed?.role).toBe("admin");
    expect(reply.statusCode).toBeUndefined();
  });

  it("blocks when risk-control is active", async () => {
    const req = makeReq(
      makeUser({
        riskControlUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        riskControlReason: "命中极高风险",
      }),
    );
    const reply = makeReply();

    const allowed = await requireNotInRiskControl(req, reply);

    expect(allowed).toBeNull();
    expect(reply.statusCode).toBe(403);
    expect((reply.payload as { code?: string }).code).toBe("RISK_CONTROL_ACTIVE");
  });

  it("allows when risk-control expired", async () => {
    const req = makeReq(
      makeUser({
        riskControlUntil: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      }),
    );
    const reply = makeReply();

    const allowed = await requireNotInRiskControl(req, reply);

    expect(allowed?.id).toBe("user-1");
    expect(reply.statusCode).toBeUndefined();
  });
});

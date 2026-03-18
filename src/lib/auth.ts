import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "./db.js";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  isBanned: boolean;
  banUntil: string | null;
  accessStatus: "not_submitted" | "pending" | "approved" | "rejected";
  riskControlUntil: string | null;
  riskControlReason: string | null;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
  is_banned: boolean;
  ban_until: string | null;
  access_status: "not_submitted" | "pending" | "approved" | "rejected";
  risk_control_until: string | null;
  risk_control_reason: string | null;
};

export async function resolveAuthUser(req: FastifyRequest): Promise<AuthUser | null> {
  const raw = req.cookies.elysia_user_id;
  const unsigned = raw ? req.unsignCookie(raw) : null;
  const cookieUserId = unsigned?.valid ? unsigned.value : null;
  if (!cookieUserId) {
    return null;
  }
  const result = await query<UserRow>(
    `
      SELECT
        id,
        username,
        display_name,
        avatar_url,
        role,
        is_banned,
        ban_until,
        access_status,
        risk_control_until,
        risk_control_reason
      FROM users
      WHERE id = $1
    `,
    [cookieUserId],
  );
  if (result.rowCount !== 1) {
    return null;
  }
  const row = result.rows[0];
  const hasBanExpired = row.ban_until ? new Date(row.ban_until).getTime() <= Date.now() : false;
  const banned = row.is_banned && (row.ban_until === null || !hasBanExpired);

  if (row.is_banned && hasBanExpired) {
    await query(
      `
        UPDATE users
        SET is_banned = FALSE, ban_until = NULL, updated_at = NOW()
        WHERE id = $1
      `,
      [row.id],
    );
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isBanned: banned,
    banUntil: row.ban_until,
    accessStatus: row.access_status,
    riskControlUntil: row.risk_control_until,
    riskControlReason: row.risk_control_reason,
  };
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  if (!req.user) {
    reply.code(401).send({ message: "未登录" });
    return null;
  }
  if (req.user.isBanned) {
    reply.code(403).send({ message: "账号已被限制使用" });
    return null;
  }
  return req.user;
}

export async function requireUserAllowBanned(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  if (!req.user) {
    reply.code(401).send({ message: "未登录" });
    return null;
  }
  return req.user;
}

export async function requireAccessApproved(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = await requireUser(req, reply);
  if (!user) {
    return null;
  }
  if (user.role === "admin") {
    return user;
  }
  if (user.accessStatus !== "approved") {
    reply.code(403).send({
      message: "加入申请尚未通过，暂不可执行该操作",
      code: "ACCESS_GATE_BLOCKED",
      accessStatus: user.accessStatus,
    });
    return null;
  }
  return user;
}

export async function requireNotInRiskControl(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = await requireUser(req, reply);
  if (!user) {
    return null;
  }
  if (user.role === "admin") {
    return user;
  }
  if (user.riskControlUntil && new Date(user.riskControlUntil).getTime() > Date.now()) {
    reply.code(403).send({
      message: "当前处于风控冷却期，请稍后再试",
      code: "RISK_CONTROL_ACTIVE",
      riskControlUntil: user.riskControlUntil,
      reason: user.riskControlReason,
    });
    return null;
  }
  return user;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = await requireUser(req, reply);
  if (!user) {
    return null;
  }
  if (user.role !== "admin") {
    reply.code(403).send({ message: "仅管理员可访问" });
    return null;
  }
  return user;
}

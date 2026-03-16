import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "./db.js";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  isBanned: boolean;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
  is_banned: boolean;
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
      SELECT id, username, display_name, avatar_url, role, is_banned
      FROM users
      WHERE id = $1
    `,
    [cookieUserId],
  );
  if (result.rowCount !== 1) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isBanned: row.is_banned,
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

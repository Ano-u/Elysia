import type { FastifyInstance } from "fastify";
import type { TokenSet } from "openid-client";
import { z } from "zod";
import { query, withTransaction } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";
import { env } from "../config/env.js";
import {
  buildAuthorizationUrl,
  exchangeCode,
  generateNonce,
  generateState,
  isOidcReady,
  sanitizeUsername,
} from "../lib/oidc.js";

type UpsertUserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
  is_banned: boolean;
};

const switchSchema = z.object({
  userId: z.string().uuid().optional(),
  username: z.string().min(2).max(32),
  displayName: z.string().min(1).max(48),
  avatarUrl: z.string().url().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/dev/switch-user", async (req, reply) => {
    if (env.NODE_ENV === "production") {
      reply.code(404).send({ message: "Not Found" });
      return;
    }

    const body = switchSchema.parse(req.body);
    const result = await query<UpsertUserRow>(
      `
        INSERT INTO users (id, username, display_name, avatar_url, role)
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, COALESCE($5, 'user'))
        ON CONFLICT (username)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          avatar_url = EXCLUDED.avatar_url,
          role = COALESCE($5, users.role),
          updated_at = NOW()
        RETURNING id, username, display_name, avatar_url, role, is_banned
      `,
      [
        body.userId ?? null,
        body.username,
        body.displayName,
        body.avatarUrl ?? null,
        env.NODE_ENV === "development" ? body.role ?? null : null,
      ],
    );

    const user = result.rows[0];
    await query(
      `
        INSERT INTO user_preferences (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id],
    );

    reply.setCookie("elysia_user_id", user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role: user.role,
      },
    };
  });

  app.get("/auth/me", async (req) => {
    return { user: req.user };
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("elysia_user_id", { path: "/" });
    return { ok: true };
  });

  app.get("/auth/oidc/login", async (_req, reply) => {
    if (!isOidcReady()) {
      reply.code(501).send({ message: "OIDC 未配置完整，请先设置 OIDC 环境变量" });
      return;
    }

    const state = generateState();
    const nonce = generateNonce();
    const url = await buildAuthorizationUrl({ state, nonce });

    reply.setCookie("elysia_oidc_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 60 * 10,
    });
    reply.setCookie("elysia_oidc_nonce", nonce, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 60 * 10,
    });
    reply.redirect(url);
  });

  app.get("/auth/oidc/callback", async (req, reply) => {
    if (!isOidcReady()) {
      reply.code(501).send({ message: "OIDC 未配置完整，请先设置 OIDC 环境变量" });
      return;
    }

    const rawState = req.cookies.elysia_oidc_state;
    const rawNonce = req.cookies.elysia_oidc_nonce;
    const stateCookie = rawState ? req.unsignCookie(rawState) : { valid: false, value: "" };
    const nonceCookie = rawNonce ? req.unsignCookie(rawNonce) : { valid: false, value: "" };

    if (!stateCookie.valid || !nonceCookie.valid) {
      reply.code(400).send({ message: "OIDC 会话状态无效，请重新登录" });
      return;
    }

    const errorSchema = z.object({
      error: z.string().optional(),
      error_description: z.string().optional(),
    });
    const possibleError = errorSchema.parse(req.query);
    if (possibleError.error) {
      reply.code(400).send({
        message: "OIDC 登录失败",
        detail: possibleError.error_description ?? possibleError.error,
      });
      return;
    }

    const querySchema = z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    });
    const callbackQuery = querySchema.parse(req.query);
    if (callbackQuery.state !== stateCookie.value) {
      reply.code(400).send({ message: "OIDC state 校验失败" });
      return;
    }

    let tokenSet: TokenSet;
    try {
      tokenSet = await exchangeCode({
        callbackParams: callbackQuery,
        state: stateCookie.value,
        nonce: nonceCookie.value,
      });
    } catch (error) {
      req.log.error({ err: error }, "OIDC code 交换失败");
      reply.code(400).send({ message: "OIDC 授权码无效或已过期，请重新登录" });
      return;
    }
    const claims = tokenSet.claims() as Record<string, unknown>;

    const providerUserId = String(claims.sub ?? "");
    if (!providerUserId) {
      reply.code(400).send({ message: "OIDC 返回缺少 sub 标识" });
      return;
    }

    const preferred = String(claims.preferred_username ?? claims.nickname ?? claims.name ?? providerUserId);
    const displayName = String(claims.name ?? preferred).slice(0, 48);
    const avatarUrl = claims.picture ? String(claims.picture) : null;

    const baseUsername = sanitizeUsername(preferred);
    const fallbackUsername = `${baseUsername.slice(0, 16)}_${providerUserId.slice(0, 6)}`;

    const current = await withTransaction<UpsertUserRow>(async (client) => {
      const existingIdentity = await client.query<{ user_id: string }>(
        `
          SELECT user_id
          FROM identities
          WHERE provider = 'linuxdo'
            AND provider_user_id = $1
          LIMIT 1
        `,
        [providerUserId],
      );

      if (existingIdentity.rowCount === 1) {
        const updated = await client.query<UpsertUserRow>(
          `
            UPDATE users
            SET display_name = $1, avatar_url = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING id, username, display_name, avatar_url, role, is_banned
          `,
          [displayName, avatarUrl, existingIdentity.rows[0].user_id],
        );

        await client.query(
          `
            UPDATE identities
            SET raw_profile = $3::jsonb
            WHERE provider = 'linuxdo'
              AND provider_user_id = $1
              AND user_id = $2
          `,
          [providerUserId, existingIdentity.rows[0].user_id, JSON.stringify(claims)],
        );

        await client.query(
          `
            INSERT INTO user_preferences (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
          `,
          [existingIdentity.rows[0].user_id],
        );

        return updated.rows[0];
      }

      let finalUsername = baseUsername;
      const firstCollision = await client.query<{ username: string }>("SELECT username FROM users WHERE username = $1", [
        finalUsername,
      ]);
      if (firstCollision.rowCount && firstCollision.rowCount > 0) {
        finalUsername = fallbackUsername;
      }

      let attempt = 0;
      while (attempt < 20) {
        const c = await client.query<{ username: string }>("SELECT username FROM users WHERE username = $1", [
          finalUsername,
        ]);
        if (!c.rowCount || c.rowCount === 0) {
          break;
        }
        attempt += 1;
        finalUsername = `${baseUsername.slice(0, 16)}_${providerUserId.slice(0, 4)}${attempt}`;
      }
      if (attempt >= 20) {
        throw new Error("无法生成唯一用户名");
      }

      let newUser: UpsertUserRow | null = null;
      for (let i = 0; i < 10; i += 1) {
        try {
          const inserted = await client.query<UpsertUserRow>(
            `
              INSERT INTO users (username, display_name, avatar_url, role)
              VALUES ($1, $2, $3, 'user')
              RETURNING id, username, display_name, avatar_url, role, is_banned
            `,
            [finalUsername, displayName, avatarUrl],
          );
          newUser = inserted.rows[0];
          break;
        } catch (error) {
          const err = error as { code?: string };
          if (err.code !== "23505") {
            throw error;
          }
          finalUsername = `${baseUsername.slice(0, 12)}_${providerUserId.slice(0, 4)}${Date.now().toString().slice(-4)}${i}`;
        }
      }
      if (!newUser) {
        throw new Error("用户创建失败，请重试");
      }

      await client.query(
        `
          INSERT INTO identities (user_id, provider, provider_user_id, raw_profile)
          VALUES ($1, 'linuxdo', $2, $3::jsonb)
          ON CONFLICT (provider, provider_user_id)
          DO UPDATE SET raw_profile = EXCLUDED.raw_profile
        `,
        [newUser.id, providerUserId, JSON.stringify(claims)],
      );
      await client.query(
        `
          INSERT INTO user_preferences (user_id)
          VALUES ($1)
          ON CONFLICT (user_id) DO NOTHING
        `,
        [newUser.id],
      );
      return newUser;
    });

    reply.setCookie("elysia_user_id", current.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 60 * 60 * 24 * 30,
    });
    reply.clearCookie("elysia_oidc_state", { path: "/" });
    reply.clearCookie("elysia_oidc_nonce", { path: "/" });

    reply.redirect(env.OIDC_POST_LOGIN_REDIRECT ?? "/");
  });

  app.get("/auth/ensure", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    return { ok: true, user };
  });
}

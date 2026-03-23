import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySensible from "@fastify/sensible";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyWebsocket from "@fastify/websocket";
import { env } from "./config/env.js";
import { resolveAuthUser } from "./lib/auth.js";
import { query } from "./lib/db.js";
import { hashIp } from "./lib/utils.js";
import { registerRoutes } from "./routes/index.js";
import { redis } from "./lib/redis.js";
import { verifyTurnstileToken } from "./lib/turnstile.js";

function rateLimitKeyGenerator(req: FastifyRequest): string {
  const userId = req.user?.id ?? "anonymous";
  return `${userId}:${req.ip}`;
}

function isSensitivePath(method: string, url: string): boolean {
  if (method === "POST" && (url.startsWith("/api/records") || url.includes("/comments") || url.startsWith("/api/reactions"))) {
    return true;
  }
  return false;
}

function allowIpBanBypass(url: string): boolean {
  if (url.startsWith("/api/appeals")) {
    return true;
  }
  if (url.startsWith("/api/auth") || url.startsWith("/api/healthz") || url.startsWith("/api/public/config")) {
    return true;
  }
  if (url.startsWith("/docs")) {
    return true;
  }
  return false;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  const allowOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim());

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Not allowed"), false);
    },
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook: "onRequest",
    parseOptions: {
      path: "/",
      sameSite: "lax",
    },
  });

  await app.register(fastifySensible);
  await app.register(fastifyWebsocket);

  await app.register(fastifyRateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: rateLimitKeyGenerator,
    allowList: (req) => req.url === "/api/healthz",
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Elysia API",
        version: "0.1.0",
        description: "Elysia 后端接口文档",
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req) => {
    req.user = await resolveAuthUser(req);
  });

  app.addHook("preHandler", async (req, reply) => {
    if (allowIpBanBypass(req.url)) {
      return;
    }

    const ipHash = hashIp(req.ip);
    const rows = await query<{ is_permanent: boolean; banned_until: string | null; lifted_at: string | null }>(
      `
        SELECT is_permanent, banned_until, lifted_at
        FROM ip_bans
        WHERE ip_hash = $1
        LIMIT 1
      `,
      [ipHash],
    );

    if (rows.rowCount !== 1) {
      return;
    }

    const target = rows.rows[0];
    if (target.lifted_at) {
      return;
    }

    if (target.is_permanent) {
      reply.code(403).send({ message: "当前网络地址已被封禁" });
      return;
    }

    if (target.banned_until && new Date(target.banned_until).getTime() > Date.now()) {
      reply.code(403).send({ message: "当前网络地址处于封禁中" });
      return;
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    if (!isSensitivePath(req.method, req.url)) {
      return;
    }

    const ipKey = `challenge:ip:${hashIp(req.ip)}`;
    const userKey = req.user ? `challenge:user:${req.user.id}` : null;
    const [ipFlag, userFlag] = await Promise.all([
      redis.get(ipKey),
      userKey ? redis.get(userKey) : Promise.resolve(null),
    ]);

    if (!ipFlag && !userFlag) {
      return;
    }

    const headerToken = req.headers["x-turnstile-token"];
    const bodyMaybe = req.body as { turnstileToken?: unknown } | undefined;
    const bodyToken = typeof bodyMaybe?.turnstileToken === "string" ? bodyMaybe.turnstileToken : undefined;
    const token = typeof headerToken === "string" ? headerToken : bodyToken;

    if (!token) {
      reply.code(403).send({
        message: "需要完成人机验证",
        requireTurnstile: true,
      });
      return;
    }

    const verify = await verifyTurnstileToken({
      token,
      remoteIp: req.ip,
    });
    if (!verify.ok) {
      reply.code(403).send({
        message: "人机验证失败",
        requireTurnstile: true,
        errors: verify.errors ?? [],
      });
      return;
    }

    await Promise.all([
      redis.del(ipKey),
      userKey ? redis.del(userKey) : Promise.resolve(0),
    ]);
  });

  app.addHook("onResponse", (req, reply, done) => {
    void trackAccess(req, reply).catch((error) => {
      app.log.warn({ err: error }, "写入访问日志失败");
    });
    done();
  });

  await app.register(async (subApp) => {
    await registerRoutes(subApp);
  }, { prefix: "/api" });

  return app;
}

async function trackAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const latency = reply.elapsedTime ? Math.max(1, Math.round(reply.elapsedTime)) : 1;
  const ipHash = hashIp(req.ip);
  const endpoint = req.routeOptions.url ?? req.url;
  const statusCode = reply.statusCode;

  await redis.xadd(
    "analytics:events",
    "MAXLEN",
    "~",
    "200000",
    "*",
    "userId",
    req.user?.id ?? "",
    "ipHash",
    ipHash,
    "endpoint",
    endpoint,
    "method",
    req.method,
    "statusCode",
    String(statusCode),
    "latencyMs",
    String(latency),
    "userAgent",
    String(req.headers["user-agent"] ?? ""),
    "at",
    String(Date.now()),
  );

  const nowMinute = Math.floor(Date.now() / 60_000);
  const globalMinuteKey = `metrics:global:${nowMinute}`;
  const ipMinuteKey = `metrics:ip:${ipHash}:${nowMinute}`;
  const [globalCount] = await redis
    .multi()
    .incr(globalMinuteKey)
    .expire(globalMinuteKey, 60 * 10)
    .exec()
    .then((res: any) => [Number(res?.[0]?.[1] ?? 0)]);

  const [ipCount] = await redis
    .multi()
    .incr(ipMinuteKey)
    .expire(ipMinuteKey, 60 * 10)
    .exec()
    .then((res: any) => [Number(res?.[0]?.[1] ?? 0)]);

  if (req.user?.id) {
    const userMinuteKey = `metrics:user:${req.user.id}:${nowMinute}`;
    const [userCount] = await redis
      .multi()
      .incr(userMinuteKey)
      .expire(userMinuteKey, 60 * 10)
      .exec()
      .then((res: any) => [Number(res?.[0]?.[1] ?? 0)]);

    if (userCount === 241) {
      await redis.set(`challenge:user:${req.user.id}`, "1", "EX", 60 * 10);
      await query(
        `
          INSERT INTO alert_events (alert_type, level, metric_name, metric_value, threshold_value, payload)
          VALUES ('threshold', 'warn', 'user_requests_per_minute', $1, 240, $2::jsonb)
        `,
        [userCount, JSON.stringify({ userId: req.user.id, minute: nowMinute })],
      );
    }
  }

  if (ipCount === 301) {
    await redis.set(`challenge:ip:${ipHash}`, "1", "EX", 60 * 10);
    await query(
      `
        INSERT INTO alert_events (alert_type, level, metric_name, metric_value, threshold_value, payload)
        VALUES ('threshold', 'warn', 'ip_requests_per_minute', $1, 300, $2::jsonb)
      `,
      [ipCount, JSON.stringify({ ipHash, minute: nowMinute })],
    );
  }

  if (globalCount % 30 === 0 && globalCount > 100) {
    const prevKeys = [1, 2, 3, 4, 5].map((offset) => `metrics:global:${nowMinute - offset}`);
    const prevValues = await redis.mget(prevKeys);
    const nums = prevValues.map((v: any) => Number(v ?? 0));
    const prevAvg = nums.reduce((sum: number, val: number) => sum + val, 0) / nums.length;
    if (prevAvg > 0 && globalCount >= prevAvg * 3) {
      const dedupKey = `alerts:spike:${nowMinute}`;
      const locked = await redis.set(dedupKey, "1", "EX", 70, "NX");
      if (locked) {
        await query(
          `
            INSERT INTO alert_events (alert_type, level, metric_name, metric_value, threshold_value, payload)
            VALUES ('spike', 'warn', 'global_requests_per_minute', $1, $2, $3::jsonb)
          `,
          [globalCount, prevAvg * 3, JSON.stringify({ prevAvg, minute: nowMinute })],
        );
      }
    }
  }
}

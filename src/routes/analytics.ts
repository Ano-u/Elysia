import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { query } from "../lib/db.js";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/analytics/overview", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const [users, records, publicRecords, wsLike] = await Promise.all([
      query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users"),
      query<{ total: string }>("SELECT COUNT(*)::text AS total FROM records"),
      query<{ total: string }>("SELECT COUNT(*)::text AS total FROM records WHERE is_public = TRUE"),
      query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM access_events
          WHERE endpoint LIKE '%/ws'
            AND created_at > NOW() - INTERVAL '1 minute'
        `,
      ),
    ]);

    return {
      users: Number(users.rows[0]?.total ?? "0"),
      records: Number(records.rows[0]?.total ?? "0"),
      publicRecords: Number(publicRecords.rows[0]?.total ?? "0"),
      websocketMinuteRequests: Number(wsLike.rows[0]?.total ?? "0"),
    };
  });

  app.get("/admin/analytics/endpoints", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }

    const rows = await query<{ endpoint: string; requests: string; errors: string }>(
      `
        SELECT
          endpoint,
          SUM(requests)::text AS requests,
          SUM(errors)::text AS errors
        FROM endpoint_minute_stats
        WHERE minute_at > NOW() - INTERVAL '24 hour'
        GROUP BY endpoint
        ORDER BY SUM(requests) DESC
        LIMIT 200
      `,
    );
    return { items: rows.rows };
  });

  app.get("/admin/analytics/users-frequency", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }
    const rows = await query<{ user_id: string | null; requests: string }>(
      `
        SELECT user_id, SUM(request_count)::text AS requests
        FROM user_frequency_stats
        WHERE minute_at > NOW() - INTERVAL '1 hour'
        GROUP BY user_id
        ORDER BY SUM(request_count) DESC
        LIMIT 100
      `,
    );
    return { items: rows.rows };
  });

  app.get("/admin/analytics/alerts", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }
    const rows = await query<{
      id: string;
      alert_type: string;
      level: string;
      metric_name: string;
      metric_value: number;
      threshold_value: number | null;
      created_at: string;
    }>(
      `
        SELECT id::text, alert_type, level, metric_name, metric_value, threshold_value, created_at
        FROM alert_events
        ORDER BY created_at DESC
        LIMIT 200
      `,
    );
    return { items: rows.rows };
  });

  app.get("/admin/analytics/audit-logs", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) {
      return;
    }
    const rows = await query<{
      id: string;
      actor_user_id: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      payload: unknown;
      created_at: string;
    }>(
      `
        SELECT id::text, actor_user_id, action, target_type, target_id, payload, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 300
      `,
    );
    return { items: rows.rows };
  });
}

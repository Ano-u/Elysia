import type { FastifyInstance } from "fastify";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";

export async function insightRoutes(app: FastifyInstance): Promise<void> {
  app.get("/insights/emotion-trajectory", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const rows = await query<{ day: string; emotion: string; count: string }>(
      `
        SELECT
          DATE_TRUNC('day', r.created_at)::text AS day,
          e.emotion,
          COUNT(*)::text AS count
        FROM records r
        JOIN record_emotions e ON e.record_id = r.id
        WHERE r.user_id = $1
          AND r.created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', r.created_at), e.emotion
        ORDER BY DATE_TRUNC('day', r.created_at) ASC
      `,
      [user.id],
    );

    return { points: rows.rows };
  });

  app.get("/insights/theme-evolution", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const rows = await query<{ week: string; tag: string; count: string }>(
      `
        SELECT
          DATE_TRUNC('week', r.created_at)::text AS week,
          t.tag,
          COUNT(*)::text AS count
        FROM records r
        JOIN record_tags t ON t.record_id = r.id
        WHERE r.user_id = $1
          AND r.created_at > NOW() - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('week', r.created_at), t.tag
        ORDER BY DATE_TRUNC('week', r.created_at) ASC
      `,
      [user.id],
    );

    return { points: rows.rows };
  });

  app.get("/insights/resonance-network", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const rows = await query<{
      source_record_id: string;
      target_record_id: string;
      link_type: string;
      strength: string;
    }>(
      `
        SELECT source_record_id, target_record_id, link_type, strength::text
        FROM record_links
        WHERE source_record_id IN (SELECT id FROM records WHERE user_id = $1)
          AND link_type IN ('resonance', 'derived', 'semantic', 'keyword')
        ORDER BY created_at DESC
        LIMIT 400
      `,
      [user.id],
    );

    return { edges: rows.rows };
  });
}

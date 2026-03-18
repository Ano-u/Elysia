import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../lib/db.js";

type UniverseItem = {
  id: string;
  user_id: string;
  mood_phrase: string;
  created_at: string;
  is_public: boolean;
  quote: string | null;
  display_name: string;
  avatar_url: string | null;
  hearts: string;
  hugs: string;
};

function pickFocus(items: UniverseItem[]): { primary: UniverseItem | null; secondary: UniverseItem[] } {
  if (items.length === 0) {
    return { primary: null, secondary: [] };
  }
  const [primary, ...rest] = items;
  return {
    primary,
    secondary: rest.slice(0, 2),
  };
}

export async function universeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/universe/viewport", async (req) => {
    const q = z
      .object({
        x: z.coerce.number().default(0),
        y: z.coerce.number().default(0),
        w: z.coerce.number().default(1),
        h: z.coerce.number().default(1),
        limit: z.coerce.number().int().positive().max(60).default(30),
      })
      .parse(req.query);

    // 当前版本先按热度+新鲜度计算。后续可加入空间分桶算法。
    const rows = await query<UniverseItem & { vx: number; vy: number; personal_score: number }>(
      `
        WITH user_tags AS (
          SELECT rt.tag
          FROM record_tags rt
          JOIN records r ON r.id = rt.record_id
          WHERE r.user_id = $1
            AND r.created_at > NOW() - INTERVAL '60 days'
          GROUP BY rt.tag
          ORDER BY COUNT(*) DESC
          LIMIT 20
        ),
        ranked AS (
          SELECT
            r.id,
            r.user_id,
            r.mood_phrase,
            r.created_at,
            r.is_public,
            rq.quote,
            u.display_name,
            u.avatar_url,
            COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0)::text AS hearts,
            COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0)::text AS hugs,
            ((ABS(hashtext(r.id::text)) % 200000)::double precision / 1000.0) - 100.0 AS vx,
            ((ABS(hashtext(REVERSE(r.id::text))) % 200000)::double precision / 1000.0) - 100.0 AS vy,
            CASE
              WHEN $1::uuid IS NULL THEN 0
              WHEN EXISTS (
                SELECT 1
                FROM record_tags t
                JOIN user_tags ut ON ut.tag = t.tag
                WHERE t.record_id = r.id
              ) THEN 1
              ELSE 0
            END AS personal_score
          FROM records r
          JOIN users u ON u.id = r.user_id
          LEFT JOIN record_quotes rq ON rq.record_id = r.id
          LEFT JOIN reactions re ON re.record_id = r.id
          WHERE r.is_public = TRUE
            AND r.publication_status = 'published'
          GROUP BY r.id, rq.quote, u.display_name, u.avatar_url
        )
        SELECT *
        FROM ranked
        WHERE vx BETWEEN $2 AND $3
          AND vy BETWEEN $4 AND $5
        ORDER BY
          (
            (
              ((hearts::double precision * 1.2) + (hugs::double precision * 1.0))
            ) * 0.6
            + (personal_score * 10.0) * 0.4
          ) DESC,
          created_at DESC
        LIMIT $6
      `,
      [req.user?.id ?? null, q.x, q.x + q.w, q.y, q.y + q.h, q.limit],
    );

    return {
      viewport: { x: q.x, y: q.y, w: q.w, h: q.h },
      items: rows.rows.map(({ vx, vy, personal_score, ...rest }) => ({
        ...rest,
        personalScore: personal_score,
        coord: { x: vx, y: vy },
      })),
      focus: pickFocus(rows.rows),
      renderHint: {
        blurFirst: true,
        focusRefreshSeconds: 20,
      },
    };
  });

  app.get("/universe/focus", async () => {
    const rows = await query<UniverseItem>(
      `
        SELECT
          r.id,
          r.user_id,
          r.mood_phrase,
          r.created_at,
          r.is_public,
          rq.quote,
          u.display_name,
          u.avatar_url,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0)::text AS hearts,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0)::text AS hugs
        FROM records r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        LEFT JOIN reactions re ON re.record_id = r.id
        WHERE r.is_public = TRUE
          AND r.publication_status = 'published'
          AND r.created_at > NOW() - INTERVAL '7 days'
        GROUP BY r.id, rq.quote, u.display_name, u.avatar_url
        ORDER BY
          (COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0) * 1.2 +
           COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0) * 1.0) DESC,
          r.created_at DESC
        LIMIT 12
      `,
    );

    return pickFocus(rows.rows);
  });

  app.get("/universe/hot", async () => {
    const rows = await query<UniverseItem>(
      `
        SELECT
          r.id,
          r.user_id,
          r.mood_phrase,
          r.created_at,
          r.is_public,
          rq.quote,
          u.display_name,
          u.avatar_url,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0)::text AS hearts,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0)::text AS hugs
        FROM records r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        LEFT JOIN reactions re ON re.record_id = r.id
        WHERE r.is_public = TRUE
          AND r.publication_status = 'published'
          AND r.created_at > NOW() - INTERVAL '7 days'
        GROUP BY r.id, rq.quote, u.display_name, u.avatar_url
        ORDER BY
          (COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0) * 1.2 +
           COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0) * 1.0) DESC,
          r.created_at DESC
        LIMIT 30
      `,
    );

    return { items: rows.rows };
  });

  app.get("/universe/recent", async () => {
    const rows = await query<UniverseItem>(
      `
        SELECT
          r.id,
          r.user_id,
          r.mood_phrase,
          r.created_at,
          r.is_public,
          rq.quote,
          u.display_name,
          u.avatar_url,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0)::text AS hearts,
          COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0)::text AS hugs
        FROM records r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN record_quotes rq ON rq.record_id = r.id
        LEFT JOIN reactions re ON re.record_id = r.id
        WHERE r.is_public = TRUE
          AND r.publication_status = 'published'
        GROUP BY r.id, rq.quote, u.display_name, u.avatar_url
        ORDER BY r.created_at DESC
        LIMIT 30
      `,
    );

    return { items: rows.rows };
  });
}

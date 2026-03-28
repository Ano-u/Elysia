import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../lib/db.js";

type UniverseItem = {
  id: string;
  user_id: string;
  mood_phrase: string;
  display_mood_phrase: string | null;
  description: string | null;
  public_description: string | null;
  created_at: string;
  is_public: boolean;
  quote: string | null;
  public_quote: string | null;
  display_name: string;
  avatar_url: string | null;
  hearts: string;
  hugs: string;
  stars: string;
  butterflies: string;
  flowers: string;
  tags: string[];
  extra_emotions: string[];
  is_reply: boolean;
  parent_record_id: string | null;
  root_record_id: string | null;
  show_parent_arrow: boolean;
  show_root_arrow: boolean;
  public_location_label: string | null;
  public_occurred_at: string | null;
};


type ViewportUniverseItem = UniverseItem & {
  vx: number;
  vy: number;
  personal_score: number;
};

const universeSelectFields = `
  r.id,
  r.user_id,
  r.mood_phrase,
  r.display_mood_phrase,
  r.description,
  r.public_description,
  r.created_at,
  r.is_public,
  rq.quote,
  r.public_quote,
  r.public_location_label,
  r.public_occurred_at,
  COALESCE((
    SELECT ARRAY_AGG(rem.emotion ORDER BY rem.created_at ASC)
    FROM record_emotions rem
    WHERE rem.record_id = r.id
  ), ARRAY[]::text[]) AS extra_emotions,
  COALESCE((
    SELECT ARRAY_AGG(rt.tag ORDER BY rt.created_at ASC)
    FROM record_tags rt
    WHERE rt.record_id = r.id
  ), ARRAY[]::text[]) AS tags,
  u.display_name,
  u.avatar_url,
  COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0)::text AS hearts,
  COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0)::text AS hugs,
  COALESCE(SUM(CASE WHEN re.reaction_type = 'star' THEN 1 ELSE 0 END), 0)::text AS stars,
  COALESCE(SUM(CASE WHEN re.reaction_type = 'butterfly' THEN 1 ELSE 0 END), 0)::text AS butterflies,
  COALESCE(SUM(CASE WHEN re.reaction_type = 'flower' THEN 1 ELSE 0 END), 0)::text AS flowers,
  (c.derived_record_id IS NOT NULL) AS is_reply,
  c.parent_record_id,
  c.root_record_id,
  (c.derived_record_id IS NOT NULL) AS show_parent_arrow,
  (c.derived_record_id IS NOT NULL AND c.root_record_id IS DISTINCT FROM c.parent_record_id) AS show_root_arrow
`;

const universeSelectFrom = `
  FROM records r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN record_quotes rq ON rq.record_id = r.id
  LEFT JOIN reactions re ON re.record_id = r.id
  LEFT JOIN comments c ON c.derived_record_id = r.id
  WHERE r.is_public = TRUE
    AND r.publication_status = 'published'
`;

const universeGroupBy = `
  GROUP BY
    r.id,
    r.description,
    r.public_description,
    r.display_mood_phrase,
    r.public_quote,
    r.public_location_label,
    r.public_occurred_at,
    rq.quote,
    u.display_name,
    u.avatar_url,
    c.derived_record_id,
    c.parent_record_id,
    c.root_record_id
`;

function pickFocus<T>(items: T[]): { primary: T | null; secondary: T[] } {
  if (items.length === 0) {
    return { primary: null, secondary: [] };
  }
  const [primary, ...rest] = items;
  return {
    primary,
    secondary: rest.slice(0, 2),
  };
}

function mapUniverseItem(row: UniverseItem, coord?: { x: number; y: number }, personalScore?: number) {
  return {
    id: row.id,
    user_id: row.user_id,
    mood_phrase: row.display_mood_phrase ?? row.mood_phrase,
    description: row.public_description ?? row.description,
    created_at: row.created_at,
    is_public: row.is_public,
    quote: row.public_quote ?? row.quote,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    hearts: row.hearts,
    hugs: row.hugs,
    stars: row.stars,
    butterflies: row.butterflies,
    flowers: row.flowers,
    tags: row.tags,
    extra_emotions: row.extra_emotions,
    sanitized: !!(row.display_mood_phrase || row.public_description || row.public_quote || row.public_location_label),
    public_location_label: row.public_location_label,
    public_occurred_at: row.public_occurred_at,
    replyContext: row.is_reply
      ? {
          isReply: true,
          parentRecordId: row.parent_record_id,
          rootRecordId: row.root_record_id,
          showParentArrow: row.show_parent_arrow,
          showRootArrow: row.show_root_arrow,
        }
      : null,
    ...(coord ? { coord } : {}),
    ...(typeof personalScore === "number" ? { personalScore } : {}),
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

    const rows = await query<ViewportUniverseItem>(
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
            ${universeSelectFields},
            CASE
              WHEN c.derived_record_id IS NULL THEN ((ABS(hashtext(r.id::text || ':x')) % 180000)::double precision / 100.0) - 900.0
              ELSE (
                (((ABS(hashtext(c.parent_record_id::text || ':x')) % 180000)::double precision / 100.0) - 900.0) * 0.82
                + (((ABS(hashtext(COALESCE(c.root_record_id, c.parent_record_id)::text || ':x')) % 180000)::double precision / 100.0) - 900.0) * 0.18
                + (((ABS(hashtext(r.id::text || ':reply:x')) % 2400)::double precision / 100.0) - 12.0)
              )
            END AS vx,
            CASE
              WHEN c.derived_record_id IS NULL THEN ((ABS(hashtext(r.id::text || ':y')) % 180000)::double precision / 100.0) - 900.0
              ELSE (
                (((ABS(hashtext(c.parent_record_id::text || ':y')) % 180000)::double precision / 100.0) - 900.0) * 0.82
                + (((ABS(hashtext(COALESCE(c.root_record_id, c.parent_record_id)::text || ':y')) % 180000)::double precision / 100.0) - 900.0) * 0.18
                + (((ABS(hashtext(r.id::text || ':reply:y')) % 2400)::double precision / 100.0) - 12.0)
              )
            END AS vy,
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
            ${universeSelectFrom}
            ${universeGroupBy}
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

    const items = rows.rows.map(({ vx, vy, personal_score, ...rest }) =>
      mapUniverseItem(rest, { x: vx, y: vy }, personal_score),
    );

    return {
      viewport: { x: q.x, y: q.y, w: q.w, h: q.h },
      items,
      focus: pickFocus(items),
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
          ${universeSelectFields}
          ${universeSelectFrom}
          AND r.created_at > NOW() - INTERVAL '7 days'
          ${universeGroupBy}
        ORDER BY
          (COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0) * 1.2 +
           COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0) * 1.0) DESC,
          r.created_at DESC
        LIMIT 12
      `,
    );

    return pickFocus(rows.rows.map((row) => mapUniverseItem(row)));
  });

  app.get("/universe/hot", async () => {
    const rows = await query<UniverseItem>(
      `
        SELECT
          ${universeSelectFields}
          ${universeSelectFrom}
          AND r.created_at > NOW() - INTERVAL '7 days'
          ${universeGroupBy}
        ORDER BY
          (COALESCE(SUM(CASE WHEN re.reaction_type = 'heart' THEN 1 ELSE 0 END), 0) * 1.2 +
           COALESCE(SUM(CASE WHEN re.reaction_type = 'hug' THEN 1 ELSE 0 END), 0) * 1.0) DESC,
          r.created_at DESC
        LIMIT 30
      `,
    );

    return { items: rows.rows.map((row) => mapUniverseItem(row)) };
  });

  app.get("/universe/recent", async () => {
    const rows = await query<UniverseItem>(
      `
        SELECT
          ${universeSelectFields}
          ${universeSelectFrom}
          ${universeGroupBy}
        ORDER BY r.created_at DESC
        LIMIT 30
      `,
    );

    return { items: rows.rows.map((row) => mapUniverseItem(row)) };
  });
}

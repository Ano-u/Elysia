import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/locations", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        provider: z.enum(["google", "amap", "manual"]),
        providerPoiId: z.string().optional(),
        name: z.string().min(1).max(120),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        country: z.string().max(60).optional(),
        region: z.string().max(60).optional(),
        city: z.string().max(60).optional(),
        district: z.string().max(60).optional(),
        privacyLevel: z.enum(["country", "region", "city", "district"]).default("city"),
      })
      .parse(req.body);

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO locations (
          provider,
          provider_poi_id,
          name,
          latitude,
          longitude,
          country,
          region,
          city,
          district,
          privacy_level
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      [
        body.provider,
        body.providerPoiId ?? null,
        body.name,
        body.latitude ?? null,
        body.longitude ?? null,
        body.country ?? null,
        body.region ?? null,
        body.city ?? null,
        body.district ?? null,
        body.privacyLevel,
      ],
    );

    return { locationId: inserted.rows[0].id };
  });

  app.get("/locations/search", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const q = z
      .object({
        keyword: z.string().min(1).max(80),
        limit: z.coerce.number().int().min(1).max(30).default(10),
      })
      .parse(req.query);

    const rows = await query<{
      id: string;
      name: string;
      country: string | null;
      region: string | null;
      city: string | null;
      district: string | null;
      privacy_level: "country" | "region" | "city" | "district";
    }>(
      `
        SELECT id, name, country, region, city, district, privacy_level
        FROM locations
        WHERE name ILIKE $1
           OR city ILIKE $1
           OR region ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [`%${q.keyword}%`, q.limit],
    );

    return { items: rows.rows };
  });
}

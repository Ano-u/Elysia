import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import {
  resolveAutoLinkingPreference,
  type AutoLinkingMode,
  type AutoLinkingScope,
} from "../lib/auto-linking.js";

const autoLinkingScopeSchema = z.enum(["private_only", "public_recommendation"]);
const autoLinkingModeSchema = z.enum(["suggestion"]);

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me/entry-preference", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const pref = await query<{ preferred_entry: "auto" | "home" | "mindmap" }>(
      `
        SELECT preferred_entry
        FROM user_preferences
        WHERE user_id = $1
      `,
      [user.id],
    );

    return {
      preferredEntry: pref.rows[0]?.preferred_entry ?? "auto",
    };
  });

  app.get("/me/entry-target", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const pref = await query<{ preferred_entry: "auto" | "home" | "mindmap" }>(
      `
        SELECT preferred_entry
        FROM user_preferences
        WHERE user_id = $1
      `,
      [user.id],
    );
    const preferred = pref.rows[0]?.preferred_entry ?? "auto";

    if (preferred === "home" || preferred === "mindmap") {
      return { entryTarget: preferred, reason: "manual_preference" };
    }

    const recent = await query<{ has_recent: boolean }>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM records
          WHERE user_id = $1
            AND created_at >= NOW() - INTERVAL '30 minute'
        ) AS has_recent
      `,
      [user.id],
    );

    if (recent.rows[0]?.has_recent) {
      return { entryTarget: "mindmap", reason: "recent_record_within_30m" };
    }
    return { entryTarget: "home", reason: "default_auto" };
  });

  app.patch("/me/entry-preference", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z.object({ preferredEntry: z.enum(["auto", "home", "mindmap"]) }).parse(req.body);

    await query(
      `
        INSERT INTO user_preferences (user_id, preferred_entry)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET preferred_entry = EXCLUDED.preferred_entry, updated_at = NOW()
      `,
      [user.id, body.preferredEntry],
    );
    return { ok: true };
  });

  app.get("/me/auto-linking", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const pref = await query<{
      auto_linking_enabled: boolean;
      auto_linking_scope: AutoLinkingScope;
      auto_linking_mode: AutoLinkingMode;
      auto_linking_consented_at: string | null;
    }>(
      `
        SELECT
          auto_linking_enabled,
          auto_linking_scope,
          auto_linking_mode,
          auto_linking_consented_at
        FROM user_preferences
        WHERE user_id = $1
      `,
      [user.id],
    );

    return resolveAutoLinkingPreference(pref.rows[0]);
  });

  app.patch("/me/auto-linking", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const body = z
      .object({
        enabled: z.boolean(),
        scope: autoLinkingScopeSchema.optional(),
        mode: autoLinkingModeSchema.default("suggestion"),
      })
      .parse(req.body);

    const targetScope = body.scope ?? null;
    const updated = await query<{
      auto_linking_enabled: boolean;
      auto_linking_scope: AutoLinkingScope;
      auto_linking_mode: AutoLinkingMode;
      auto_linking_consented_at: string | null;
    }>(
      `
        INSERT INTO user_preferences (
          user_id,
          auto_linking_enabled,
          auto_linking_scope,
          auto_linking_mode,
          auto_linking_consented_at
        )
        VALUES (
          $1,
          $2,
          COALESCE($3::text, 'private_only'),
          $4,
          CASE WHEN $2 THEN NOW() ELSE NULL END
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          auto_linking_enabled = EXCLUDED.auto_linking_enabled,
          auto_linking_scope = COALESCE($3::text, user_preferences.auto_linking_scope),
          auto_linking_mode = EXCLUDED.auto_linking_mode,
          auto_linking_consented_at = CASE
            WHEN EXCLUDED.auto_linking_enabled THEN COALESCE(user_preferences.auto_linking_consented_at, NOW())
            ELSE user_preferences.auto_linking_consented_at
          END,
          updated_at = NOW()
        RETURNING
          auto_linking_enabled,
          auto_linking_scope,
          auto_linking_mode,
          auto_linking_consented_at
      `,
      [user.id, body.enabled, targetScope, body.mode],
    );

    const pref = resolveAutoLinkingPreference(updated.rows[0]);
    return {
      ok: true,
      autoLinking: pref,
      hint: "默认建议模式，不会自动改写正文",
    };
  });

  app.get("/drafts", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const rows = await query<{ id: string; payload: unknown; updated_at: string }>(
      `
        SELECT id, payload, updated_at
        FROM drafts
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [user.id],
    );
    return { items: rows.rows };
  });

  app.post("/drafts", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z.object({ payload: z.record(z.string(), z.unknown()) }).parse(req.body);

    const latest = await query<{ id: string }>(
      `
        SELECT id
        FROM drafts
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [user.id],
    );

    if (latest.rowCount === 5) {
      const last = latest.rows[4];
      await query("DELETE FROM drafts WHERE id = $1", [last.id]);
    }

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO drafts (user_id, payload)
        VALUES ($1, $2::jsonb)
        RETURNING id
      `,
      [user.id, JSON.stringify(body.payload)],
    );

    return { draftId: inserted.rows[0].id };
  });

  app.patch("/drafts/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ payload: z.record(z.string(), z.unknown()) }).parse(req.body);

    const updated = await query<{ id: string }>(
      `
        UPDATE drafts
        SET payload = $1::jsonb, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING id
      `,
      [JSON.stringify(body.payload), params.id, user.id],
    );
    if (updated.rowCount !== 1) {
      reply.code(404).send({ message: "草稿不存在" });
      return;
    }
    return { ok: true };
  });

  app.delete("/drafts/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    await query("DELETE FROM drafts WHERE id = $1 AND user_id = $2", [params.id, user.id]);
    return { ok: true };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { writeAuditLog } from "../lib/audit.js";

type NodeRow = {
  id: string;
  user_id: string;
  record_id: string | null;
  node_type: "record" | "quote" | "emotion" | "theme" | "event";
  label: string;
  payload: unknown;
  created_at: string;
};

type EdgeRow = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: "keyword" | "semantic" | "time" | "manual" | "resonance";
  weight: string;
  created_at: string;
};

export async function mindmapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mindmap/me", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }

    const mode = z
      .object({
        mode: z.enum(["simple", "deep"]).default("simple"),
      })
      .parse(req.query);

    const nodeLimit = mode.mode === "simple" ? 120 : 400;
    const edgeLimit = mode.mode === "simple" ? 180 : 600;

    const nodes = await query<NodeRow>(
      `
        SELECT id, user_id, record_id, node_type, label, payload, created_at
        FROM mindmap_nodes
        WHERE user_id = $1
           OR (
             user_id <> $1
             AND node_type = 'record'
             AND record_id IN (
               SELECT id FROM records WHERE is_public = TRUE
             )
           )
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [user.id, nodeLimit],
    );

    const nodeIds = nodes.rows.map((n) => n.id);
    const edges =
      nodeIds.length > 0
        ? await query<EdgeRow>(
            `
              SELECT e.*
              FROM mindmap_edges e
              WHERE e.source_node_id = ANY($1::uuid[])
                AND e.target_node_id = ANY($1::uuid[])
              ORDER BY e.weight DESC, e.created_at DESC
              LIMIT $2
            `,
            [nodeIds, edgeLimit],
          )
        : { rows: [] as EdgeRow[] };

    return {
      mode: mode.mode,
      nodes: nodes.rows,
      edges: edges.rows,
      hints: {
        layout: "force-time-ring",
        defaultHops: 2,
      },
    };
  });

  app.get("/mindmap/:recordId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const params = z.object({ recordId: z.string().uuid() }).parse(req.params);

    const record = await query<{ id: string; user_id: string; is_public: boolean }>(
      `
        SELECT id, user_id, is_public
        FROM records
        WHERE id = $1
      `,
      [params.recordId],
    );
    if (record.rowCount !== 1) {
      reply.code(404).send({ message: "记录不存在" });
      return;
    }
    const r = record.rows[0];
    if (!r.is_public && r.user_id !== user.id) {
      reply.code(403).send({ message: "无权查看该图谱节点" });
      return;
    }

    const nodes = await query<NodeRow>(
      `
        SELECT *
        FROM mindmap_nodes
        WHERE record_id = $1
           OR id IN (
             SELECT source_node_id FROM mindmap_edges
             WHERE target_node_id IN (SELECT id FROM mindmap_nodes WHERE record_id = $1)
             UNION
             SELECT target_node_id FROM mindmap_edges
             WHERE source_node_id IN (SELECT id FROM mindmap_nodes WHERE record_id = $1)
           )
        LIMIT 300
      `,
      [params.recordId],
    );

    const nodeIds = nodes.rows.map((n) => n.id);
    const edges = nodeIds.length
      ? await query<EdgeRow>(
          `
            SELECT *
            FROM mindmap_edges
            WHERE source_node_id = ANY($1::uuid[])
              AND target_node_id = ANY($1::uuid[])
            LIMIT 500
          `,
          [nodeIds],
        )
      : { rows: [] as EdgeRow[] };

    return { nodes: nodes.rows, edges: edges.rows };
  });

  app.post("/mindmap/manual-link", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) {
      return;
    }
    const body = z
      .object({
        sourceRecordId: z.string().uuid(),
        targetRecordId: z.string().uuid(),
        strength: z.coerce.number().min(0).max(1).default(0.6),
      })
      .parse(req.body);

    if (body.sourceRecordId === body.targetRecordId) {
      reply.code(400).send({ message: "不能将记录与自身链接" });
      return;
    }

    await query(
      `
        INSERT INTO record_links (source_record_id, target_record_id, link_type, strength, created_by)
        VALUES ($1, $2, 'manual', $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [body.sourceRecordId, body.targetRecordId, body.strength, user.id],
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: "mindmap.manual_link",
      targetType: "record_link",
      payload: {
        sourceRecordId: body.sourceRecordId,
        targetRecordId: body.targetRecordId,
        strength: body.strength,
      },
    });

    return { ok: true };
  });
}

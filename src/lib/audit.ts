import { query } from "./db.js";

export async function writeAuditLog(params: {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      params.actorUserId ?? null,
      params.action,
      params.targetType,
      params.targetId ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );
}

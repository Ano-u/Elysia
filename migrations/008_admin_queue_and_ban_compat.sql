DO $$
BEGIN
  ALTER TABLE moderation_queue DROP CONSTRAINT IF EXISTS moderation_queue_target_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE moderation_queue
  ADD CONSTRAINT moderation_queue_target_type_check
  CHECK (target_type IN ('record', 'media', 'user', 'access_application', 'appeal', 'ban_event'));

DO $$
BEGIN
  ALTER TABLE ban_events DROP CONSTRAINT IF EXISTS ban_events_violation_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE ban_events
  ADD CONSTRAINT ban_events_violation_type_check
  CHECK (violation_type IN ('political', 'gore_violence', 'extremism', 'privacy', 'other'));

CREATE INDEX IF NOT EXISTS idx_moderation_queue_target_type_status
  ON moderation_queue (target_type, queue_status, created_at DESC);

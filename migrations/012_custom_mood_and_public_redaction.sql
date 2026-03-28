ALTER TABLE records
  ADD COLUMN IF NOT EXISTS mood_mode TEXT NOT NULL DEFAULT 'preset',
  ADD COLUMN IF NOT EXISTS custom_mood_phrase TEXT;

DO $$
BEGIN
  ALTER TABLE records DROP CONSTRAINT IF EXISTS records_mood_mode_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE records
  ADD CONSTRAINT records_mood_mode_check
  CHECK (mood_mode IN ('preset', 'other_random', 'custom'));

ALTER TABLE moderation_queue
  DROP CONSTRAINT IF EXISTS moderation_queue_queue_type_check;

ALTER TABLE moderation_queue
  ADD CONSTRAINT moderation_queue_queue_type_check
  CHECK (queue_type IN ('moderation', 'second_review', 'risk_control', 'access_application', 'appeal', 'media_review', 'custom_mood_review'));

CREATE INDEX IF NOT EXISTS idx_records_mood_mode_created_at
  ON records (mood_mode, created_at DESC);

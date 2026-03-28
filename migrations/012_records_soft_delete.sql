ALTER TABLE records
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_records_user_created_not_deleted
  ON records (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_records_public_visible_not_deleted
  ON records (created_at DESC)
  WHERE deleted_at IS NULL AND is_public = TRUE AND publication_status = 'published';

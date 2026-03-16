CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('json', 'pdf')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  download_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences'
      AND column_name = 'preferred_entry'
  ) THEN
    ALTER TABLE user_preferences
      ADD COLUMN preferred_entry TEXT NOT NULL DEFAULT 'home' CHECK (preferred_entry IN ('home', 'mindmap'));
  END IF;
END $$;

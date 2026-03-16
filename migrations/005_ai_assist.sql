CREATE TABLE IF NOT EXISTS ai_assist_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assist_type TEXT NOT NULL CHECK (assist_type IN ('tag_suggestion', 'weekly_report')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_assist_user_type_created_at
  ON ai_assist_records (user_id, assist_type, created_at DESC);

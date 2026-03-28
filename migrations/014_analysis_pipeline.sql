CREATE TABLE IF NOT EXISTS record_embeddings (
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  model_name TEXT NOT NULL,
  vector_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_id, scope)
);

CREATE TABLE IF NOT EXISTS record_analysis (
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  topic_id TEXT,
  topic_label TEXT,
  mood_labels TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  sentiment_polarity TEXT NOT NULL DEFAULT 'neutral'
    CHECK (sentiment_polarity IN ('positive', 'neutral', 'negative')),
  coord_x DOUBLE PRECISION,
  coord_y DOUBLE PRECISION,
  analysis_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_id, scope)
);

CREATE TABLE IF NOT EXISTS analysis_control (
  scope TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('public', 'personal')),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cluster_version INT NOT NULL DEFAULT 1,
  last_backfill_at TIMESTAMPTZ,
  last_recluster_at TIMESTAMPTZ,
  last_cursor TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE record_links
  ADD COLUMN IF NOT EXISTS scope TEXT;

UPDATE record_links
SET scope = 'shared'
WHERE scope IS NULL;

ALTER TABLE record_links
  ALTER COLUMN scope SET DEFAULT 'shared';

ALTER TABLE record_links
  ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE record_links DROP CONSTRAINT IF EXISTS record_links_source_record_id_target_record_id_link_type_key;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_links_unique_scope
  ON record_links (source_record_id, target_record_id, link_type, scope);

CREATE INDEX IF NOT EXISTS idx_record_embeddings_scope_updated
  ON record_embeddings (scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_record_analysis_scope_topic
  ON record_analysis (scope, topic_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_record_analysis_scope_coord
  ON record_analysis (scope, coord_x, coord_y);

CREATE INDEX IF NOT EXISTS idx_analysis_control_kind_updated
  ON analysis_control (scope_kind, updated_at DESC);

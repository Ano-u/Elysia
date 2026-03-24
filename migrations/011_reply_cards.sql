ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS derived_record_id UUID REFERENCES records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_record_id UUID REFERENCES records(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS root_record_id UUID REFERENCES records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE comments c
SET derived_record_id = r.id
FROM records r
WHERE r.source_comment_id = c.id
  AND c.derived_record_id IS NULL;

UPDATE comments
SET parent_record_id = record_id
WHERE parent_record_id IS NULL;

WITH RECURSIVE record_thread AS (
  SELECT id, id AS root_id
  FROM records
  WHERE source_record_id IS NULL

  UNION ALL

  SELECT child.id, parent.root_id
  FROM records child
  JOIN record_thread parent ON child.source_record_id = parent.id
)
UPDATE comments c
SET root_record_id = COALESCE(rt.root_id, c.parent_record_id, c.record_id)
FROM record_thread rt
WHERE c.derived_record_id = rt.id
  AND c.root_record_id IS NULL;

UPDATE comments
SET root_record_id = COALESCE(root_record_id, parent_record_id, record_id)
WHERE root_record_id IS NULL;

UPDATE comments
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE comments
  ALTER COLUMN parent_record_id SET NOT NULL,
  ALTER COLUMN root_record_id SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_derived_record_unique
  ON comments (derived_record_id)
  WHERE derived_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_parent_created_at
  ON comments (parent_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_root_created_at
  ON comments (root_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_records_source_comment_id
  ON records (source_comment_id);

DO $$
BEGIN
  ALTER TABLE record_links DROP CONSTRAINT IF EXISTS record_links_link_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE record_links
  ADD CONSTRAINT record_links_link_type_check
  CHECK (link_type IN ('derived', 'keyword', 'semantic', 'time', 'resonance', 'manual', 'reply'));

DO $$
BEGIN
  ALTER TABLE mindmap_edges DROP CONSTRAINT IF EXISTS mindmap_edges_edge_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE mindmap_edges
  ADD CONSTRAINT mindmap_edges_edge_type_check
  CHECK (edge_type IN ('keyword', 'semantic', 'time', 'manual', 'resonance', 'reply'));

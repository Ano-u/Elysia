ALTER TABLE records
  ADD COLUMN IF NOT EXISTS visibility_intent TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS publish_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_review_id UUID,
  ADD COLUMN IF NOT EXISTS requires_re_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS risk_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

DO $$
BEGIN
  ALTER TABLE records DROP CONSTRAINT IF EXISTS records_visibility_intent_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE records
  ADD CONSTRAINT records_visibility_intent_check
  CHECK (visibility_intent IN ('private', 'public'));

DO $$
BEGIN
  ALTER TABLE records DROP CONSTRAINT IF EXISTS records_publication_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE records
  ADD CONSTRAINT records_publication_status_check
  CHECK (publication_status IN ('private', 'pending_auto', 'pending_manual', 'published', 'rejected', 'needs_changes'));

UPDATE records
SET
  visibility_intent = 'public',
  publication_status = 'published',
  publish_requested_at = COALESCE(publish_requested_at, created_at),
  published_at = COALESCE(published_at, created_at),
  requires_re_review = FALSE
WHERE is_public = TRUE;

UPDATE records
SET
  visibility_intent = 'private',
  publication_status = 'private',
  requires_re_review = FALSE
WHERE is_public = FALSE
  AND publication_status NOT IN ('pending_auto', 'pending_manual', 'rejected', 'needs_changes');

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS content_moderation_status TEXT NOT NULL DEFAULT 'pending_manual',
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS content_risk_labels TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_review_notes TEXT;

DO $$
BEGIN
  ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_content_moderation_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_content_moderation_status_check
  CHECK (content_moderation_status IN ('pending_auto', 'pending_manual', 'approved', 'rejected'));

UPDATE media_assets
SET
  content_moderation_status = 'approved',
  manual_review_required = FALSE,
  content_reviewed_at = COALESCE(content_reviewed_at, NOW())
WHERE status = 'ready'
  AND content_moderation_status = 'pending_manual';

CREATE TABLE IF NOT EXISTS record_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  revision_no INT NOT NULL,
  edited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, revision_no)
);

CREATE TABLE IF NOT EXISTS content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('record', 'media')),
  target_id UUID NOT NULL,
  target_revision_no INT,
  review_stage TEXT NOT NULL CHECK (review_stage IN ('auto', 'manual')),
  decision TEXT NOT NULL CHECK (decision IN ('pass', 'reject', 'escalate')),
  confidence NUMERIC(5, 4),
  risk_score NUMERIC(5, 4),
  risk_labels TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  model_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('record', 'media')),
  target_id UUID NOT NULL,
  target_revision_no INT,
  priority SMALLINT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  queue_status TEXT NOT NULL DEFAULT 'open' CHECK (queue_status IN ('open', 'claimed', 'resolved')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_role_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS safety_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'critical')),
  target_type TEXT NOT NULL CHECK (target_type IN ('record', 'media', 'user', 'system')),
  target_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_publication_status ON records (publication_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_visibility_intent ON records (visibility_intent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_content_moderation_status ON media_assets (content_moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_revisions_record_revision ON record_revisions (record_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS idx_content_reviews_target_created ON content_reviews (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_priority ON moderation_queue (queue_status, priority, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_admin_role_grants_user ON admin_role_grants (user_id, permission_key);
CREATE INDEX IF NOT EXISTS idx_safety_alerts_created ON safety_alerts (created_at DESC);

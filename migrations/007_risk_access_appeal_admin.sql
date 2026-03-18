DO $$
BEGIN
  ALTER TABLE records DROP CONSTRAINT IF EXISTS records_publication_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE records
  ADD CONSTRAINT records_publication_status_check
  CHECK (
    publication_status IN (
      'private',
      'pending_auto',
      'pending_manual',
      'pending_second_review',
      'published',
      'rejected',
      'needs_changes',
      'risk_control_24h'
    )
  );

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS risk_control_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_control_reason TEXT;

DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_access_status_check
  CHECK (access_status IN ('not_submitted', 'pending', 'approved', 'rejected'));

CREATE TABLE IF NOT EXISTS access_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  essay TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_control_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_id UUID REFERENCES records(id) ON DELETE SET NULL,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('auto_text', 'auto_ai', 'manual')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('medium', 'elevated', 'high', 'very_high')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'warned', 'banned')),
  trigger_ip_hash TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hour'),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolve_note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ban_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT,
  source TEXT NOT NULL CHECK (source IN ('risk_auto', 'admin_manual', 'report')),
  violation_type TEXT NOT NULL CHECK (violation_type IN ('political', 'gore_violence', 'extremism', 'other')),
  reason TEXT NOT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lifted')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  lift_reason TEXT
);

CREATE TABLE IF NOT EXISTS ip_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  banned_until TIMESTAMPTZ,
  source_ban_event_id UUID REFERENCES ban_events(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  lift_reason TEXT
);

CREATE TABLE IF NOT EXISTS ban_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ban_event_id UUID NOT NULL UNIQUE REFERENCES ban_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appeal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolution_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE moderation_queue
  ADD COLUMN IF NOT EXISTS queue_type TEXT NOT NULL DEFAULT 'moderation',
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE moderation_queue DROP CONSTRAINT IF EXISTS moderation_queue_queue_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE moderation_queue
  ADD CONSTRAINT moderation_queue_queue_type_check
  CHECK (queue_type IN ('moderation', 'second_review', 'risk_control', 'access_application', 'appeal', 'media_review'));

CREATE TABLE IF NOT EXISTS ai_review_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  endpoint_type TEXT NOT NULL CHECK (endpoint_type IN ('responses', 'completions')),
  model TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_review_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  range_from TIMESTAMPTZ NOT NULL,
  range_to TIMESTAMPTZ NOT NULL,
  record_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  request_csv TEXT NOT NULL,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_review_runs(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('very_low', 'low', 'medium', 'elevated', 'high', 'very_high')),
  risk_labels TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  raw_item JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_access_applications_status_created
  ON access_applications (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_control_events_status_ends
  ON risk_control_events (status, ends_at ASC);

CREATE INDEX IF NOT EXISTS idx_ban_events_user_created
  ON ban_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ban_appeals_status_submitted
  ON ban_appeals (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_hash
  ON ip_bans (ip_hash);

CREATE INDEX IF NOT EXISTS idx_ai_review_runs_created
  ON ai_review_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_review_decisions_record
  ON ai_review_decisions (record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_type_status_priority
  ON moderation_queue (queue_type, queue_status, priority, created_at ASC);

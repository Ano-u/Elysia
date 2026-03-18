ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS auto_linking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_linking_scope TEXT NOT NULL DEFAULT 'private_only',
  ADD COLUMN IF NOT EXISTS auto_linking_mode TEXT NOT NULL DEFAULT 'suggestion',
  ADD COLUMN IF NOT EXISTS auto_linking_consented_at TIMESTAMPTZ;

UPDATE user_preferences
SET
  auto_linking_enabled = COALESCE(auto_linking_enabled, FALSE),
  auto_linking_scope = CASE
    WHEN auto_linking_scope IN ('private_only', 'public_recommendation') THEN auto_linking_scope
    ELSE 'private_only'
  END,
  auto_linking_mode = CASE
    WHEN auto_linking_mode IN ('suggestion') THEN auto_linking_mode
    ELSE 'suggestion'
  END;

DO $$
BEGIN
  ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_auto_linking_scope_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_auto_linking_scope_check
  CHECK (auto_linking_scope IN ('private_only', 'public_recommendation'));

DO $$
BEGIN
  ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_auto_linking_mode_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_auto_linking_mode_check
  CHECK (auto_linking_mode IN ('suggestion'));

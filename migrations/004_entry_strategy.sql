DO $$
BEGIN
  ALTER TABLE user_preferences
    DROP CONSTRAINT IF EXISTS user_preferences_preferred_entry_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE user_preferences
  ALTER COLUMN preferred_entry DROP DEFAULT;

UPDATE user_preferences
SET preferred_entry = 'auto'
WHERE preferred_entry IS NULL OR preferred_entry = 'home';

ALTER TABLE user_preferences
  ALTER COLUMN preferred_entry SET DEFAULT 'auto';

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_preferred_entry_check
  CHECK (preferred_entry IN ('auto', 'home', 'mindmap'));

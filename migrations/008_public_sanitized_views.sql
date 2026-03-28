ALTER TABLE records
  ADD COLUMN IF NOT EXISTS display_mood_phrase TEXT,
  ADD COLUMN IF NOT EXISTS public_description TEXT,
  ADD COLUMN IF NOT EXISTS public_quote TEXT,
  ADD COLUMN IF NOT EXISTS public_occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_location_label TEXT;

UPDATE records
SET
  display_mood_phrase = COALESCE(display_mood_phrase, mood_phrase),
  public_description = COALESCE(public_description, description),
  public_quote = COALESCE(public_quote, rq.quote),
  public_occurred_at = COALESCE(public_occurred_at, occurred_at),
  public_location_label = COALESCE(public_location_label, NULL)
FROM record_quotes rq
WHERE rq.record_id = records.id;

UPDATE records
SET
  display_mood_phrase = COALESCE(display_mood_phrase, mood_phrase),
  public_description = COALESCE(public_description, description),
  public_occurred_at = COALESCE(public_occurred_at, occurred_at)
WHERE display_mood_phrase IS NULL
   OR public_description IS NULL
   OR public_occurred_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_records_public_occurred_at
  ON records (public_occurred_at DESC);

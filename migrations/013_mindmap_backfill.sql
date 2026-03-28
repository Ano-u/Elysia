INSERT INTO mindmap_nodes (user_id, record_id, node_type, label, payload)
SELECT
  r.user_id,
  r.id,
  'record',
  r.mood_phrase,
  jsonb_build_object(
    'visibilityIntent', r.visibility_intent,
    'publicationStatus', r.publication_status,
    'moodMode', COALESCE(r.mood_mode, 'preset'),
    'customMoodPhrase', r.custom_mood_phrase
  )
FROM records r
WHERE NOT EXISTS (
  SELECT 1
  FROM mindmap_nodes mn
  WHERE mn.record_id = r.id
    AND mn.node_type = 'record'
);

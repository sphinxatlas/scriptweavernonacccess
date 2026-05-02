
ALTER TABLE public.brief_topic_transcripts
  ADD COLUMN IF NOT EXISTS char_count integer,
  ADD COLUMN IF NOT EXISTS estimated_tokens integer,
  ADD COLUMN IF NOT EXISTS script_strength text;

ALTER TABLE public.alternative_sources
  ADD COLUMN IF NOT EXISTS char_count integer,
  ADD COLUMN IF NOT EXISTS estimated_tokens integer,
  ADD COLUMN IF NOT EXISTS script_strength text;

ALTER TABLE public.source_files
  ADD COLUMN IF NOT EXISTS char_count integer,
  ADD COLUMN IF NOT EXISTS estimated_tokens integer,
  ADD COLUMN IF NOT EXISTS script_strength text;

ALTER TABLE public.brief_topic_transcripts
  DROP CONSTRAINT IF EXISTS brief_topic_transcripts_script_strength_check;
ALTER TABLE public.brief_topic_transcripts
  ADD CONSTRAINT brief_topic_transcripts_script_strength_check
  CHECK (script_strength IS NULL OR script_strength IN ('strong','useful','limited'));

ALTER TABLE public.alternative_sources
  DROP CONSTRAINT IF EXISTS alternative_sources_script_strength_check;
ALTER TABLE public.alternative_sources
  ADD CONSTRAINT alternative_sources_script_strength_check
  CHECK (script_strength IS NULL OR script_strength IN ('strong','useful','limited'));

ALTER TABLE public.source_files
  DROP CONSTRAINT IF EXISTS source_files_script_strength_check;
ALTER TABLE public.source_files
  ADD CONSTRAINT source_files_script_strength_check
  CHECK (script_strength IS NULL OR script_strength IN ('strong','useful','limited'));

-- Backfill: brief_topic_transcripts
UPDATE public.brief_topic_transcripts
SET
  char_count = COALESCE(char_count, length(COALESCE(transcript, ''))),
  estimated_tokens = COALESCE(estimated_tokens, GREATEST(1, round(length(COALESCE(transcript, ''))::numeric / 4)::int))
WHERE char_count IS NULL OR estimated_tokens IS NULL;

-- Backfill: alternative_sources
UPDATE public.alternative_sources
SET
  char_count = COALESCE(char_count, length(COALESCE(content, ''))),
  estimated_tokens = COALESCE(estimated_tokens, GREATEST(1, round(length(COALESCE(content, ''))::numeric / 4)::int))
WHERE char_count IS NULL OR estimated_tokens IS NULL;

-- Backfill: source_files (competitor_analysis) from indexed chunks
WITH chunk_totals AS (
  SELECT file_id, SUM(length(content))::int AS total_chars
  FROM public.file_chunks
  GROUP BY file_id
)
UPDATE public.source_files sf
SET
  char_count = ct.total_chars,
  estimated_tokens = GREATEST(1, round(ct.total_chars::numeric / 4)::int)
FROM chunk_totals ct
WHERE sf.id = ct.file_id
  AND sf.file_type = 'competitor_analysis'
  AND (sf.char_count IS NULL OR sf.estimated_tokens IS NULL);

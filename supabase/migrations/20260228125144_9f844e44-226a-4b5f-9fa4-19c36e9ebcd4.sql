-- Add 'lexicon' to source_file_type enum
ALTER TYPE public.source_file_type ADD VALUE IF NOT EXISTS 'lexicon';

-- Drop and recreate search_chunks to return results ordered by source priority
DROP FUNCTION IF EXISTS public.search_chunks(text, integer);

CREATE OR REPLACE FUNCTION public.search_chunks(search_query text, max_results integer DEFAULT 20)
RETURNS TABLE(id uuid, file_id uuid, content text, chunk_index integer, file_name text, file_type source_file_type, rank real)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.file_id,
    fc.content,
    fc.chunk_index,
    sf.name AS file_name,
    sf.file_type,
    ts_rank(fc.search_vector, plainto_tsquery('english', search_query)) AS rank
  FROM public.file_chunks fc
  JOIN public.source_files sf ON sf.id = fc.file_id
  WHERE fc.search_vector @@ plainto_tsquery('english', search_query)
  ORDER BY
    CASE sf.file_type
      WHEN 'book' THEN 1
      WHEN 'transcript' THEN 2
      WHEN 'lexicon' THEN 3
      WHEN 'instructions' THEN 4
    END,
    rank DESC
  LIMIT max_results;
END;
$$;

-- Create a new RPC that filters by file_type at query time, not post-hoc
CREATE OR REPLACE FUNCTION public.search_chunks_by_type(
  search_query text,
  source_type source_file_type,
  max_results integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  file_id uuid,
  content text,
  chunk_index integer,
  file_name text,
  file_type source_file_type,
  rank real
)
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
    AND sf.file_type = source_type
  ORDER BY rank DESC
  LIMIT max_results;
END;
$$;

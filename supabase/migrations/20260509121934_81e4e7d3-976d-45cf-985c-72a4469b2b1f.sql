-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column (1536d for OpenAI text-embedding-3-small)
ALTER TABLE public.file_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. IVFFlat index for cosine similarity (lists=100 is reasonable for ~7k rows;
--    can be REINDEXed later as corpus grows).
CREATE INDEX IF NOT EXISTS file_chunks_embedding_ivfflat
  ON public.file_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. match_chunks(query_embedding, source_type, k) — cosine-similarity retrieval
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector(1536),
  source_type public.source_file_type,
  k integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  content text,
  chunk_index integer,
  file_name text,
  file_type public.source_file_type,
  similarity real
)
LANGUAGE plpgsql
STABLE
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
    (1 - (fc.embedding <=> query_embedding))::real AS similarity
  FROM public.file_chunks fc
  JOIN public.source_files sf ON sf.id = fc.file_id
  WHERE fc.embedding IS NOT NULL
    AND sf.file_type = source_type
  ORDER BY fc.embedding <=> query_embedding
  LIMIT k;
END;
$$;

-- Create enum types
CREATE TYPE public.source_file_type AS ENUM ('book', 'transcript', 'instructions');
CREATE TYPE public.pipeline_step_type AS ENUM ('evidence_table', 'analysis_memo', 'outline', 'full_script', 'verification');

-- Create source_files table
CREATE TABLE public.source_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_type public.source_file_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create file_chunks table with full-text search
CREATE TABLE public.file_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.source_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  search_vector TSVECTOR,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for full-text search
CREATE INDEX idx_file_chunks_search ON public.file_chunks USING GIN(search_vector);
CREATE INDEX idx_file_chunks_file_id ON public.file_chunks(file_id);

-- Create function to auto-update search vector
CREATE OR REPLACE FUNCTION public.update_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_file_chunks_search_vector
BEFORE INSERT OR UPDATE ON public.file_chunks
FOR EACH ROW EXECUTE FUNCTION public.update_chunk_search_vector();

-- Create topic_briefs table
CREATE TABLE public.topic_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pipeline_outputs table
CREATE TABLE public.pipeline_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brief_id UUID NOT NULL REFERENCES public.topic_briefs(id) ON DELETE CASCADE,
  step_type public.pipeline_step_type NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_outputs_brief ON public.pipeline_outputs(brief_id, step_type);

-- Enable RLS on all tables (public access for now - no auth required)
ALTER TABLE public.source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_outputs ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth for this tool)
CREATE POLICY "Public read source_files" ON public.source_files FOR SELECT USING (true);
CREATE POLICY "Public insert source_files" ON public.source_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update source_files" ON public.source_files FOR UPDATE USING (true);
CREATE POLICY "Public delete source_files" ON public.source_files FOR DELETE USING (true);

CREATE POLICY "Public read file_chunks" ON public.file_chunks FOR SELECT USING (true);
CREATE POLICY "Public insert file_chunks" ON public.file_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete file_chunks" ON public.file_chunks FOR DELETE USING (true);

CREATE POLICY "Public read topic_briefs" ON public.topic_briefs FOR SELECT USING (true);
CREATE POLICY "Public insert topic_briefs" ON public.topic_briefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update topic_briefs" ON public.topic_briefs FOR UPDATE USING (true);
CREATE POLICY "Public delete topic_briefs" ON public.topic_briefs FOR DELETE USING (true);

CREATE POLICY "Public read pipeline_outputs" ON public.pipeline_outputs FOR SELECT USING (true);
CREATE POLICY "Public insert pipeline_outputs" ON public.pipeline_outputs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update pipeline_outputs" ON public.pipeline_outputs FOR UPDATE USING (true);
CREATE POLICY "Public delete pipeline_outputs" ON public.pipeline_outputs FOR DELETE USING (true);

-- Create updated_at trigger for topic_briefs
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_topic_briefs_updated_at
BEFORE UPDATE ON public.topic_briefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for source files
INSERT INTO storage.buckets (id, name, public) VALUES ('source-files', 'source-files', false);

-- Storage policies
CREATE POLICY "Public upload source files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'source-files');
CREATE POLICY "Public read source files" ON storage.objects FOR SELECT USING (bucket_id = 'source-files');
CREATE POLICY "Public delete source files" ON storage.objects FOR DELETE USING (bucket_id = 'source-files');

-- Create search function
CREATE OR REPLACE FUNCTION public.search_chunks(search_query TEXT, max_results INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  content TEXT,
  chunk_index INTEGER,
  file_name TEXT,
  file_type public.source_file_type,
  rank REAL
) AS $$
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
  ORDER BY rank DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Clip & Quote Finder: editor-only utility, separate from main pipeline outputs
CREATE TABLE public.clip_quote_finder_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brief_id uuid NOT NULL,
  pasted_script text NOT NULL,
  editor_notes text,
  prioritize_exact_film_timestamps boolean NOT NULL DEFAULT true,
  include_book_quote_inserts boolean NOT NULL DEFAULT true,
  include_contextual_broll_ideas boolean NOT NULL DEFAULT true,
  output_markdown text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_clip_quote_finder_runs_brief_id ON public.clip_quote_finder_runs(brief_id);

ALTER TABLE public.clip_quote_finder_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read clip_quote_finder_runs"
  ON public.clip_quote_finder_runs FOR SELECT USING (true);
CREATE POLICY "Public insert clip_quote_finder_runs"
  ON public.clip_quote_finder_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update clip_quote_finder_runs"
  ON public.clip_quote_finder_runs FOR UPDATE USING (true);
CREATE POLICY "Public delete clip_quote_finder_runs"
  ON public.clip_quote_finder_runs FOR DELETE USING (true);

CREATE TRIGGER update_clip_quote_finder_runs_updated_at
  BEFORE UPDATE ON public.clip_quote_finder_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.improved_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled script',
  draft_script TEXT NOT NULL,
  improved_output TEXT NOT NULL DEFAULT '',
  target_min_words INTEGER,
  target_max_words INTEGER,
  tone_note TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.improved_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read improved_scripts"
  ON public.improved_scripts FOR SELECT
  USING (true);

CREATE POLICY "Public insert improved_scripts"
  ON public.improved_scripts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update improved_scripts"
  ON public.improved_scripts FOR UPDATE
  USING (true);

CREATE POLICY "Public delete improved_scripts"
  ON public.improved_scripts FOR DELETE
  USING (true);

CREATE TRIGGER update_improved_scripts_updated_at
  BEFORE UPDATE ON public.improved_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_improved_scripts_created_at ON public.improved_scripts(created_at DESC);
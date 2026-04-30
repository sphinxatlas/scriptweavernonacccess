CREATE TABLE public.angle_lab_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  working_idea TEXT NOT NULL,
  possible_topics TEXT,
  user_notes TEXT,
  raw_output TEXT NOT NULL DEFAULT '',
  parsed_directions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.angle_lab_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read angle_lab_runs"
ON public.angle_lab_runs FOR SELECT
USING (true);

CREATE POLICY "Public insert angle_lab_runs"
ON public.angle_lab_runs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public update angle_lab_runs"
ON public.angle_lab_runs FOR UPDATE
USING (true);

CREATE POLICY "Public delete angle_lab_runs"
ON public.angle_lab_runs FOR DELETE
USING (true);

CREATE TRIGGER update_angle_lab_runs_updated_at
BEFORE UPDATE ON public.angle_lab_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_angle_lab_runs_created_at ON public.angle_lab_runs(created_at DESC);

ALTER TABLE public.topic_briefs
  ADD COLUMN IF NOT EXISTS competitor_script_1 text,
  ADD COLUMN IF NOT EXISTS competitor_script_2 text,
  ADD COLUMN IF NOT EXISTS competitor_script_3 text,
  ADD COLUMN IF NOT EXISTS competitor_script_4 text,
  ADD COLUMN IF NOT EXISTS competitor_script_5 text;

ALTER TYPE public.pipeline_step_type ADD VALUE IF NOT EXISTS 'competitor_format_analysis';

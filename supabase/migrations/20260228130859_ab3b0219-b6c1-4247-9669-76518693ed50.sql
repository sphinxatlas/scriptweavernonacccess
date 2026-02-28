
-- Expand topic_briefs with optional research fields
ALTER TABLE public.topic_briefs
  ADD COLUMN IF NOT EXISTS thesis text,
  ADD COLUMN IF NOT EXISTS focus_areas text[],
  ADD COLUMN IF NOT EXISTS characters text[],
  ADD COLUMN IF NOT EXISTS proof_goal text,
  ADD COLUMN IF NOT EXISTS priority_sources text[],
  ADD COLUMN IF NOT EXISTS emotional_angle text,
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS comparison_mode boolean NOT NULL DEFAULT false;

-- Add 'retrieval' to pipeline_step_type enum
ALTER TYPE public.pipeline_step_type ADD VALUE IF NOT EXISTS 'retrieval';

-- Create evidence_points table for starred evidence workflow
CREATE TABLE IF NOT EXISTS public.evidence_points (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brief_id uuid NOT NULL REFERENCES public.topic_briefs(id) ON DELETE CASCADE,
  claim text NOT NULL,
  source_type text NOT NULL,
  source_file text,
  book_evidence text,
  movie_evidence text,
  lexicon_support text,
  exact_quote text,
  paraphrase text,
  difference_note text,
  confidence text NOT NULL DEFAULT 'medium',
  evidence_type text NOT NULL DEFAULT 'summary',
  starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for evidence_points
ALTER TABLE public.evidence_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read evidence_points" ON public.evidence_points FOR SELECT USING (true);
CREATE POLICY "Public insert evidence_points" ON public.evidence_points FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update evidence_points" ON public.evidence_points FOR UPDATE USING (true);
CREATE POLICY "Public delete evidence_points" ON public.evidence_points FOR DELETE USING (true);

ALTER TABLE public.evidence_points
  ADD COLUMN IF NOT EXISTS approval_status text CHECK (approval_status IN ('approved','rejected'));
CREATE INDEX IF NOT EXISTS idx_evidence_points_brief ON public.evidence_points(brief_id);
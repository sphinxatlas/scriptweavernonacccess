ALTER TABLE public.evidence_points
  ADD COLUMN secondary_source_support text,
  ADD COLUMN why_this_matters text,
  ADD COLUMN commentary_angle text;
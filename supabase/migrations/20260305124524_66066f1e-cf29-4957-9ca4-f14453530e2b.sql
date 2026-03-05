ALTER TABLE public.topic_briefs
  ADD COLUMN target_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN target_min_words integer NOT NULL DEFAULT 1400,
  ADD COLUMN target_max_words integer NOT NULL DEFAULT 1600;
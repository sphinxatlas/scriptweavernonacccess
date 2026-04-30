-- Format reference transcripts (non-HP, structure reference only)
CREATE TABLE public.format_reference_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_name text NOT NULL,
  video_title text NOT NULL,
  transcript text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.format_reference_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read format_reference_transcripts" ON public.format_reference_transcripts FOR SELECT USING (true);
CREATE POLICY "Public insert format_reference_transcripts" ON public.format_reference_transcripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update format_reference_transcripts" ON public.format_reference_transcripts FOR UPDATE USING (true);
CREATE POLICY "Public delete format_reference_transcripts" ON public.format_reference_transcripts FOR DELETE USING (true);

-- Brief-specific HP topic transcripts
CREATE TABLE public.brief_topic_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_name text NOT NULL,
  video_title text NOT NULL,
  transcript text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brief_topic_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read brief_topic_transcripts" ON public.brief_topic_transcripts FOR SELECT USING (true);
CREATE POLICY "Public insert brief_topic_transcripts" ON public.brief_topic_transcripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update brief_topic_transcripts" ON public.brief_topic_transcripts FOR UPDATE USING (true);
CREATE POLICY "Public delete brief_topic_transcripts" ON public.brief_topic_transcripts FOR DELETE USING (true);

-- Junction tables
CREATE TABLE public.brief_format_reference_links (
  brief_id uuid NOT NULL REFERENCES public.topic_briefs(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES public.format_reference_transcripts(id) ON DELETE CASCADE,
  PRIMARY KEY (brief_id, transcript_id)
);
ALTER TABLE public.brief_format_reference_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all brief_format_reference_links" ON public.brief_format_reference_links FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.brief_topic_transcript_links (
  brief_id uuid NOT NULL REFERENCES public.topic_briefs(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES public.brief_topic_transcripts(id) ON DELETE CASCADE,
  PRIMARY KEY (brief_id, transcript_id)
);
ALTER TABLE public.brief_topic_transcript_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public all brief_topic_transcript_links" ON public.brief_topic_transcript_links FOR ALL USING (true) WITH CHECK (true);

-- New columns on topic_briefs
ALTER TABLE public.topic_briefs
  ADD COLUMN IF NOT EXISTS angle_note text,
  ADD COLUMN IF NOT EXISTS creative_brief_feedback text,
  ADD COLUMN IF NOT EXISTS creative_brief_approved boolean NOT NULL DEFAULT false;

-- New pipeline step types
ALTER TYPE public.pipeline_step_type ADD VALUE IF NOT EXISTS 'creative_brief';
ALTER TYPE public.pipeline_step_type ADD VALUE IF NOT EXISTS 'six_category_extraction';
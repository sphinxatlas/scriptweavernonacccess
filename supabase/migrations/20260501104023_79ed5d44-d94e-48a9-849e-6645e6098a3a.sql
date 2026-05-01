CREATE TABLE public.brief_alternative_source_links (
  brief_id uuid NOT NULL,
  alternative_source_id uuid NOT NULL,
  PRIMARY KEY (brief_id, alternative_source_id)
);

ALTER TABLE public.brief_alternative_source_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public all brief_alternative_source_links"
ON public.brief_alternative_source_links
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_basl_brief_id ON public.brief_alternative_source_links(brief_id);
CREATE INDEX idx_basl_alt_id ON public.brief_alternative_source_links(alternative_source_id);
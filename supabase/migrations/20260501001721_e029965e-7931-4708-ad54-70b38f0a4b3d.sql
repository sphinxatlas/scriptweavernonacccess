CREATE TABLE public.alternative_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT,
  source_author TEXT,
  url TEXT,
  content TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alternative_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read alternative_sources" ON public.alternative_sources FOR SELECT USING (true);
CREATE POLICY "Public insert alternative_sources" ON public.alternative_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update alternative_sources" ON public.alternative_sources FOR UPDATE USING (true);
CREATE POLICY "Public delete alternative_sources" ON public.alternative_sources FOR DELETE USING (true);

CREATE TRIGGER update_alternative_sources_updated_at
BEFORE UPDATE ON public.alternative_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
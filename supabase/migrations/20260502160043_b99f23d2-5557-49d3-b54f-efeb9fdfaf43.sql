CREATE TABLE public.question_bank_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'Low',
  canon_status text NOT NULL DEFAULT 'Not directly confirmed',
  explanation text,
  script_safe_takeaway text,
  caveats jsonb,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_bank_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.question_bank_entries(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_name text NOT NULL,
  location text,
  exact_finding text NOT NULL,
  what_it_proves text,
  evidence_strength text,
  canon_weight text,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qb_evidence_entry ON public.question_bank_evidence(entry_id);
CREATE INDEX idx_qb_entries_created ON public.question_bank_entries(created_at DESC);

ALTER TABLE public.question_bank_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read question_bank_entries" ON public.question_bank_entries FOR SELECT USING (true);
CREATE POLICY "Public insert question_bank_entries" ON public.question_bank_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update question_bank_entries" ON public.question_bank_entries FOR UPDATE USING (true);
CREATE POLICY "Public delete question_bank_entries" ON public.question_bank_entries FOR DELETE USING (true);

CREATE POLICY "Public read question_bank_evidence" ON public.question_bank_evidence FOR SELECT USING (true);
CREATE POLICY "Public insert question_bank_evidence" ON public.question_bank_evidence FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update question_bank_evidence" ON public.question_bank_evidence FOR UPDATE USING (true);
CREATE POLICY "Public delete question_bank_evidence" ON public.question_bank_evidence FOR DELETE USING (true);

CREATE TRIGGER trg_question_bank_entries_updated
BEFORE UPDATE ON public.question_bank_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
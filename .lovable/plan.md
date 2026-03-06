

## Natural Voiceover Pipeline Overhaul

### Summary
Four prompt changes across `supabase/functions/generate-step/index.ts` to make the pipeline produce a clean, speakable script rather than a research document.

### Changes

**1. Evidence Table (lines 168-210)** — Update paraphrase-first discipline:
- Default to paraphrased evidence in the table
- Exact quotes only as optional micro-quotes (under 12 words)
- Keep existing table format but adjust instructions

**2. Analysis Memo (lines 212-225)** — Add quote restriction:
- May discuss and reference quotes but must not paste long excerpts
- Keep analytical, not excerpt-heavy

**3. Outline (lines 227-252)** — Add editor tags:
- Every claim/scene reference must include an editor tag in brackets
- Tag formats: `[BOOK: filename | chapter]`, `[FILM: filename | timestamp range]`, `[LEXICON: filename | summary]`
- Editor tags are metadata only, not spoken text
- Tags must NOT contain exact quotes

**4. Full Script (lines 254-284)** — Major rewrite:
- Max 0-2 short quotes per 1,000 words, each under 12 words
- Everything else paraphrased as spoken narration
- Remove all `[SOURCE: ...]` lines and `VISUAL NOTES:` blocks
- Replace with editor tags on their own lines after each section: `[BOOK: filename | chapter]`, `[FILM: filename | timestamp]`, `[LEXICON: filename | summary]`
- Editor tags must NOT contain exact quotes
- No `SOURCE SECONDARY` blocks
- Clean output: headings + short VO paragraphs + editor tags only
- Script reads like a creator speaking, not reading sources aloud

**Files edited:** `supabase/functions/generate-step/index.ts` (single file, auto-deploys)


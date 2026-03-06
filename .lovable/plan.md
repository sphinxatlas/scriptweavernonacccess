

## Natural Voiceover Pipeline Overhaul (COMPLETED)

### Summary
Four prompt changes across `supabase/functions/generate-step/index.ts` plus Script Instructions priority enforcement.

### Changes Applied

1. **Evidence Table** — Paraphrase-first discipline. Micro-quotes under 12 words only. No long excerpts.
2. **Analysis Memo** — Quote restriction. May reference quotes conceptually but no pasted excerpts.
3. **Outline** — Editor tags mandatory: `[BOOK]`, `[FILM]`, `[LEXICON]` with no exact quotes in tags.
4. **Full Script** — Natural VO only. 0-2 quotes per 1k words (under 12 words each). Editor tags replace SOURCE/VISUAL NOTES. So-what rule after evidence beats. Script Instructions = highest priority guidance.
5. **Script Instructions Priority** — Injected as "HIGHEST PRIORITY WRITING GUIDANCE" for full_script, overriding other guidance sources.

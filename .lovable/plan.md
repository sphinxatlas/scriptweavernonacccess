

## Script Improver Feature

A new section where you paste or upload an existing draft script. The system rewrites it using your **Script Instructions & Strategy** as the highest-priority writing guide, applies the **Anti-AI Language Guide**, and inserts relevant editor reference tags (`[BOOK: ...]`, `[FILM: ...]`, `[LEXICON: ...]`) from your indexed source library where the script makes claims that match canon.

### What you'll see

A new sidebar entry **"Script Improver"** (route `/improve`) with a single page containing:

1. **Input panel**
   - Large textarea to paste a draft script (also accepts `.txt` / `.md` upload)
   - Optional inputs: target word count, tone notes
   - "Improve Script" button

2. **Output panel** (streams in real time)
   - Improved script as clean, speakable voiceover paragraphs
   - Editor tags on their own lines after evidence-based beats:
     - `[BOOK: filename | chapter]`
     - `[FILM: filename | timestamp range]`
     - `[LEXICON: filename | context]` (metadata only, never spoken)
   - Same quote discipline as Full Script: max 0–2 short quotes per 1,000 words, each under 12 words
   - "So-what" takeaway after every evidence-based beat
   - No `VISUAL NOTES`, no `[CLAIM]`, no `[SOURCE]` lines, no Lexicon mentions in narration
   - Copy-to-clipboard + download buttons

3. **Reference hits panel** (collapsible)
   - Shows which book/transcript/lexicon chunks the model retrieved to support the rewrite, so you can verify the references are real

### How it works under the hood

- New edge function `improve-script` (mirrors patterns in `generate-step`):
  - Accepts `{ draftScript, targetMinWords?, targetMaxWords?, toneNote? }`
  - Extracts key claim phrases from the draft (simple keyword/entity extraction in the function) and runs them through `search_chunks` against books / transcripts / lexicon to gather supporting passages
  - Pulls `instructions` + `anti_ai_guide` chunks from the source library
  - Builds a system prompt that:
    - Injects Script Instructions as **HIGHEST PRIORITY** (same pattern as `full_script`)
    - Injects Anti-AI Guide as mandatory
    - Reuses the natural-voiceover rules: paraphrase-first, quote discipline, installment naming, lexicon-mention ban, editor-tag format, "so-what" beats
    - Tells the model to preserve the creator's intent and structure of the draft, only improving voice/pacing/hooks and inserting editor tags where retrieved evidence matches
  - Streams SSE response back (same shape as `streamGenerateStep`)
- Frontend adds:
  - `src/pages/ScriptImprover.tsx`
  - `streamImproveScript()` helper in `src/lib/api.ts`
  - New route in `src/App.tsx`
  - New nav item in `src/components/AppSidebar.tsx`

### What is NOT changed

- No database schema changes (improver is stateless — output isn't persisted unless you ask later)
- Existing pipeline steps (Evidence Table, Outline, Full Script, etc.) are untouched
- Source Library and Topic Briefs work exactly as today

### Files touched

- `supabase/functions/improve-script/index.ts` (new)
- `src/pages/ScriptImprover.tsx` (new)
- `src/lib/api.ts` (add `streamImproveScript`)
- `src/App.tsx` (add route)
- `src/components/AppSidebar.tsx` (add nav item)


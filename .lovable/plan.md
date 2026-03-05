

## Rename Competitor Analysis to Commentary Transcripts (Secondary)

This reclassifies the existing `competitor_analysis` source type from a "guidance only" layer into a new Tier 3 "Secondary Commentary Context" layer with distinct usage rules: it can inspire angles and provide context during generation, but any factual claims must be confirmed against Tier 1 sources before use.

### Changes

**1. Source Library UI** (`src/pages/SourceLibrary.tsx`)
- Rename the card title from "Competitor Analysis" to "🎙️ Commentary Transcripts (Secondary)"
- Change badge from "Guidance Only — Not Evidence" to "Secondary Commentary — Not Canon"
- Update description to: "Upload raw YouTube commentary transcripts for additional angles and context. Used for interpretation, framing, and idea discovery only. Never used as primary canon evidence or as a source for exact quotes from the books or films."

**2. FileUploadCard** (`src/components/FileUploadCard.tsx`)
- No structural changes needed; the card already accepts `competitor_analysis` as a file type. Just the props passed from SourceLibrary change.

**3. Source Hierarchy** (`supabase/functions/generate-step/index.ts`)
- Rewrite `SOURCE_HIERARCHY_INSTRUCTION` to use a 4-tier model:
  - Tier 1: Books + Movie Transcripts (Primary Canon)
  - Tier 2: Lexicon (Secondary Canon Support)
  - Tier 3: Commentary Transcripts (Secondary Commentary Context) -- angle discovery, framing, interpretation, thematic lenses; any factual claims must be confirmed against Tier 1; never quote verbatim into final script; never copy structure
  - Tier 4: Script Instructions & Strategy (Writing Guidance)
- Add explicit rules: "If a point originates from Commentary Transcripts, the system must confirm it using books or movie transcripts before presenting it as a factual claim."

**4. Retrieval step behavior** (edge function)
- Commentary Transcripts (`competitor_analysis` file type) may now be searched during the Retrieval step, but results must be labeled as "Commentary (Secondary, needs canon confirmation)" in the output format
- Add a new output section: `## Commentary Angles (Secondary — Needs Canon Confirmation)` between Lexicon Support and Retrieval Gaps
- The retrieval plan will add `competitor_analysis` queries with a small limit (5-8 results)

**5. Evidence Table behavior** (edge function prompt)
- Commentary Transcripts cannot be used as primary evidence
- Add an optional field to the evidence table format: `| **Commentary Angle** | [If inspired by commentary transcript — needs canon confirmation] |`

**6. Generation steps** (analysis_memo, outline, full_script)
- Commentary context block header changes from "Competitor Analysis (GUIDANCE ONLY...)" to "Commentary Transcripts (SECONDARY COMMENTARY — angles and framing only, all factual claims must be confirmed against books/movie transcripts)"
- Add rule in generation prompts: "no competitor wording reuse" and "Angle inspired by commentary transcript — requires canon confirmation"

**7. No database migration needed**
- The `competitor_analysis` enum value stays as-is in the DB. The UI and edge function just treat it differently.

### File Summary
- `src/pages/SourceLibrary.tsx` — rename card title, badge, description
- `supabase/functions/generate-step/index.ts` — rewrite hierarchy to 4 tiers, update retrieval to include commentary search with labeling, update evidence table prompt, update generation guidance block headers and rules




## Fix Full Script Output — Keep `[SOURCE]` Brackets, Remove from Spoken Text

### Problem
The prompt currently tells the model to include `[SOURCE: filename]` *inline within the voiceover text*, making it part of the spoken script. User wants sources in brackets but **not as part of the natural spoken narration** — they should appear as separate annotations after the relevant sentence/paragraph.

### Change

**`supabase/functions/generate-step/index.ts`** — Update lines 259-271:

Replace the requirements block so that:
- The voiceover body text is **purely natural spoken words** — no brackets of any kind appear inside the narrated paragraphs
- After each paragraph or section, include `[SOURCE: filename]` references on their own line to indicate what was cited
- `VISUAL NOTES:` block stays at the end of each section
- Explicitly forbid `[CLAIM]`, `[B-ROLL]`, `[CUT TO]`, `[GRAPHIC]` anywhere
- Sources are **not** woven into the narration (no "According to X" unless it's natural dialogue attribution)

Resulting prompt structure per section:
```text
<natural voiceover paragraph>

[SOURCE: book5_chapter12.txt]
[SOURCE: movie3_transcript.txt]

VISUAL NOTES: b-roll of Hogwarts corridor, cut to close-up...
```

Single file edit, edge function redeploy.


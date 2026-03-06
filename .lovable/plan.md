

## Fix Full Script Output Format

### Change

**`supabase/functions/generate-step/index.ts`** — Update lines 259–271 of the `full_script` prompt:

Replace the current requirements block to:
- Remove `[B-ROLL]`, `[CUT TO]`, `[GRAPHIC]`, `[CLAIM]` inline annotations
- Keep `[SOURCE: filename]` annotations after evidence references
- Output each section as natural voiceover paragraphs
- After each section's paragraph(s), add a `VISUAL NOTES:` block with editor instructions (b-roll suggestions, cuts, graphics) for that section
- Maintain conversational/authoritative tone, hook, CTA, source hierarchy, and word count instructions

Single file edit, edge function redeploy.


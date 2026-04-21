

## Script Improver — Iterative Refinement

Add post-output controls so you can iterate on the improved script without restarting from the original draft.

### What you'll see

After the first improved script streams in, two new controls appear above the output panel:

1. **"Make it longer" button** — one-click expansion (adds ~30–50% more length while preserving structure, voice, and all editor tags).
2. **Feedback box + "Rewrite with feedback" button** — a textarea where you type notes like *"punchier hook, drop the third paragraph, more skeptical tone"*, then trigger a rewrite that applies your notes on top of the current improved script.

Each new output replaces the previous one in the output panel, but the original draft is preserved in the input panel so you can always start over. References panel updates with each rewrite.

### How it works

- A new **revision mode** is added to the existing `improve-script` edge function. It accepts:
  - `mode: "initial" | "lengthen" | "feedback"`
  - `previousOutput?: string` (the last improved script)
  - `feedbackNote?: string` (user's revision notes)
- When `mode = "lengthen"`: prompt instructs the model to expand the previous output, keep all editor tags, add depth/examples/transitions, and respect existing rules (paraphrase-first, installment naming, lexicon ban, etc.). Targets ~30–50% more words.
- When `mode = "feedback"`: prompt injects the previous output + the user's feedback as the highest-priority revision instruction (still under Script Writing Instructions). Re-runs retrieval against the *revised* claims so references stay accurate.
- Same SSE streaming, same reference-hits payload.

### Frontend changes

- `src/pages/ScriptImprover.tsx`:
  - Track `output`, `previousOutput`, `feedbackNote`, `revisionCount` state
  - After first output completes, render a **"Refine"** card under the output panel containing the two controls
  - "Make it longer" disabled while streaming; shows spinner during rewrite
  - Feedback textarea is required for the feedback button
- `src/lib/api.ts`:
  - Extend `streamImproveScript` payload with `mode`, `previousOutput`, `feedbackNote`

### Files touched

- `supabase/functions/improve-script/index.ts` (add mode handling + two new prompt branches)
- `src/pages/ScriptImprover.tsx` (refine controls + state)
- `src/lib/api.ts` (extended payload type)

### What is NOT changed

- No DB changes — still stateless
- Original draft input untouched between revisions
- All existing voiceover rules (quote discipline, installment naming, lexicon ban, editor tag format, "so-what" beats) apply to every revision


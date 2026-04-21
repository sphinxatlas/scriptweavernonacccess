

## Saved Improved Scripts — History

Add a persistent history of every improved script run so you can revisit, copy, or delete past outputs from the Script Improver page.

### What you'll see

On `/improve`, a new **"Saved scripts"** panel appears (collapsible card under the input panel, or a side drawer on smaller widths). Each entry shows:

- Title (auto-derived from the first line / first 60 chars of the draft, editable inline)
- Created date + word count
- "Open" button → loads the original draft into the input panel and the latest improved output into the output panel
- "Delete" button (with confirm)

A new entry is created automatically the first time you click **"Improve Script"**. Subsequent revisions on the same session (lengthen / feedback) update that entry's `improved_output` in place. Starting a fresh "Improve Script" run from a cleared draft creates a new entry.

### Database

New table `improved_scripts`:
- `id` (uuid, pk)
- `title` (text)
- `draft_script` (text) — original input
- `improved_output` (text) — latest improved version
- `target_min_words`, `target_max_words` (int, nullable)
- `tone_note` (text, nullable)
- `revision_count` (int, default 0)
- `created_at`, `updated_at` (timestamptz)

Public RLS policies (matches existing tables in this project — no auth in the app today).

### Frontend changes

- `src/lib/api.ts`: add `listImprovedScripts`, `createImprovedScript`, `updateImprovedScript`, `deleteImprovedScript`, `renameImprovedScript`.
- `src/pages/ScriptImprover.tsx`:
  - Track `currentScriptId` in state
  - On first successful initial run → `createImprovedScript`, store id
  - On lengthen/feedback completion → `updateImprovedScript` with new `improved_output` and incremented `revision_count`
  - New "Saved scripts" card (uses shadcn `Card` + `ScrollArea`) listing entries, with Open / Rename / Delete
  - "New script" button clears state and unsets `currentScriptId`

### What is NOT changed

- Edge function `improve-script` is untouched (still stateless — frontend persists results)
- Reference hits are not persisted (they're regenerated on each run; saving them would bloat storage and they're tied to the current source library)
- Existing pipeline / Topic Briefs / Source Library unchanged

### Files touched

- New migration: `improved_scripts` table + RLS
- `src/lib/api.ts` (CRUD helpers)
- `src/pages/ScriptImprover.tsx` (history panel + auto-save logic)


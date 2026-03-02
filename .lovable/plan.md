

## Merge Script Instructions and Script Strategy

Yes, combining these makes sense. They serve the same purpose — shaping writing behavior — and having two separate upload slots for guidance documents adds unnecessary complexity. One unified section is cleaner.

### Changes

1. **Source Library UI** (`src/pages/SourceLibrary.tsx`): Remove the separate Script Strategy card. Rename the Script Instructions card to something like "Script Instructions & Strategy" with an updated description covering both use cases (tone, style, hooks, pacing, rehooks, structure, retention).

2. **FileUploadCard usage**: The combined card will use `file_type = "instructions"` and accept multiple files, so users can upload one master doc or split across a few files.

3. **Edge Function** (`supabase/functions/generate-step/index.ts`): Remove all `script_strategy`-specific retrieval and guidance injection logic. Merge it into the existing `instructions` handling — the guidance block for generation steps (Analysis Memo, Outline, Full Script) will pull from `instructions` type files only. The tier 3 rules remain the same: guidance only, never evidence.

4. **API / types**: Remove `script_strategy` from the `FileType` union in `src/lib/api.ts`. The database enum can keep the value for backward compatibility (existing files won't break), but the UI will stop offering it as an upload target.

5. **No database migration needed**: Keeping the enum value in the DB is harmless. Any previously uploaded `script_strategy` files will still exist and can be treated identically to `instructions` in the edge function logic.

### Result

One card in Source Library: **"Script Instructions & Strategy"** with badge "Guidance Only" — covering writing guidelines, hook quality, pacing, rehooks, argument structure, and retention. One master document upload slot.


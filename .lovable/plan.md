

## Add Target Length (Voiceover) to Topic Briefs

### 1. Database Migration

Add three columns to `topic_briefs`:
- `target_minutes` (integer, default 10)
- `target_min_words` (integer, default 1400)
- `target_max_words` (integer, default 1600)

### 2. API Layer (`src/lib/api.ts`)

Add `target_minutes`, `target_min_words`, `target_max_words` to `CreateBriefInput` interface.

Define a constant for the dropdown options:
```typescript
export const TARGET_LENGTH_OPTIONS = [
  { minutes: 8, min: 1120, max: 1280, label: "8 min (1,120–1,280 words)" },
  { minutes: 10, min: 1400, max: 1600, label: "10 min (1,400–1,600 words)" },
  { minutes: 12, min: 1680, max: 1920, label: "12 min (1,680–1,920 words)" },
  { minutes: 15, min: 2100, max: 2400, label: "15 min (2,100–2,400 words)" },
  { minutes: 20, min: 2800, max: 3200, label: "20 min (2,800–3,200 words)" },
];
```

### 3. Topic Briefs UI (`src/pages/TopicBriefs.tsx`)

Add a Select dropdown in the form labeled "Target Length (Voiceover)" with the five options. Default to 10 min. When selection changes, set all three fields (`target_minutes`, `target_min_words`, `target_max_words`) on the form. Show the selected length as a badge on brief cards in the list.

### 4. Edge Function (`supabase/functions/generate-step/index.ts`)

**Outline prompt** (line ~190): Append dynamic instruction from brief data:
- "Include a word budget per section that sums to {min}–{max} words total"
- "Include an estimated total word count line at the end"

**Full Script prompt** (line ~213): Replace the hardcoded "Target 10-15 minute video length (2000-3000 words)" with dynamic values from the brief:
- "Enforce total word count within {min} to {max} words"
- "If the draft falls outside this range, self-revise until it lands inside"
- "Include a final line: Word count: ~X (target: {min}–{max})"

Read `target_min_words` and `target_max_words` from the brief object (already fetched in the function) and inject into the prompt string for outline and full_script steps only. No changes to retrieval, evidence_table, analysis_memo, or verification.

### Files Changed
- New migration SQL (3 columns)
- `src/lib/api.ts` — interface + constants
- `src/pages/TopicBriefs.tsx` — dropdown + display
- `supabase/functions/generate-step/index.ts` — dynamic length in outline + full_script prompts


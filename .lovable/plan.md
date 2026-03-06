

## View Brief Inputs After Submission + Optional Competitor Scripts

### Problem
Once a topic brief is created, there is no way to review its full inputs (thesis, focus areas, characters, tone, competitor scripts, etc.) — only the title and description appear in the pipeline sidebar. The competitor scripts are already technically optional but the UI shows all 5 boxes unconditionally.

### Plan

#### 1. Add a "Brief Details" panel in the Pipeline View

Add a new collapsible/expandable section (or a dedicated sidebar tab) in `src/pages/PipelineView.tsx` that displays all stored brief fields in a read-only format:

- Title, Description, Thesis, Proof Goal
- Focus Areas, Characters, Emotional Angle, Tone
- Priority Sources, Target Length, Comparison Mode
- Competitor Scripts (only show the ones that have content)

This will be accessible via a button/icon in the pipeline sidebar (e.g. "View Brief" or an info icon) that opens a sheet/drawer or inline panel showing all fields.

#### 2. Make Competitor Scripts section collapsible in the form

In `src/pages/TopicBriefs.tsx`, wrap the Competitor Scripts section in a `Collapsible` component so the 5 text boxes are hidden by default and only expand when clicked. This makes them clearly optional and reduces form clutter.

#### 3. Show brief details on brief cards in the list

On the brief list cards, add subtle indicators for filled optional fields (e.g. small badges or counts) so users can see at a glance what was filled in.

### Files Changed
- `src/pages/PipelineView.tsx` — add brief details panel/drawer with all fields displayed read-only
- `src/pages/TopicBriefs.tsx` — wrap competitor scripts in a collapsible section
- No database changes needed


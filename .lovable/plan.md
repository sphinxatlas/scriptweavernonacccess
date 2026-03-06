

## Duplicate Topic Brief

### What
Add a "Duplicate" button on each brief card in the list. Clicking it pre-fills the creation form with all inputs from the selected brief (title prepended with "Copy of "), opens the form, and lets the user edit before submitting. No pipeline is run.

### Changes

**`src/pages/TopicBriefs.tsx`**
- Add a `Copy` icon button next to the delete button on each brief card (visible on hover, like delete)
- On click, call a `handleDuplicate(brief)` function that:
  - Sets `form` state to all the brief's fields (title → `"Copy of {title}"`, plus description, thesis, focus_areas, characters, proof_goal, priority_sources, emotional_angle, tone, comparison_mode, target_minutes, target_min_words, target_max_words, competitor_script_1–5)
  - Sets `showForm(true)` and scrolls to top
- Import the `Copy` icon from lucide-react

No database or API changes needed — reuses the existing create form and `createTopicBrief` function.


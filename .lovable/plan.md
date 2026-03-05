## Completed: Rename Competitor Analysis to Commentary Transcripts (Secondary)

Reclassified `competitor_analysis` from "guidance only" to a new **Tier 3 Secondary Commentary Context** layer with a 4-tier source hierarchy.

### What Changed
- **Source Library UI**: Card renamed to "🎙️ Commentary Transcripts (Secondary)" with badge "Secondary Commentary — Not Canon"
- **4-Tier Hierarchy**: Tier 1 (Books + Movies), Tier 2 (Lexicon), Tier 3 (Commentary Transcripts), Tier 4 (Script Instructions)
- **Retrieval**: Commentary transcripts now searched (limited, 5 queries × 5 results) and labeled as "Commentary (Secondary, needs canon confirmation)"
- **Evidence Table**: Added `Commentary Angle` field for angles inspired by commentary
- **Generation**: Commentary context header updated with strict rules (no wording reuse, canon confirmation required)
- **No DB migration**: `competitor_analysis` enum kept as-is

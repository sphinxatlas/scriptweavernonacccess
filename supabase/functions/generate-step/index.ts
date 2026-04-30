import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCE_HIERARCHY_INSTRUCTION = `
IMPORTANT SOURCE HIERARCHY RULES:

TIER 1 — PRIMARY CANON EVIDENCE:
- Books = PRIMARY source (highest priority)
- Movie Transcripts = PRIMARY source (highest priority)
- Used for factual claims about story events, characterization, and exact quotes
- Used for book vs film comparisons
- ONLY these can be treated as primary evidence

TIER 2 — SECONDARY CANON SUPPORT:
- Lexicon = SECONDARY reference only (lower priority)
- Never overrides books or movie transcripts

TIER 3 — SECONDARY COMMENTARY CONTEXT:
- Commentary Transcripts (from YouTube commentary videos)
- Allowed: angle discovery, framing ideas, alternative interpretations, lists of differences to investigate, thematic lenses, psychological readings, terminology that helps explain concepts
- NOT allowed: never cite as proof of canon, never treat claims as true unless confirmed in books or movie transcripts, never use as direct script wording, never copy structure too closely, never quote verbatim into the final script
- RULE: If a point originates from Commentary Transcripts, the system MUST confirm it using books or movie transcripts before presenting it as a factual claim
- Mark internally as: "Angle inspired by commentary transcript — requires canon confirmation"

TIER 4 — WRITING GUIDANCE ONLY (never evidence, never canon):
- Script Instructions & Strategy = output behavior, writing constraints, hook quality, pacing, rehooks, argument structure, retention
- Used only for tone, structure, hook, pacing, writing behavior
- Never used as canon evidence

CRITICAL RULES:
- Commentary Transcripts must NEVER be cited as canon evidence or used to prove Harry Potter facts
- No competitor wording reuse — do NOT copy commentary transcript wording, structure, or phrasing
- Script Instructions must NEVER be cited as canon evidence
- They are layers that improve HOW the script is written, not WHAT it claims

The Lexicon is a secondary reference source only. Use it to support context, chronology, orientation, and discovery. Do not treat it as equal to the Harry Potter books or movie transcripts. Prioritize books and movie transcripts for canon claims, exact quotes, and core comparisons. Never present Lexicon wording as if it were direct text from the novels or films.

QUOTE DISCIPLINE (CRITICAL):
- "exact quote" = verbatim text from the source, in quotation marks, with source cited
- "paraphrase" = reworded version of what the source says, labeled as paraphrase
- "summary" = condensed account of a passage or scene
- "interpretation" = analytical statement based on evidence
- NEVER present a paraphrase as an exact quote
- ALWAYS label which type each piece of evidence is

When citing evidence:
- Clearly label whether evidence comes from a book, movie transcript, or Lexicon
- If Lexicon is used, label it as "secondary support"
- Never present Lexicon text as primary canon
- Never use Lexicon as a substitute for direct quotes from books or films
- If a major claim relies mainly on Lexicon, flag it as needing primary confirmation
`;

const COMPARISON_MODE_INSTRUCTION = `
COMPARISON MODE ACTIVE:
This is a Book vs Movie Comparison analysis. You MUST:
- Retrieve and present evidence in PAIRED format: book version vs movie version
- For each major point, show what the book says AND what the movie shows
- Highlight differences, omissions, additions, and changes in emphasis
- Analyze WHY differences exist (time constraints, visual storytelling, tone shifts)
- Structure the comparison thematically, not just chronologically
- Use Lexicon only to provide context about when/why changes were made
`;

const STEP_PROMPTS: Record<string, string> = {
  competitor_format_analysis: `You are a YouTube format analyst. Given competitor scripts pasted by the creator, analyze their STRUCTURE and FORMAT ONLY.

STRICT RULES:
- Competitor scripts must NEVER be used as factual sources and must NEVER be quoted.
- Do NOT reuse any unique lines, jokes, names, examples, or arguments from competitor scripts.
- Use competitor scripts ONLY to learn structure, pacing, hook shape, and section order.
- All content in the final video must come only from primary sources (books and movie transcripts) plus secondary references where allowed.

Analyze the competitor scripts and produce this EXACT output format:

## Competitor Format Summary
[Brief overview of what these scripts have in common structurally]

## Hook Patterns That Win
[List the hook structures used — e.g., question-based, bold claim, myth-busting, emotional setup]

## Intro Patterns That Win
[How do they transition from hook to body? What do the first 30-60 seconds accomplish?]

## Section Structure Blueprint
[How are the scripts divided? How many sections? What's the typical flow?]

## Rehooks and Pacing Devices
[Mid-video retention techniques — pattern interrupts, mini-hooks, cliffhangers, tonal shifts]

## CTA and Closing Structure
[How do they end? What call-to-action patterns work?]

## Language Tone Notes
[Conversational vs formal? First-person? Rhetorical questions? Humor style?]

## What to Avoid Copying
[Specific patterns or phrases that feel derivative or overused across competitors]

## Abstracted Structure Template for Our Video
[A clean, abstracted template we can follow without copying any specific content]`,

  retrieval: `You are a retrieval layer for a source-grounded Harry Potter research engine.
Use ONLY the uploaded and indexed source files provided below.
Use the provided retrieval query pack (compact derived queries), not full brief prose, as search intent.
Search across the full uploaded primary corpus by default: all books, all movie transcripts.
Use Lexicon only as secondary support.
Do NOT use general Harry Potter knowledge.
Do NOT invent examples.
Do NOT fabricate retrieval output.
If no indexed matches are found, return a failure report instead of placeholder evidence.

${SOURCE_HIERARCHY_INSTRUCTION}

If source material IS provided below, format the report as:
## Retrieval Summary
- Total sources found
- Breakdown by type (Books, Transcripts, Lexicon)
- Both books AND movie transcripts are ALWAYS searched for every brief

## Book Evidence (PRIMARY)
For each relevant passage:
- **Source**: [filename]
- **Evidence Type**: exact quote / paraphrase / summary
- **Content**: [the passage]
- **Relevance**: [why this matters to the topic]

## Movie Evidence (PRIMARY)
[Same format — movie transcripts are always searched, not just in comparison mode]

## Possible Contrast Pairs
Where book and movie evidence address similar scenes or themes, present them as contrast pairs:
- **Book**: [source + content]
- **Movie**: [source + content]
- **Contrast Note**: [what differs]

## Lexicon Support (SECONDARY)
[Same format, clearly marked as secondary]

## Commentary Angles (Secondary — Needs Canon Confirmation)
For each relevant commentary passage:
- **Source**: [filename]
- **Content**: [the passage]
- **Potential Angle**: [what angle or framing this suggests]
- **Canon Confirmation Needed**: [what must be verified against books/movie transcripts]
Note: These are from YouTube commentary transcripts. They may inspire angles but are NOT canon evidence. All factual claims must be confirmed against Tier 1 sources.

## Retrieval Gaps
- What evidence is missing?
- What should be searched for manually?
- Which claims lack primary source support?

If NO source material is provided below, return ONLY:
## Retrieval Failure Report
- **Status**: No indexed matches found for the derived query pack
- **Source types searched**: [list]
- **Filters applied**: [list]
- **Primary query**: [primary compact query]
- **Compact queries used**: [list]
- **Likely reason**: [assessment of why no matches were found]
Do NOT generate placeholder evidence. Do NOT proceed based on general knowledge.`,

  evidence_table: `You are a research assistant curating the strongest evidence for a YouTube script about Harry Potter.
Given the topic brief, retrieval results, and source material excerpts, create a CURATED EVIDENCE TABLE.

${SOURCE_HIERARCHY_INSTRUCTION}

EVIDENCE QUALITY RULES (CRITICAL):
1. QUALITY OVER QUANTITY: Select the 10-15 STRONGEST evidence points. Do NOT pad with weak or tangential evidence.
2. PREFER COMPARISON POINTS: Where possible, each evidence point should include BOTH book evidence AND movie evidence with a clear contrast. Do not make the table mostly book-only unless no movie counterpart exists.
3. STRONGEST FIRST: Rank evidence points by: (a) relevance to the thesis, (b) clarity of the quote, (c) usefulness for a YouTube argument, (d) strength of contrast between book and movie.
4. DEPRIORITIZE WEAK EVIDENCE: Exclude points that are only loosely related to the target trait. If the brief is about anger, do not include mild discomfort or general stress unless it is highly revealing. Match the claim intensity to what the source actually says.
5. CLAIM DISCIPLINE: The claim must precisely match the evidence. Do not overstate grief as anger, discomfort as volatility, or tension as defiance unless the source strongly supports that wording.
6. LEXICON STRICTNESS: Only include Lexicon support if it adds genuinely useful context. Do not include weak Lexicon entries just to fill a field.
7. The table should feel like a curated shortlist of the best arguments for the video, not a broad evidence dump.

PARAPHRASE-FIRST DISCIPLINE (CRITICAL):
- Default to PARAPHRASED evidence in every row. Paraphrase is the standard output.
- Exact quotes are OPTIONAL and must be under 12 words each. Only include a micro-quote when the exact wording is essential to the argument.
- Do NOT paste long excerpts or multi-sentence quotes. If the source passage is longer than 12 words, paraphrase it.
- Every evidence point MUST cite its source file name.
- No long excerpts anywhere in the table.

Create the evidence table in this EXACT markdown format for each evidence point:

### Evidence Point [number]
| Field | Value |
|-------|-------|
| **Claim** | [The precise claim — must match what the evidence actually shows] |
| **Source Type** | Book / Movie Transcript / Both |
| **Source File** | [Exact filename(s)] |
| **Book Evidence** | [Paraphrased evidence from book, if any — leave blank if none] |
| **Movie Evidence** | [Paraphrased evidence from movie transcript, if any — leave blank if none] |
| **Contrast** | [What differs between book and movie, if both present] |
| **Lexicon Support** | [Only if genuinely useful — mark as SECONDARY] |
| **Micro-Quote** | [Optional: verbatim quote UNDER 12 words, in quotation marks — leave blank if not essential] |
| **Paraphrase** | [Paraphrased version of the evidence — REQUIRED for every point] |
| **Why This Matters** | [Why this is a strong argument point for the video] |
| **Confidence** | High / Medium / Low |
| **Evidence Type** | paraphrase / exact quote (under 12 words) / summary / interpretation |
| **Commentary Angle** | [If inspired by commentary transcript — needs canon confirmation] |

Rules:
- Aim for 10-15 evidence points, curated for strength and relevance
- Majority should include both book AND movie evidence where possible
- Every evidence point must have a source trace (which file it came from)
- Never invent quotes
- Never blur exact quote vs paraphrase
- Paraphrase is the DEFAULT — exact quotes are the exception, not the rule
- If Lexicon is the only source, set Confidence to Low and note it needs primary confirmation
- If a point is only weakly related to the thesis, exclude it entirely
- Commentary Transcripts CANNOT be used as primary evidence — only as angle inspiration
- If an angle was inspired by a commentary transcript, it must be confirmed against books or movie transcripts before inclusion`,

  analysis_memo: `You are a script analysis expert for Harry Potter YouTube content.
Given the topic brief, evidence table, and source material, write an ANALYSIS MEMO.

${SOURCE_HIERARCHY_INSTRUCTION}

The memo should:
- Synthesize the evidence into key themes and arguments
- Identify patterns, contradictions, and interesting angles
- Suggest the strongest narrative thread for a YouTube script
- Note any gaps in evidence that need addressing
- Clearly distinguish between claims grounded in primary sources vs secondary Lexicon support
- For each major claim, note the evidence type (exact quote, paraphrase, summary, interpretation)
- Flag any claims that rely solely on Lexicon as "needs primary confirmation"
- Be 800-1500 words

QUOTE RESTRICTION (CRITICAL):
- You may DISCUSS and REFERENCE quotes conceptually (e.g. "Dumbledore's line about choices captures...")
- You must NOT paste long excerpts or multi-sentence quotes into the memo
- Keep the memo analytical and argument-focused, not excerpt-heavy
- If you reference a specific quote, keep it under 12 words or paraphrase it`,

  outline: `You are a YouTube script outline specialist for Harry Potter content.
Given the topic brief, evidence, and analysis memo, create a detailed SCRIPT OUTLINE.

${SOURCE_HIERARCHY_INSTRUCTION}

Format:
## Hook (0:00-0:30)
## Introduction (0:30-2:00)
## Section 1: [Title]
  - Key points
  - Evidence to cite (note source type: Book/Transcript/Lexicon)
  - Evidence type: exact quote / paraphrase / summary
  - Source file reference
  - Word budget: [X words]
  - Transition
## Section 2: [Title]
...
## Conclusion
## Call to Action

Include timing estimates and specific evidence citations for each section.
Mark any Lexicon-derived points as secondary support.
For each piece of evidence, note whether it's an exact quote, paraphrase, or summary.

EDITOR TAGS (MANDATORY):
Every claim or scene reference in the outline MUST include an editor tag in brackets on its own line.
Editor tags are metadata only — they are NOT spoken text and NOT part of the voiceover.
Editor tags must NOT contain exact quotes.

Tag formats:
- [BOOK: filename | chapter if available]
- [FILM: filename | timestamp hh:mm:ss to hh:mm:ss]
- [LEXICON: filename | summary of what it supports]

Example:
- Key point: Harry's anger erupts when he feels ignored by Dumbledore
  [BOOK: book5_order_of_phoenix.txt | Chapter 37]
  [FILM: movie5_transcript.txt | 01:42:00 to 01:44:30]

IMPORTANT — WORD BUDGET INSTRUCTIONS (injected dynamically per brief):
{{OUTLINE_LENGTH_INSTRUCTION}}`,

  full_script: `You are a professional YouTube scriptwriter specializing in Harry Potter analysis content.
Given the topic brief, evidence, analysis, and outline, write a FULL SCRIPT.

${SOURCE_HIERARCHY_INSTRUCTION}

SCRIPT INSTRUCTIONS PRIORITY (CRITICAL):
- The Script Writing Instructions document (injected below as "SCRIPT INSTRUCTIONS & STRATEGY") is the HIGHEST PRIORITY writing guidance for this step.
- If Script Instructions conflict with any other guidance source (Anti AI Guide, Strategy, etc.), Script Instructions WIN.
- Apply Script Instructions rules for structure, pacing, hooks, rehooks, retention, and tone FIRST, then layer other guidance on top.

Requirements:
- The body text must be PURELY NATURAL SPOKEN WORDS as if read aloud by a creator — conversational, authoritative, human
- Build the script primarily from books and movie transcripts
- Allow Lexicon only as background support for your understanding — it must NEVER be mentioned in the spoken narration
- Do not include Lexicon-derived wording as if it were canon dialogue or narration

LEXICON MENTION BAN (CRITICAL):
- The spoken narration must NEVER mention "the Lexicon", "the Harry Potter Lexicon", or use phrasing like "The Lexicon notes…", "According to the Lexicon…", etc.
- Lexicon is background context only — it informs your understanding but is INVISIBLE in the voiceover text
- If Lexicon supports a point, the ONLY allowed reference is as an editor metadata tag on its own line: [LEXICON: filename | context]
- No other Lexicon callouts, citations, or attribution language may appear in the script body

QUOTE DISCIPLINE (CRITICAL):
- Max 0-2 short quotes per 1,000 words of script. Each quote must be under 12 words.
- Everything else MUST be paraphrased as natural spoken narration.
- Do NOT read sources aloud. The script must sound like a creator SPEAKING, informed by sources, not reciting them.

SOURCE SPECIFICITY IN NARRATION (CRITICAL):
- Every evidence-based paragraph MUST naturally mention WHERE the moment happens within the spoken narration itself.
- Always specify the installment: which book (by title or number) or which film (by title or number).
- NEVER use vague phrasing like "during a key moment", "in the story", "at one point" without specifying the installment.
- Vary phrasing naturally so it does not sound repetitive. Examples of varied phrasing:
  - "In Order of the Phoenix, Harry's frustration boils over when..."
  - "The fifth film captures this perfectly — Dumbledore barely looks at him..."
  - "By the time we reach Goblet of Fire, the pattern is unmistakable..."
  - "Rowling shows this most clearly in Half-Blood Prince, where..."
  - "There's a moment in the third movie that changes everything..."

FORBIDDEN IN OUTPUT:
- No [SOURCE: ...] lines anywhere
- No VISUAL NOTES: blocks
- No SOURCE SECONDARY blocks
- No [CLAIM], [B-ROLL], [CUT TO], [GRAPHIC] or any other production annotations
- No long pasted quotes or multi-sentence excerpts

EDITOR TAGS (MANDATORY):
- After EACH evidence-based paragraph, include an editor tag on its own line
- Editor tags are metadata only — NOT spoken, NOT part of the voiceover
- Editor tags must NOT contain exact quotes
- Tag formats:
  [BOOK: filename | chapter if available]
  [FILM: filename | timestamp hh:mm:ss to hh:mm:ss]
  [LEXICON: filename | summary of what it supports]

SO-WHAT RULE:
- After every evidence-based beat, include a short takeaway or opinion ("so what") — the creator's interpretation, not just a fact dump

OUTPUT STRUCTURE:
Each section should look like this:

## Section Title

In Order of the Phoenix, Harry's anger erupts not at Voldemort but at Dumbledore — the one person he trusted most. That tells us everything about where Harry is emotionally at this point.

[BOOK: book5_order_of_phoenix.txt | Chapter 37]

The fifth film leans into this even harder. Watch the way Harry physically pulls away during the office scene — it's not just dialogue, it's body language.

[FILM: movie5_transcript.txt | 01:42:00 to 01:44:30]

- Include natural transitions between sections
- Start with a compelling hook
- End with a strong call to action
- The script must be CLEAN: headings + short VO paragraphs + editor tags only
- Every evidence paragraph must name its installment in the spoken text

IMPORTANT — WORD COUNT INSTRUCTIONS (injected dynamically per brief):
{{FULL_SCRIPT_LENGTH_INSTRUCTION}}`,

  verification: `You are a fact-checker and script verifier for Harry Potter YouTube content.
Given the full script and source material, create a VERIFICATION REPORT.

${SOURCE_HIERARCHY_INSTRUCTION}

For each claim or quote in the script:
1. ✅ VERIFIED (Exact Quote) - Verbatim text found in primary source (cite specific book or transcript, page/chapter if possible)
2. ✅ VERIFIED (Paraphrase) - Meaning confirmed in primary source, wording differs (cite source, note differences)
3. ⚠️ PARAPHRASED - Based on primary source but significantly reworded (cite source, flag for review)
4. 📚 LEXICON SUPPORTED - Supported by Lexicon only (flag as secondary, note if primary confirmation needed)
5. ❌ UNVERIFIED - Cannot find in provided source material
6. 📝 INTERPRETATION - Analytical statement (not verifiable, but assess reasonableness)

For each entry include:
- The claim text
- Source file it came from
- Evidence type classification
- Confidence level

Additional checks:
- If a claim relies mainly on Lexicon, flag it as "secondary support only — needs primary confirmation"
- Do not mark a claim as fully verified if it depends only on Lexicon
- Note any factual errors
- Inconsistencies within the script
- Suggestions for stronger evidence
- Overall accuracy score (percentage of verified claims from primary sources)
- Quote discipline score (percentage of quotes correctly labeled as exact vs paraphrase)`,
};

STEP_PROMPTS["creative_brief"] = `You are a creative director for a Harry Potter YouTube channel.

Your job: take the video title, angle note, format reference transcript(s), and any brief-specific HP topic transcripts provided, and generate a structured Creative Brief that will guide every subsequent step of the script pipeline.

HOST PERSONA (write the brief with this voice and worldview in mind):
{{HOST_PERSONA}}

FORMAT REFERENCE RULES:
- Analyze format reference transcript(s) for argumentative DNA ONLY
- Extract: hook shape, argument structure, emotional arc, stacking technique, fairness move, closing reframe
- NEVER use format references for HP content, facts, or information of any kind
- Format references are from completely different topics — structural templates only

HP TOPIC TRANSCRIPT RULES:
- These are HP videos covering similar topics to this video
- Use to understand: what angles exist, what claims have been made, what canon moments are relevant
- Identify specific scenes or moments to verify against primary canon (books and movie transcripts)
- Do NOT treat as proof of canon facts

Generate the Creative Brief in this EXACT format:

## Creative Brief: [Video Title]

### Core Thesis
[One sharp sentence stating the video's central argument. A claim, not a question.]

### Proof Goal
[What must be demonstrated by the end for the thesis to land. 1-2 sentences.]

### Video Type
[One of: Comparison / Movie-Focus / Book-Focus / Character Study / Plot Hole Dive / Grievance Analysis]

### Emotional Arc
[The emotional journey the viewer goes on. Extracted from format reference structure.]

### Argument Structure
[Beat-by-beat structure extracted from the format reference. Label each beat clearly.]

### Hook Shape
[Exact hook structure to use, derived from format reference.]

### Tone Temperature
[How the host should feel in this video. Calibrated to the host persona.]

### Canon Weight
[Which sources to lean on and why, based on the video type and thesis.]

### Fairness Move
[Where in the argument to acknowledge the counterargument or concede something. Critical for credibility.]

### Key Claims to Investigate
[5-8 specific claims, scenes, or moments from the angle note and topic transcripts that MUST be verified against primary canon. These become retrieval targets.]

### What To Avoid
[Specific angles or framings to avoid — drawn from what already exists in the topic transcripts.]

### Stacking Technique
[How individual argument points should accumulate into a verdict. Derived from format reference.]
`;

STEP_PROMPTS["six_category_extraction"] = `You are a research analyst for a Harry Potter YouTube channel.

Given the Creative Brief and retrieved canon material, mine the evidence across six specific categories. This output feeds the evidence table and outline. Be sharp, specific, and argument-useful. Rank everything by: how surprising it is, how specific it is, how argument-useful it is. Generic observations rank last.

IMPORTANT SOURCE RULES:
- Only draw confirmed factual claims from primary canon: books and movie transcripts
- HP topic transcripts and knowledge base sources can point you toward what to investigate but every claim must be confirmed in primary canon
- Do NOT invent or fabricate evidence
- If canon material does not support a claim, say so explicitly

HOST PERSONA:
{{HOST_PERSONA}}

Produce output in this EXACT format:

## Six-Category Extraction

### 1. LITERAL RECORD
The strongest direct evidence confirmed in primary canon.
For each point:
- **Claim**: [Precise statement]
- **Source**: [Book or film title + location]
- **Evidence Type**: exact quote / paraphrase / summary
- **Content**: [The evidence — paraphrased unless quote is under 12 words and essential]
- **Argument Value**: [Why this matters to the thesis]

### 2. THE DELTA
Where the book version and film version of the same moment diverge.
For each delta:
- **Scene**: [What scene or moment]
- **Book Version**: [What the book does — source cited]
- **Film Version**: [What the film does — source cited]
- **What Changed**: [Specifically what was altered, removed, or added]
- **Effect on Argument**: [What this change does to characterization or the thesis]

### 3. THE PATTERN
Recurring behavior or adaptation choices across multiple books/films that prove the thesis is not a one-off.
For each pattern:
- **Pattern**: [The recurring behavior]
- **Instances**: [At least 3 specific examples with sources]
- **What It Proves**: [Why this pattern matters to the argument]

### 4. THE CONTRADICTION
Logic gaps, character inconsistencies, broken rules, or downstream problems.
For each contradiction:
- **Contradiction**: [What is inconsistent or broken]
- **Evidence**: [The specific moments — sources cited]
- **Why It Matters**: [What this reveals]

### 5. THE SUBTEXT
What scenes are doing beneath their surface function.
For each point:
- **Surface Moment**: [What literally happens]
- **Subtext**: [What it actually reveals]
- **Source**: [Cited]
- **Script Value**: [How this becomes a useful line of analysis]

### 6. THE ANGLE
The most counterintuitive or non-obvious reading of this evidence.
For each angle:
- **The Non-Obvious Reading**: [The surprising interpretation]
- **Evidence Basis**: [What canon supports this]
- **Why Most People Miss It**: [The common assumption and why it is incomplete]
- **Script Value**: [How this becomes an original line of thought]

## Evidence Gaps
- What claims from the brief or topic transcripts could NOT be confirmed in primary canon?
- What should the creator know is unverified?
`;

const STEP_ORDER = [
  "creative_brief",
  "six_category_extraction",
  "evidence_table",
  "analysis_memo",
  "outline",
  "full_script",
  "verification",
  "retrieval",
  "competitor_format_analysis",
];

type SearchSourceType = "book" | "transcript" | "lexicon" | "competitor_analysis";

type QueryPack = {
  primaryQuery: string;
  subqueries: string[];
  characterQueries: string[];
  themeQueries: string[];
  comparisonQueries: string[];
  transcriptQueries: string[];
  allQueries: string[];
  targetCharacter: string;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "for", "in", "on", "at", "with", "by", "from", "that", "this", "these", "those", "is", "are", "was", "were", "be", "been", "being", "as", "it", "its", "into", "about", "across", "would", "should", "could", "can", "will", "video", "argues", "show", "shows",
]);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const dedupeStrings = (values: string[], limit?: number) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const v = normalizeWhitespace(raw);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (limit && out.length >= limit) break;
  }

  return out;
};

const compressPhrase = (value: string, maxTerms = 8) => {
  const normalized = normalizeWhitespace(value)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .toLowerCase();

  const terms = normalized
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !STOP_WORDS.has(t));

  return dedupeStrings(terms, maxTerms).join(" ");
};

// Infer primary target character from brief fields
const inferTargetCharacter = (brief: any): string => {
  const characters = (brief.characters || []).map((v: string) => normalizeWhitespace(v)).filter(Boolean);
  if (characters.length > 0) return normalizeWhitespace(characters[0].split(",")[0]) || "Harry";
  
  // Try to detect from title
  const title = (brief.title || "").toLowerCase();
  const knownCharacters = ["harry", "hermione", "ron", "snape", "dumbledore", "voldemort", "draco", "neville", "luna", "sirius", "hagrid", "mcgonagall", "lupin", "ginny", "dobby", "fred", "george"];
  for (const name of knownCharacters) {
    if (title.includes(name)) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  // Try thesis
  const thesis = (brief.thesis || "").toLowerCase();
  for (const name of knownCharacters) {
    if (thesis.includes(name)) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return "Harry";
};

// Score how relevant a chunk is to the target character
const getCharacterRelevanceScore = (content: string, targetCharacter: string): { score: number; mentions: number; likelySpeaker: boolean } => {
  const lower = content.toLowerCase();
  const charLower = targetCharacter.toLowerCase();
  
  // Count character mentions
  const regex = new RegExp(`\\b${charLower}\\b`, 'gi');
  const mentions = (content.match(regex) || []).length;
  
  // Check if character is likely the speaker (screenplay patterns)
  const speakerPatterns = [
    new RegExp(`^${charLower}[:\\s]`, 'im'),           // "HARRY: ..."
    new RegExp(`\\n${charLower}[:\\s]`, 'im'),          // newline "HARRY: ..."  
    new RegExp(`^${charLower}$`, 'im'),                 // "HARRY" on its own line
    new RegExp(`\\b${charLower}\\s+(says?|said|shouts?|shouted|whispers?|whispered|yells?|yelled|screams?|screamed|mutters?|muttered|snaps?|snapped|cries?|cried|asks?|asked|replies?|replied|growls?|growled)\\b`, 'i'),
  ];
  const likelySpeaker = speakerPatterns.some(p => p.test(content));
  
  // Character relevance score
  let score = 0;
  if (mentions >= 3) score += 0.3;
  else if (mentions >= 1) score += 0.15;
  if (likelySpeaker) score += 0.25;
  
  // Penalty if content is dominated by another character and target is absent
  if (mentions === 0) score -= 0.1;
  
  return { score, mentions, likelySpeaker };
};

const deriveRetrievalQueryPack = (brief: any): QueryPack => {
  const title = normalizeWhitespace(brief.title || "");
  const thesis = normalizeWhitespace(brief.thesis || "");
  const proofGoal = normalizeWhitespace(brief.proof_goal || "");
  const focusAreas = (brief.focus_areas || []).map((v: string) => normalizeWhitespace(v)).filter(Boolean);
  const characters = (brief.characters || []).map((v: string) => normalizeWhitespace(v)).filter(Boolean);

  const targetCharacter = inferTargetCharacter(brief);

  // Primary query from title + optional thesis/proofGoal
  const coreFields = [title, thesis, proofGoal].filter(Boolean);
  const primaryQuery =
    compressPhrase(coreFields.join(" "), 10) ||
    compressPhrase(title, 8) ||
    "harry potter characterization";

  // Theme queries from focus areas (only if present)
  const themeQueries = focusAreas.length > 0
    ? dedupeStrings(focusAreas.map((area: string) => compressPhrase(area, 6)).filter(Boolean), 8)
    : [];

  // Character queries (only if characters provided)
  const characterQueries = characters.length > 0
    ? dedupeStrings(characters.map((c: string) => `${compressPhrase(c, 3)} characterization`).filter((q: string) => q.trim().length > 0), 8)
    : [];

  // Build seeded subqueries from available optional fields
  const seededParts: string[] = [];
  if (themeQueries.length > 0) {
    seededParts.push(...themeQueries.map((theme) => `${targetCharacter} ${theme}`));
    seededParts.push(...themeQueries);
  }
  if (characterQueries.length > 0) seededParts.push(...characterQueries);
  const compressedTitle = compressPhrase(title, 8);
  if (compressedTitle) seededParts.push(compressedTitle);
  if (thesis) { const ct = compressPhrase(thesis, 8); if (ct) seededParts.push(ct); }
  if (proofGoal) { const cp = compressPhrase(proofGoal, 8); if (cp) seededParts.push(cp); }

  const seededSubqueries = dedupeStrings(seededParts.filter(Boolean));

  // Transcript-specific queries — use SCREENPLAY LANGUAGE that actually appears in transcripts
  // Don't use meta-terms like "dialogue" or "confrontation scene" — use action words from scripts
  const transcriptQueries = dedupeStrings([
    // Character name alone — matches any chunk mentioning them
    targetCharacter,
    // Action/speech verbs that appear in screenplays
    `${targetCharacter} said`,
    `${targetCharacter} shouted`,
    `${targetCharacter} yelled`,
    `${targetCharacter} snapped`,
    `${targetCharacter} whispered`,
    `${targetCharacter} angry`,
    `${targetCharacter} furious`,
    `${targetCharacter} frustrated`,
    `${targetCharacter} screamed`,
    `${targetCharacter} replied`,
    `${targetCharacter} stared`,
    `${targetCharacter} laughed`,
    `${targetCharacter} sarcastically`,
    ...characters.slice(0, 3).map((c: string) => compressPhrase(c, 3)),
  ].filter(Boolean), 15);

  // Fallbacks
  const fallbackSubqueries = dedupeStrings([
    `${targetCharacter} characterization`,
    `${targetCharacter} sarcasm`,
    `${targetCharacter} anger`,
    `${targetCharacter} humor`,
    `${targetCharacter} agency`,
  ]);

  const subqueries = [...seededSubqueries];
  for (const fallback of fallbackSubqueries) {
    if (subqueries.length >= 5) break;
    if (!subqueries.some((q) => q.toLowerCase() === fallback.toLowerCase())) {
      subqueries.push(fallback);
    }
  }
  const trimmedSubqueries = subqueries.slice(0, 12);

  // Comparison queries
  let comparisonQueries: string[] = [];
  if (brief.comparison_mode) {
    comparisonQueries = dedupeStrings([
      ...themeQueries.slice(0, 6).map((theme) => `${theme} book vs movie`),
      ...characters.slice(0, 4).map((character: string) => `${compressPhrase(character, 3)} book vs movie characterization`),
      `${targetCharacter} personality adaptation changes`,
      `${targetCharacter} emotional intensity books and films`,
      `${targetCharacter} agency books and films`,
      `${targetCharacter} lines given to other characters`,
      `${targetCharacter} internal monologue lost in film`,
    ].filter(Boolean), 12);
  }

  const allQueries = dedupeStrings([primaryQuery, ...trimmedSubqueries, ...transcriptQueries, ...comparisonQueries], 30);

  return {
    primaryQuery,
    subqueries: trimmedSubqueries,
    characterQueries,
    themeQueries,
    comparisonQueries,
    transcriptQueries,
    allQueries,
    targetCharacter,
  };
};

const getChunkCountByType = async (supabase: any, sourceType: SearchSourceType) => {
  const { data: files } = await supabase
    .from("source_files")
    .select("id")
    .eq("file_type", sourceType);

  const fileIds = files?.map((f: any) => f.id) || [];
  if (fileIds.length === 0) return 0;

  const { count } = await supabase
    .from("file_chunks")
    .select("id", { count: "exact", head: true })
    .in("file_id", fileIds);

  return count ?? 0;
};

const getPriorityBoost = (fileName: string, prioritySources: string[]) => {
  if (!prioritySources.length) return 0;
  const lower = fileName.toLowerCase();
  const matched = prioritySources.some((source) => lower.includes(source.toLowerCase()));
  return matched ? 0.15 : 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { briefId, stepType, starredOnly } = await req.json();
    if (!briefId || !stepType) throw new Error("briefId and stepType are required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the topic brief
    const { data: brief, error: briefError } = await supabase
      .from("topic_briefs")
      .select("*")
      .eq("id", briefId)
      .single();
    if (briefError || !brief) throw new Error("Brief not found");

    // Special handling for competitor_format_analysis — uses pasted scripts only, no retrieval
    if (stepType === "competitor_format_analysis") {
      const scripts = [
        brief.competitor_script_1,
        brief.competitor_script_2,
        brief.competitor_script_3,
        brief.competitor_script_4,
        brief.competitor_script_5,
      ].filter(Boolean);

      if (scripts.length === 0) {
        throw new Error("No competitor scripts found in this topic brief. Paste at least one competitor script to use this step.");
      }

      const systemPrompt = STEP_PROMPTS["competitor_format_analysis"];
      const userMessage = `## Topic Brief\n**Title:** ${brief.title}\n**Description:** ${brief.description}\n\n## Competitor Scripts (${scripts.length} provided)\n\n${scripts.map((s: string, i: number) => `### Competitor Script ${i + 1}\n${s}`).join("\n\n---\n\n")}\n\nPlease analyze the format and structure of these competitor scripts.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Build compact retrieval query pack from brief fields (brief stays rich for generation)
    const queryPack = deriveRetrievalQueryPack(brief);
    const prioritySources = (brief.priority_sources || [])
      .map((s: string) => normalizeWhitespace(s))
      .filter(Boolean);

    // In comparison mode, use higher per-query limits for books & transcripts to ensure balance
    const isComparison = brief.comparison_mode || false;
    const bookPerQuery = isComparison ? 10 : 8;
    const transcriptPerQuery = isComparison ? 10 : 8;
    const lexiconPerQuery = isComparison ? 3 : 4;

    // For transcript retrieval, use transcript-specific queries IN ADDITION to main queries
    const bookQueries = queryPack.allQueries;
    const transcriptSearchQueries = dedupeStrings([...queryPack.allQueries, ...queryPack.transcriptQueries], 35);
    const lexiconQueries = queryPack.allQueries;

    const retrievalPlan: { query: string; sourceType: SearchSourceType; maxResults: number }[] = [
      ...bookQueries.map((query) => ({ query, sourceType: "book" as const, maxResults: bookPerQuery })),
      ...transcriptSearchQueries.map((query) => ({ query, sourceType: "transcript" as const, maxResults: transcriptPerQuery })),
      ...lexiconQueries.map((query) => ({ query, sourceType: "lexicon" as const, maxResults: lexiconPerQuery })),
      // Commentary Transcripts — searched for idea discovery only, limited results
      ...queryPack.allQueries.slice(0, 5).map((query) => ({ query, sourceType: "competitor_analysis" as const, maxResults: 5 })),
    ];

    const retrievalResponses = await Promise.all(
      retrievalPlan.map((plan) =>
        supabase.rpc("search_chunks_by_type", {
          search_query: plan.query,
          source_type: plan.sourceType,
          max_results: plan.maxResults,
        }),
      ),
    );

    const perQueryCounts: Record<string, { book: number; transcript: number; lexicon: number }> = {};
    const mergedByType: Record<SearchSourceType, Map<string, any>> = {
      book: new Map(),
      transcript: new Map(),
      lexicon: new Map(),
      competitor_analysis: new Map(),
    };

    const targetCharacter = queryPack.targetCharacter;

    retrievalPlan.forEach((plan, idx) => {
      const rows = retrievalResponses[idx].data || [];

      if (!perQueryCounts[plan.query]) {
        perQueryCounts[plan.query] = { book: 0, transcript: 0, lexicon: 0 };
      }
      perQueryCounts[plan.query][plan.sourceType] = rows.length;

      rows.forEach((row: any) => {
        const priorityBoost = getPriorityBoost(row.file_name || "", prioritySources);
        const primaryQueryBoost = plan.query === queryPack.primaryQuery ? 0.05 : 0;
        
        // Character relevance boost — especially important for transcripts
        const charRelevance = getCharacterRelevanceScore(row.content || "", targetCharacter);
        const charBoost = plan.sourceType === "transcript" ? charRelevance.score * 1.5 : charRelevance.score * 0.5;
        
        const score = (row.rank ?? 0) + priorityBoost + primaryQueryBoost + charBoost;

        const existing = mergedByType[plan.sourceType].get(row.id);
        if (!existing || score > existing._score) {
          mergedByType[plan.sourceType].set(row.id, {
            ...row,
            _score: score,
            _matched_query: plan.query,
            _char_mentions: charRelevance.mentions,
            _char_likely_speaker: charRelevance.likelySpeaker,
          });
        }
      });
    });

    // In comparison mode, enforce balanced limits; otherwise use standard limits
    const bookLimit = isComparison ? 20 : 20;
    const transcriptLimit = isComparison ? 20 : 20;
    const lexiconLimit = isComparison ? 5 : 10;

    const bookChunks = Array.from(mergedByType.book.values())
      .sort((a, b) => b._score - a._score)
      .slice(0, bookLimit);

    // For transcripts: filter out chunks where target character has zero mentions (unless very few results)
    const allTranscriptChunks = Array.from(mergedByType.transcript.values())
      .sort((a, b) => b._score - a._score);
    const relevantTranscripts = allTranscriptChunks.filter((c) => c._char_mentions > 0);
    const droppedTranscripts = allTranscriptChunks.length - relevantTranscripts.length;
    // Use relevant ones if we have enough, otherwise fall back to all
    const transcriptChunks = (relevantTranscripts.length >= 3 ? relevantTranscripts : allTranscriptChunks)
      .slice(0, transcriptLimit);

    const lexiconChunks = Array.from(mergedByType.lexicon.values())
      .sort((a, b) => b._score - a._score)
      .slice(0, lexiconLimit);

    // Commentary Transcripts — for idea discovery only, limited
    const commentaryChunks = Array.from(mergedByType.competitor_analysis.values())
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);

    // Get total indexed chunk counts for debug
    const [bookChunkCount, transcriptChunkCount, lexiconChunkCount] = await Promise.all([
      getChunkCountByType(supabase, "book"),
      getChunkCountByType(supabase, "transcript"),
      getChunkCountByType(supabase, "lexicon"),
    ]);

    const matchesPerQuery = queryPack.allQueries.map((query) => ({
      query,
      ...(perQueryCounts[query] || { book: 0, transcript: 0, lexicon: 0 }),
    }));

    // Debug block for retrieval diagnostics
    const transcriptMatchesPerQuery = [...new Set([...queryPack.allQueries, ...queryPack.transcriptQueries])].map((q) => ({
      query: q,
      transcript_matches: perQueryCounts[q]?.transcript ?? 0,
    })).filter((m) => m.transcript_matches > 0);

    const transcriptCharMentions = transcriptChunks.filter((c) => c._char_mentions > 0).length;
    const transcriptLikelySpeaker = transcriptChunks.filter((c) => c._char_likely_speaker).length;

    const debugInfo = {
      target_character: targetCharacter,
      derived_query_pack: {
        primary_query: queryPack.primaryQuery,
        subqueries: queryPack.subqueries,
        character_queries: queryPack.characterQueries,
        theme_queries: queryPack.themeQueries,
        transcript_queries: queryPack.transcriptQueries,
        comparison_queries: queryPack.comparisonQueries,
        comparison_expanded: queryPack.comparisonQueries.length > 0,
      },
      comparison_mode: isComparison,
      filters_applied: {
        source_types_searched: ["book", "transcript", "lexicon"],
        instructions_excluded_from_evidence: true,
        priority_sources_mode: "soft_boost_ranking_only",
        priority_sources_value: prioritySources,
        strict_source_filter: false,
      },
      indexed_chunks: {
        book: bookChunkCount,
        transcript: transcriptChunkCount,
        lexicon: lexiconChunkCount,
      },
      matches_returned: {
        book: bookChunks.length,
        transcript: transcriptChunks.length,
        lexicon: lexiconChunks.length,
      },
      transcript_debug: {
        transcript_specific_queries_used: queryPack.transcriptQueries,
        transcript_chunks_actually_searched: transcriptChunkCount > 0,
        transcript_matches_per_query: transcriptMatchesPerQuery,
        transcript_overwhelmed_by_books: transcriptChunks.length === 0 && bookChunks.length > 5,
        transcript_character_relevance: {
          target_character: targetCharacter,
          chunks_mentioning_character: transcriptCharMentions,
          chunks_character_likely_speaker: transcriptLikelySpeaker,
          chunks_dropped_for_low_relevance: droppedTranscripts,
          total_raw_transcript_matches: allTranscriptChunks.length,
        },
      },
      matches_per_query_and_source: matchesPerQuery,
    };
    console.log("RETRIEVAL DEBUG:", JSON.stringify(debugInfo, null, 2));

    // Get instruction & strategy file chunks (for writing behavior ONLY, never evidence)
    // Pulls both "instructions" and legacy "script_strategy" file types
    const { data: instructionFiles } = await supabase
      .from("source_files")
      .select("id")
      .in("file_type", ["instructions", "script_strategy"]);

    let instructionChunks: any[] = [];
    if (instructionFiles && instructionFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", instructionFiles.map(f => f.id))
        .order("chunk_index")
        .limit(20);
      instructionChunks = data || [];
    }

    // Get Anti AI Language Guide chunks (writing guidance — injected into outline + full_script)
    const { data: antiAiFiles } = await supabase
      .from("source_files")
      .select("id")
      .eq("file_type", "anti_ai_guide");

    let antiAiChunks: any[] = [];
    if (antiAiFiles && antiAiFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", antiAiFiles.map(f => f.id))
        .order("chunk_index")
        .limit(20);
      antiAiChunks = data || [];
    }

    // Get Commentary Transcript chunks (secondary commentary — angle discovery, never evidence)
    const { data: competitorFiles } = await supabase
      .from("source_files")
      .select("id")
      .eq("file_type", "competitor_analysis");

    let competitorChunks: any[] = [];
    if (competitorFiles && competitorFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", competitorFiles.map(f => f.id))
        .order("chunk_index")
        .limit(15);
      competitorChunks = data || [];
    }

    // Get starred evidence points if starredOnly mode
    let starredEvidence = "";
    if (starredOnly && (stepType === "outline" || stepType === "full_script")) {
      const { data: starred } = await supabase
        .from("evidence_points")
        .select("*")
        .eq("brief_id", briefId)
        .eq("starred", true);
      if (starred && starred.length > 0) {
        starredEvidence = "\n## ⭐ APPROVED/STARRED EVIDENCE (Use these preferentially)\n" +
          starred.map((e: any, i: number) =>
            `### Starred Evidence ${i + 1}\n- **Claim**: ${e.claim}\n- **Source**: ${e.source_type} — ${e.source_file || 'unknown'}\n- **Evidence Type**: ${e.evidence_type}\n- **Quote**: ${e.exact_quote || 'N/A'}\n- **Paraphrase**: ${e.paraphrase || 'N/A'}\n- **Confidence**: ${e.confidence}`
          ).join("\n\n");
      }
    }

    // Get previous pipeline outputs for this brief
    const stepIndex = STEP_ORDER.indexOf(stepType);
    const previousSteps = STEP_ORDER.slice(0, stepIndex);
    const { data: previousOutputs } = await supabase
      .from("pipeline_outputs")
      .select("step_type, content")
      .eq("brief_id", briefId)
      .in("step_type", previousSteps)
      .order("created_at");

    // Build context grouped by source type — NEVER include instructions as evidence
    const totalMatches = bookChunks.length + transcriptChunks.length + lexiconChunks.length;
    let sourceContext: string;

    if (totalMatches === 0) {
      // STRICT: No fallback to general knowledge
      sourceContext = `## RETRIEVAL FAILURE — NO INDEXED MATCHES FOUND FOR DERIVED QUERY PACK
- **Status**: No indexed matches found for the derived query pack
- **Source types searched**: book, transcript, lexicon
- **Filters applied**: file_type scoped search; priority_sources soft boost in ranking only (never a hard filter)
- **Primary query**: ${queryPack.primaryQuery}
- **Compact queries used**:
${queryPack.allQueries.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}
- **Likely reason**: ${debugInfo.indexed_chunks.book === 0 && debugInfo.indexed_chunks.transcript === 0 ? "No primary source files have been uploaded and processed yet." : "Derived queries did not match indexed chunk text. Try clearer trait/action keywords in title, thesis, focus areas, characters, or proof goal."}

DO NOT use general Harry Potter knowledge. DO NOT generate placeholder evidence. Return a retrieval failure report ONLY.`;
    } else {
      const sections: string[] = [];
      // Add debug summary at top
      sections.push(`## Retrieval Debug Summary
- Primary query: ${queryPack.primaryQuery}
- Subqueries (${queryPack.subqueries.length}): ${queryPack.subqueries.length ? queryPack.subqueries.join(" | ") : "none"}
- Character queries (${queryPack.characterQueries.length}): ${queryPack.characterQueries.length ? queryPack.characterQueries.join(" | ") : "none"}
- Theme queries (${queryPack.themeQueries.length}): ${queryPack.themeQueries.length ? queryPack.themeQueries.join(" | ") : "none"}
- Transcript-specific queries (${queryPack.transcriptQueries.length}): ${queryPack.transcriptQueries.length ? queryPack.transcriptQueries.join(" | ") : "none"}
- Comparison query expansion: ${queryPack.comparisonQueries.length > 0 ? "ON" : "OFF"}
- Comparison mode: ${isComparison ? "ON" : "OFF"}
- Book matches: ${bookChunks.length}
- Transcript matches: ${transcriptChunks.length}
- Lexicon matches: ${lexiconChunks.length}
- Priority sources mode: soft boost ranking only
- Transcript chunks indexed: ${transcriptChunkCount}
- Transcript overwhelmed by books: ${transcriptChunks.length === 0 && bookChunks.length > 5 ? "YES — WARNING" : "No"}`);

      sections.push("### Query-Level Match Counts\n" + matchesPerQuery.map((m) => `- ${m.query} → book=${m.book}, transcript=${m.transcript}, lexicon=${m.lexicon}`).join("\n"));

      // Transcript-specific debug
      sections.push(`### Transcript Retrieval Debug
- Target character: ${targetCharacter}
- Transcript-specific queries used: ${queryPack.transcriptQueries.length}
- Transcript chunks in index: ${transcriptChunkCount}
- Transcript matches returned: ${transcriptChunks.length}
- Transcript chunks mentioning ${targetCharacter}: ${transcriptCharMentions}
- Transcript chunks where ${targetCharacter} is likely speaker: ${transcriptLikelySpeaker}
- Transcript chunks dropped for low relevance: ${droppedTranscripts}
- Total raw transcript matches before filtering: ${allTranscriptChunks.length}
- Transcript query hit rate: ${queryPack.transcriptQueries.filter((q) => (perQueryCounts[q]?.transcript ?? 0) > 0).length}/${queryPack.transcriptQueries.length}`);

      if (bookChunks.length > 0) {
        sections.push("### PRIMARY SOURCES — Books (Book Evidence)\n" +
          bookChunks.map((c: any) => `[${c.file_name} — BOOK — PRIMARY | matched: "${c._matched_query}" | ${targetCharacter} mentions: ${c._char_mentions}]\n${c.content}`).join("\n\n---\n\n"));
      }
      if (transcriptChunks.length > 0) {
        sections.push("### PRIMARY SOURCES — Movie Transcripts (Movie Evidence)\n" +
          transcriptChunks.map((c: any) => `[${c.file_name} — TRANSCRIPT — PRIMARY | matched: "${c._matched_query}" | ${targetCharacter} mentions: ${c._char_mentions} | likely speaker: ${c._char_likely_speaker ? "YES" : "no"}]\n${c.content}`).join("\n\n---\n\n"));
      }

      // Possible Contrast Pairs (comparison mode or when both families have results)
      if (bookChunks.length > 0 && transcriptChunks.length > 0) {
        const contrastPairs: string[] = [];
        const usedTranscripts = new Set<string>();
        for (const book of bookChunks.slice(0, 8)) {
          // Find a transcript chunk matched on a similar query
          const candidate = transcriptChunks.find((t: any) =>
            !usedTranscripts.has(t.id) && (
              t._matched_query === book._matched_query ||
              t.file_name?.toLowerCase().includes(book.file_name?.toLowerCase().split(" ")[0]) ||
              false
            )
          );
          if (candidate) {
            usedTranscripts.add(candidate.id);
            contrastPairs.push(`**Book**: [${book.file_name}] ${book.content.slice(0, 200)}...\n**Movie**: [${candidate.file_name}] ${candidate.content.slice(0, 200)}...`);
          }
        }
        if (contrastPairs.length > 0) {
          sections.push("### Possible Contrast Pairs\n" + contrastPairs.join("\n\n---\n\n"));
        }
      }

      if (lexiconChunks.length > 0) {
        sections.push("### SECONDARY REFERENCE — Lexicon Support (use for context only, NOT as primary canon)\n" +
          lexiconChunks.map((c: any) => `[${c.file_name} — LEXICON — SECONDARY]\n${c.content}`).join("\n\n---\n\n"));
      }

      // Commentary Angles — secondary commentary context, NOT evidence
      if (commentaryChunks.length > 0) {
        sections.push("### COMMENTARY ANGLES (Secondary — Needs Canon Confirmation)\nThese are from YouTube commentary transcripts. They may inspire angles and framing but are NOT canon evidence. All factual claims MUST be confirmed against books or movie transcripts before use.\n" +
          commentaryChunks.map((c: any) => `[${c.file_name} — COMMENTARY — SECONDARY | Angle inspired by commentary transcript — requires canon confirmation]\n${c.content}`).join("\n\n---\n\n"));
      }

      // Retrieval gaps
      const gaps: string[] = [];
      if (bookChunks.length === 0) gaps.push("- No book evidence found");
      if (transcriptChunks.length === 0) gaps.push("- No movie transcript evidence found");
      if (isComparison && (bookChunks.length === 0 || transcriptChunks.length === 0)) {
        gaps.push("- Comparison mode is ON but one source family returned zero results");
      }
      if (gaps.length > 0) {
        sections.push("### Retrieval Gaps\n" + gaps.join("\n"));
      }

      sourceContext = sections.join("\n\n========\n\n");
    }

    const instructionContext = instructionChunks.length > 0
      ? instructionChunks.map(c => c.content).join("\n\n")
      : "";

    // Guidance layers — only included for generation steps (analysis_memo, outline, full_script), NOT for retrieval/evidence_table
    const isGenerationStep = ["analysis_memo", "outline", "full_script"].includes(stepType);
    const competitorContext = isGenerationStep && competitorChunks.length > 0
      ? competitorChunks.map(c => c.content).join("\n\n")
      : "";

    // Anti AI Language Guide — injected into outline (optional) and full_script (mandatory)
    const isScriptStep = ["outline", "full_script"].includes(stepType);
    const antiAiContext = isScriptStep && antiAiChunks.length > 0
      ? antiAiChunks.map(c => c.content).join("\n\n")
      : "";

    const previousContext = previousOutputs && previousOutputs.length > 0
      ? previousOutputs.map((o: any) => `### ${o.step_type.replace(/_/g, " ").toUpperCase()}\n${o.content}`).join("\n\n")
      : "";

    let systemPrompt = STEP_PROMPTS[stepType] || "You are a helpful writing assistant.";

    // Inject dynamic target length instructions for outline and full_script
    const targetMin = brief.target_min_words ?? 1400;
    const targetMax = brief.target_max_words ?? 1600;

    if (stepType === "outline") {
      systemPrompt = systemPrompt.replace(
        "{{OUTLINE_LENGTH_INSTRUCTION}}",
        `Include a word budget per section that sums to ${targetMin}–${targetMax} words total.\nInclude an estimated total word count line at the end of the outline.`
      );
    } else if (stepType === "full_script") {
      systemPrompt = systemPrompt.replace(
        "{{FULL_SCRIPT_LENGTH_INSTRUCTION}}",
        `Enforce total word count within ${targetMin} to ${targetMax} words.\nIf the draft falls outside this range, self-revise until it lands inside.\nInclude a final line: Word count: ~X (target: ${targetMin}–${targetMax})`
      );
    }

    // Inject Script Instructions into system prompt — HIGHEST PRIORITY for full_script
    if (isScriptStep && instructionContext) {
      const priority = stepType === "full_script"
        ? "HIGHEST PRIORITY WRITING GUIDANCE — this document overrides all other guidance sources for structure, pacing, hooks, and style"
        : "MANDATORY — apply these rules to shape writing quality, pacing, hooks, and retention";
      systemPrompt += `\n\nSCRIPT INSTRUCTIONS & STRATEGY (${priority}):\n${instructionContext}`;
    }

    // Inject Anti AI Language Guide enforcement into system prompt for script steps
    if (isScriptStep && antiAiContext) {
      systemPrompt += `\n\nANTI AI LANGUAGE GUIDE (MANDATORY — apply these rules strictly):\n- Avoid common AI phrases, templated intros, and AI word clusters described below\n- Avoid over-tidy signposting, repetitive triads, and generic CTAs\n- Do not use em dashes heavily\n- Keep wording natural and voiceover-friendly\n- The final script must sound human, original, and not trigger obvious AI detection signals\n\nAnti AI Language Guide content:\n${antiAiContext}`;
    }

    // Add comparison mode instruction if enabled
    if (brief.comparison_mode) {
      systemPrompt = COMPARISON_MODE_INSTRUCTION + "\n\n" + systemPrompt;
    }

    // Build expanded brief context
    let briefContext = `**Title:** ${brief.title}\n**Description:** ${brief.description}`;
    if (brief.thesis) briefContext += `\n**Thesis:** ${brief.thesis}`;
    if (brief.focus_areas?.length) briefContext += `\n**Focus Areas:** ${brief.focus_areas.join(", ")}`;
    if (brief.characters?.length) briefContext += `\n**Key Characters:** ${brief.characters.join(", ")}`;
    if (brief.proof_goal) briefContext += `\n**What This Video Should Prove:** ${brief.proof_goal}`;
    if (brief.priority_sources?.length) briefContext += `\n**Priority Sources (soft boost only, not a filter):** ${brief.priority_sources.join(", ")}`;
    if (brief.emotional_angle) briefContext += `\n**Emotional Angle:** ${brief.emotional_angle}`;
    if (brief.tone) briefContext += `\n**Tone:** ${brief.tone}`;
    if (brief.comparison_mode) briefContext += `\n**Mode:** Book vs Movie Comparison`;

    const queryPackContext = `**Primary Query:** ${queryPack.primaryQuery}
**Subqueries:** ${queryPack.subqueries.length ? queryPack.subqueries.join(" | ") : "none"}
**Character Queries:** ${queryPack.characterQueries.length ? queryPack.characterQueries.join(" | ") : "none"}
**Theme Queries:** ${queryPack.themeQueries.length ? queryPack.themeQueries.join(" | ") : "none"}
**Transcript-Specific Queries:** ${queryPack.transcriptQueries.length ? queryPack.transcriptQueries.join(" | ") : "none"}
**Comparison Query Expansion:** ${queryPack.comparisonQueries.length > 0 ? "enabled" : "disabled"}
**Comparison Queries:** ${queryPack.comparisonQueries.length ? queryPack.comparisonQueries.join(" | ") : "none"}`;

    // Build guidance layers section — priority order: 1) Script Instructions, 2) Anti AI Guide, 3) Script Strategy
    const guidanceSections: string[] = [];
    if (instructionContext) guidanceSections.push(`## Script Instructions & Strategy (GUIDANCE ONLY — not evidence, shapes writing quality/pacing/hooks/retention)\n${instructionContext}`);
    if (antiAiContext) guidanceSections.push(`## Anti AI Language Guide (WRITING GUIDANCE — avoid AI tells, keep output human and natural)\n${antiAiContext}`);
    if (competitorContext) guidanceSections.push(`## Commentary Transcripts (SECONDARY COMMENTARY — angles and framing only, all factual claims must be confirmed against books/movie transcripts. No competitor wording reuse. Angle inspired by commentary transcript — requires canon confirmation)\n${competitorContext}`);
    const guidanceBlock = guidanceSections.length > 0 ? guidanceSections.join("\n\n") + "\n\n" : "";

    const userMessage = `## Topic Brief
${briefContext}

## Retrieval Query Pack (Derived)
${queryPackContext}

${guidanceBlock}${previousContext ? `## Previous Pipeline Steps\n${previousContext}\n\n` : ""}${starredEvidence ? `${starredEvidence}\n\n` : ""}## Source Material Excerpts
${sourceContext}

Please generate the ${stepType.replace(/_/g, " ")} based on the above information.`;

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-step error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

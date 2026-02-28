import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCE_HIERARCHY_INSTRUCTION = `
IMPORTANT SOURCE HIERARCHY RULES:
- Books = PRIMARY source (highest priority)
- Movie Transcripts = PRIMARY source (highest priority)  
- Lexicon = SECONDARY reference only (lower priority)
- Script Instructions = behavior and style guidance only

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

  evidence_table: `You are a research assistant for YouTube script writing about Harry Potter.
Given the topic brief, retrieval results, and source material excerpts, create a STRUCTURED EVIDENCE TABLE.

${SOURCE_HIERARCHY_INSTRUCTION}

Create the evidence table in this EXACT markdown format for each evidence point:

### Evidence Point [number]
| Field | Value |
|-------|-------|
| **Claim** | [The claim or point being made] |
| **Source Type** | Book / Movie Transcript / Lexicon |
| **Source File** | [Exact filename] |
| **Book Evidence** | [Evidence from book, if any] |
| **Movie Evidence** | [Evidence from movie transcript, if any] |
| **Lexicon Support** | [Supporting context from Lexicon, if any — mark as SECONDARY] |
| **Exact Quote** | [Verbatim quote if available, in quotation marks] |
| **Paraphrase** | [If exact quote unavailable, paraphrased version — clearly labeled] |
| **Why This Matters** | [Why the difference or evidence is significant] |
| **Confidence** | High / Medium / Low |
| **Evidence Type** | exact quote / paraphrase / summary / interpretation |

Rules:
- Aim for 15-25 evidence points, majority from primary sources
- Every evidence point must have a source trace (which file it came from)
- Never invent quotes
- Never blur exact quote vs paraphrase
- If Lexicon is the only source, set Confidence to Low and note it needs primary confirmation`,

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
- Be 800-1500 words`,

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
  - Transition
## Section 2: [Title]
...
## Conclusion
## Call to Action

Include timing estimates and specific evidence citations for each section.
Mark any Lexicon-derived points as secondary support.
For each piece of evidence, note whether it's an exact quote, paraphrase, or summary.`,

  full_script: `You are a professional YouTube scriptwriter specializing in Harry Potter analysis content.
Given the topic brief, evidence, analysis, and outline, write a FULL SCRIPT.

${SOURCE_HIERARCHY_INSTRUCTION}

Requirements:
- Conversational but authoritative tone
- Build the script primarily from books and movie transcripts
- Allow Lexicon only as secondary contextual support
- Do not include Lexicon-derived wording as if it were canon dialogue or narration
- If Lexicon shaped the interpretation, keep the final script grounded in primary evidence
- Include specific quotes and evidence from source material
- For each quote used, indicate in a comment whether it's exact or paraphrased
- Add [B-ROLL], [CUT TO], [GRAPHIC] annotations for video editing
- Add [SOURCE: filename] annotations after each evidence reference
- Include natural transitions between sections
- Target 10-15 minute video length (2000-3000 words)
- Start with a compelling hook
- End with a strong call to action`,

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

const STEP_ORDER = ["retrieval", "evidence_table", "analysis_memo", "outline", "full_script", "verification"];

type SearchSourceType = "book" | "transcript" | "lexicon";

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

    // Get instruction file chunks (for writing behavior ONLY, never evidence)
    const { data: instructionFiles } = await supabase
      .from("source_files")
      .select("id")
      .eq("file_type", "instructions");

    let instructionChunks: any[] = [];
    if (instructionFiles && instructionFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", instructionFiles.map(f => f.id))
        .order("chunk_index")
        .limit(10);
      instructionChunks = data || [];
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

    const previousContext = previousOutputs && previousOutputs.length > 0
      ? previousOutputs.map((o: any) => `### ${o.step_type.replace(/_/g, " ").toUpperCase()}\n${o.content}`).join("\n\n")
      : "";

    let systemPrompt = STEP_PROMPTS[stepType] || "You are a helpful writing assistant.";

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

    const userMessage = `## Topic Brief
${briefContext}

## Retrieval Query Pack (Derived)
${queryPackContext}

${instructionContext ? `## Script Writing Instructions\n${instructionContext}\n\n` : ""}${previousContext ? `## Previous Pipeline Steps\n${previousContext}\n\n` : ""}${starredEvidence ? `${starredEvidence}\n\n` : ""}## Source Material Excerpts
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

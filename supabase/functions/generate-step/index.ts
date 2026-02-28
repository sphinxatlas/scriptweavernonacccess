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
  retrieval: `You are a research retrieval specialist for Harry Potter content analysis.
Given the topic brief and source material, create a RETRIEVAL REPORT that organizes all relevant source material found.

${SOURCE_HIERARCHY_INSTRUCTION}

Format the report as:
## Retrieval Summary
- Total sources found
- Breakdown by type (Books, Transcripts, Lexicon)

## Book Sources (PRIMARY)
For each relevant passage:
- **Source**: [filename]
- **Evidence Type**: exact quote / paraphrase / summary
- **Content**: [the passage]
- **Relevance**: [why this matters to the topic]

## Movie Transcript Sources (PRIMARY)
[Same format]

## Lexicon Sources (SECONDARY)
[Same format, clearly marked as secondary]

## Retrieval Gaps
- What evidence is missing?
- What should be searched for manually?
- Which claims lack primary source support?`,

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

    // Build search query from expanded brief fields
    const searchParts = [brief.title, brief.description];
    if (brief.thesis) searchParts.push(brief.thesis);
    if (brief.focus_areas?.length) searchParts.push(...brief.focus_areas);
    if (brief.characters?.length) searchParts.push(...brief.characters);
    if (brief.proof_goal) searchParts.push(brief.proof_goal);
    const searchQuery = searchParts.join(" ");

    // Retrieve separately from each source type, then merge with priority weighting
    const [bookResults, transcriptResults, lexiconResults] = await Promise.all([
      supabase.rpc("search_chunks", { search_query: searchQuery, max_results: 15 }),
      supabase.rpc("search_chunks", { search_query: searchQuery, max_results: 15 }),
      supabase.rpc("search_chunks", { search_query: searchQuery, max_results: 10 }),
    ]);

    // Filter by source type after retrieval
    const bookChunks = (bookResults.data || []).filter((c: any) => c.file_type === 'book');
    const transcriptChunks = (transcriptResults.data || []).filter((c: any) => c.file_type === 'transcript');
    const lexiconChunks = (lexiconResults.data || []).filter((c: any) => c.file_type === 'lexicon');

    // Get instruction file chunks
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

    // Build context grouped by source type
    const sections: string[] = [];
    if (bookChunks.length > 0) {
      sections.push("### PRIMARY SOURCES — Books\n" +
        bookChunks.map((c: any) => `[${c.file_name} — BOOK — PRIMARY]\n${c.content}`).join("\n\n---\n\n"));
    }
    if (transcriptChunks.length > 0) {
      sections.push("### PRIMARY SOURCES — Movie Transcripts\n" +
        transcriptChunks.map((c: any) => `[${c.file_name} — TRANSCRIPT — PRIMARY]\n${c.content}`).join("\n\n---\n\n"));
    }
    if (lexiconChunks.length > 0) {
      sections.push("### SECONDARY REFERENCE — Lexicon (use for context/support only, NOT as primary canon)\n" +
        lexiconChunks.map((c: any) => `[${c.file_name} — LEXICON — SECONDARY]\n${c.content}`).join("\n\n---\n\n"));
    }
    const sourceContext = sections.length > 0
      ? sections.join("\n\n========\n\n")
      : "No relevant source material found. Generate based on general Harry Potter knowledge.";

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
    if (brief.priority_sources?.length) briefContext += `\n**Priority Sources:** ${brief.priority_sources.join(", ")}`;
    if (brief.emotional_angle) briefContext += `\n**Emotional Angle:** ${brief.emotional_angle}`;
    if (brief.tone) briefContext += `\n**Tone:** ${brief.tone}`;
    if (brief.comparison_mode) briefContext += `\n**Mode:** Book vs Movie Comparison`;

    const userMessage = `## Topic Brief
${briefContext}

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

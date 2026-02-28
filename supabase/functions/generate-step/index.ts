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

When citing evidence:
- Clearly label whether evidence comes from a book, movie transcript, or Lexicon
- If Lexicon is used, label it as "secondary support"
- Never present Lexicon text as primary canon
- Never use Lexicon as a substitute for direct quotes from books or films
- If a major claim relies mainly on Lexicon, flag it as needing primary confirmation
`;

const STEP_PROMPTS: Record<string, string> = {
  evidence_table: `You are a research assistant for YouTube script writing about Harry Potter.
Given the topic brief and source material excerpts, create a detailed EVIDENCE TABLE in markdown format.

The table should have these columns:
| Source | Source Type | Priority | Quote/Evidence | Relevance | Notes |

${SOURCE_HIERARCHY_INSTRUCTION}

- Prioritize book and movie transcript passages as primary evidence
- Use Lexicon only to help identify useful angles or support background context
- If Lexicon contributes to a point, explicitly label it as "Secondary Support" in the Priority column
- Never invent quotes
- Never blur the difference between primary and secondary sources
- Aim for 15-25 evidence entries, with the majority from primary sources`,

  analysis_memo: `You are a script analysis expert for Harry Potter YouTube content.
Given the topic brief, evidence table, and source material, write an ANALYSIS MEMO.

${SOURCE_HIERARCHY_INSTRUCTION}

The memo should:
- Synthesize the evidence into key themes and arguments
- Identify patterns, contradictions, and interesting angles
- Suggest the strongest narrative thread for a YouTube script
- Note any gaps in evidence that need addressing
- Clearly distinguish between claims grounded in primary sources vs secondary Lexicon support
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
  - Transition
## Section 2: [Title]
...
## Conclusion
## Call to Action

Include timing estimates and specific evidence citations for each section.
Mark any Lexicon-derived points as secondary support.`,

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
- Add [B-ROLL], [CUT TO], [GRAPHIC] annotations for video editing
- Include natural transitions between sections
- Target 10-15 minute video length (2000-3000 words)
- Start with a compelling hook
- End with a strong call to action`,

  verification: `You are a fact-checker and script verifier for Harry Potter YouTube content.
Given the full script and source material, create a VERIFICATION REPORT.

${SOURCE_HIERARCHY_INSTRUCTION}

For each claim or quote in the script:
1. ✅ VERIFIED - Found in primary source material (cite specific book or transcript)
2. ⚠️ PARAPHRASED - Based on primary source but reworded (cite source, note differences)
3. 📚 LEXICON SUPPORTED - Supported by Lexicon only (flag as secondary, note if primary confirmation needed)
4. ❌ UNVERIFIED - Cannot find in provided source material
5. 📝 OPINION - Analytical statement (not verifiable, but assess reasonableness)

Additional checks:
- If a claim relies mainly on Lexicon, flag it as "secondary support only — needs primary confirmation"
- Do not mark a claim as fully verified if it depends only on Lexicon
- Note any factual errors
- Inconsistencies within the script
- Suggestions for stronger evidence
- Overall accuracy score (percentage of verified claims from primary sources)`,
};

const STEP_ORDER = ["evidence_table", "analysis_memo", "outline", "full_script", "verification"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { briefId, stepType } = await req.json();
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

    // Search for relevant chunks (already ordered by source priority in DB function)
    const { data: chunks } = await supabase.rpc("search_chunks", {
      search_query: `${brief.title} ${brief.description}`,
      max_results: 30,
    });

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

    // Get previous pipeline outputs for this brief
    const stepIndex = STEP_ORDER.indexOf(stepType);
    const previousSteps = STEP_ORDER.slice(0, stepIndex);
    const { data: previousOutputs } = await supabase
      .from("pipeline_outputs")
      .select("step_type, content")
      .eq("brief_id", briefId)
      .in("step_type", previousSteps)
      .order("created_at");

    // Build context - group by source type for clarity
    let sourceContext = "No relevant source material found. Generate based on general Harry Potter knowledge.";
    if (chunks && chunks.length > 0) {
      const primaryChunks = chunks.filter((c: any) => c.file_type === 'book' || c.file_type === 'transcript');
      const lexiconChunks = chunks.filter((c: any) => c.file_type === 'lexicon');

      const sections: string[] = [];
      if (primaryChunks.length > 0) {
        sections.push("### PRIMARY SOURCES (Books & Transcripts)\n" +
          primaryChunks.map((c: any) => `[${c.file_name} - ${c.file_type.toUpperCase()} - PRIMARY]\n${c.content}`).join("\n\n---\n\n"));
      }
      if (lexiconChunks.length > 0) {
        sections.push("### SECONDARY REFERENCE (Lexicon — use for context/support only, NOT as primary canon)\n" +
          lexiconChunks.map((c: any) => `[${c.file_name} - LEXICON - SECONDARY]\n${c.content}`).join("\n\n---\n\n"));
      }
      sourceContext = sections.join("\n\n========\n\n");
    }

    const instructionContext = instructionChunks.length > 0
      ? instructionChunks.map(c => c.content).join("\n\n")
      : "";

    const previousContext = previousOutputs && previousOutputs.length > 0
      ? previousOutputs.map((o: any) => `### ${o.step_type.replace(/_/g, " ").toUpperCase()}\n${o.content}`).join("\n\n")
      : "";

    const systemPrompt = STEP_PROMPTS[stepType] || "You are a helpful writing assistant.";

    const userMessage = `## Topic Brief
**Title:** ${brief.title}
**Description:** ${brief.description}

${instructionContext ? `## Script Writing Instructions\n${instructionContext}\n\n` : ""}${previousContext ? `## Previous Pipeline Steps\n${previousContext}\n\n` : ""}## Source Material Excerpts
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEP_PROMPTS: Record<string, string> = {
  evidence_table: `You are a research assistant for YouTube script writing about Harry Potter.
Given the topic brief and source material excerpts, create a detailed EVIDENCE TABLE in markdown format.

The table should have these columns:
| Source | Quote/Evidence | Relevance | Notes |

Include direct quotes from the source material with page/chapter references where possible.
Focus on evidence that directly supports or relates to the topic brief.
Aim for 15-25 evidence entries.`,

  analysis_memo: `You are a script analysis expert for Harry Potter YouTube content.
Given the topic brief, evidence table, and source material, write an ANALYSIS MEMO.

The memo should:
- Synthesize the evidence into key themes and arguments
- Identify patterns, contradictions, and interesting angles
- Suggest the strongest narrative thread for a YouTube script
- Note any gaps in evidence that need addressing
- Be 800-1500 words`,

  outline: `You are a YouTube script outline specialist for Harry Potter content.
Given the topic brief, evidence, and analysis memo, create a detailed SCRIPT OUTLINE.

Format:
## Hook (0:00-0:30)
## Introduction (0:30-2:00)
## Section 1: [Title]
  - Key points
  - Evidence to cite
  - Transition
## Section 2: [Title]
...
## Conclusion
## Call to Action

Include timing estimates and specific evidence citations for each section.`,

  full_script: `You are a professional YouTube scriptwriter specializing in Harry Potter analysis content.
Given the topic brief, evidence, analysis, and outline, write a FULL SCRIPT.

Requirements:
- Conversational but authoritative tone
- Include specific quotes and evidence from source material
- Add [B-ROLL], [CUT TO], [GRAPHIC] annotations for video editing
- Include natural transitions between sections
- Target 10-15 minute video length (2000-3000 words)
- Start with a compelling hook
- End with a strong call to action`,

  verification: `You are a fact-checker and script verifier for Harry Potter YouTube content.
Given the full script and source material, create a VERIFICATION REPORT.

For each claim or quote in the script:
1. ✅ VERIFIED - Found in source material (cite specific source)
2. ⚠️ PARAPHRASED - Based on source but reworded (cite source, note differences)
3. ❌ UNVERIFIED - Cannot find in provided source material
4. 📝 OPINION - Analytical statement (not verifiable, but assess reasonableness)

Also note:
- Any factual errors
- Inconsistencies within the script
- Suggestions for stronger evidence
- Overall accuracy score (percentage of verified claims)`,
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

    // Search for relevant chunks
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

    // Build context
    const sourceContext = chunks && chunks.length > 0
      ? chunks.map((c: any) => `[${c.file_name} - ${c.file_type}]\n${c.content}`).join("\n\n---\n\n")
      : "No relevant source material found. Generate based on general Harry Potter knowledge.";

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

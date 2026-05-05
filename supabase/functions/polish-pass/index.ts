import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GUIDANCE_CHUNK_LIMIT = 100;

type PassType = "script_writing" | "anti_ai" | "melty_voice";

const SCRIPT_WRITING_SYSTEM = `You are running a SCRIPT WRITING POLISH PASS on an existing finished YouTube script.

Your ONLY rewriting lens is the SCRIPT WRITING INSTRUCTIONS document provided below. Use them to evaluate and improve the script's structure, retention, and argument craft.

Focus areas (use the Script Writing Instructions to drive each):
- Opening hook strength
- Viewer click promise alignment
- Argument spine
- Section escalation
- Rehooks between sections
- Transitions into new arguments
- Evidence integration
- Emotional movement
- Final payoff
- Retention logic
- Whether each section creates forward motion

HARD RULES:
- Preserve the script's core topic, thesis, evidence, and factual claims.
- Keep the script as close as possible to the existing version where it already works.
- Only rewrite where the Script Writing Instructions reveal a structural, retention, hook, rehook, transition, evidence, or payoff weakness.
- Do NOT add unsupported claims. Do NOT invent evidence. Do NOT change canon meaning.
- Do NOT restart the script from scratch unless the current version is structurally broken.
- Do NOT primarily focus on anti-AI wording, sentence-level AI residue, host persona jokes, or generic style polish — that is a different pass.
- Preserve all editor tags (e.g. [BOOK: ...], [FILM: ...], [LEXICON: ...]) wherever the underlying content remains.
- Output the COMPLETE revised script only. No critique. No preamble. No change log.`;

const ANTI_AI_SYSTEM = `You are running an ANTI AI POLISH PASS on an existing finished YouTube script.

Your ONLY rewriting lens is the ANTI AI WRITING INSTRUCTIONS document provided below. Use them to remove AI residue and make the script sound like a real creator speaking.

Focus areas (use the Anti AI Writing Instructions to drive each):
- Human spoken rhythm
- Sentence variety
- Natural phrasing
- Removal of AI-sounding patterns
- Removal of filler frames
- Removal of generic transitions
- Removal of mechanical contrast formulas
- Removal of "not X, but Y" style sentence structures
- Better paragraph flow
- More specific wording
- Less essay-like phrasing
- More performable voiceover delivery

HARD RULES:
- Preserve the script's core topic, thesis, evidence, structure, claims, section order, and payoff.
- Keep the script as close as possible to the existing version.
- Only rewrite where the Anti AI Writing Instructions identify AI residue, awkward rhythm, generic phrasing, repeated sentence shapes, filler, or unnatural voiceover language.
- Do NOT change the argument structure, reorder sections, add new evidence, change the thesis, or change source interpretation.
- Do NOT rebuild hooks or rehooks unless the issue is mainly wording.
- Do NOT add unsupported claims or invent evidence.
- Preserve all editor tags (e.g. [BOOK: ...], [FILM: ...], [LEXICON: ...]).

BANNED CONTRAST STRUCTURES (strictly remove or completely reconstruct, never replace with another obvious contrast formula):
- "It's not X, it's Y"
- "That's not X. That's Y."
- "This isn't X. This is Y."
- "Not because X, but because Y"
- "The problem isn't X. The problem is Y."
- "The real issue isn't X. It's Y."

Preserve the meaning of any banned construction, but change the construction completely. Do NOT swap one banned formula for another.

Output the COMPLETE revised script only. No critique. No preamble. No change log.`;

const MELTY_VOICE_SYSTEM = `MELTY VOICE POLISH

You are sharpening the host persona's voice in this script. The script's arguments, evidence, claim strength, structure, and order are final. Do not change them. Do not add new claims. Do not remove existing claims. Do not change facts. Do not introduce new evidence. Do not reorder sections.

Improve only these things:
- Word choice: make it sound more like the persona and less like a neutral narrator
- Sentence rhythm: vary length, add natural burstiness, break symmetrical runs
- Reactions: sharpen the moments where the persona would visibly react to the material
- Emotional register: match the host persona document's described register for each type of moment
- Recognizable persona lines: add 1 to 2 more Meltyisms if natural openings exist, keeping the total across the script at 2 to 4 maximum

WRITING CONSTITUTION FOR THIS PASS

The Host Persona document loaded below is the only governing document for this pass. Read it in full before making any changes.

Self-check before each edit:
- Does this change make the voice more like the persona?
- Does this change leave the argument and facts intact?
- Is the total Meltyism count still 4 or below?

If any answer is no, revert the change.

Output the COMPLETE revised script only. No critique. No preamble. No change log.`;

async function loadGuidanceText(supabase: any, fileTypes: string[]): Promise<{ text: string; chunks: number; truncated: boolean }> {
  const { data: files } = await supabase
    .from("source_files")
    .select("id")
    .in("file_type", fileTypes);
  if (!files || files.length === 0) return { text: "", chunks: 0, truncated: false };

  const { data: chunkRows, count } = await supabase
    .from("file_chunks")
    .select("content", { count: "exact" })
    .in("file_id", files.map((f: any) => f.id))
    .order("chunk_index")
    .limit(GUIDANCE_CHUNK_LIMIT);

  const text = (chunkRows || []).map((c: any) => c.content).join("\n\n");
  const truncated = typeof count === "number" ? count > GUIDANCE_CHUNK_LIMIT : false;
  return { text, chunks: (chunkRows || []).length, truncated };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const passType: PassType =
      body.passType === "anti_ai" ? "anti_ai" :
      body.passType === "melty_voice" ? "melty_voice" :
      "script_writing";
    const scriptText: string = (body.scriptText || "").toString();

    if (!scriptText || scriptText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Script text is too short. Generate or paste a full script first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const docFileTypes =
      passType === "anti_ai" ? ["anti_ai_guide"] :
      passType === "melty_voice" ? ["host_persona"] :
      ["instructions", "script_strategy"];
    const docLabel =
      passType === "anti_ai" ? "Anti AI Writing Instructions" :
      passType === "melty_voice" ? "Host Persona" :
      "Script Writing Instructions";

    const guidance = await loadGuidanceText(supabase, docFileTypes);

    if (!guidance.text || guidance.text.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error: `${docLabel} document not found in your Source Library. Upload it before running this pass.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (guidance.truncated) {
      console.warn(`WARNING: Guidance document '${docLabel}' truncated at ${GUIDANCE_CHUNK_LIMIT} chunks. Raise GUIDANCE_CHUNK_LIMIT to avoid partial guidance.`);
    }

    console.log("[polish-pass]", JSON.stringify({
      passType,
      docLabel,
      docFileTypes,
      guidanceChunks: guidance.chunks,
      guidanceTruncated: guidance.truncated,
      scriptChars: scriptText.length,
    }));

    const baseSystem =
      passType === "anti_ai" ? ANTI_AI_SYSTEM :
      passType === "melty_voice" ? MELTY_VOICE_SYSTEM :
      SCRIPT_WRITING_SYSTEM;
    const systemPrompt =
      baseSystem +
      `\n\n## ${docLabel.toUpperCase()} (BINDING — primary lens for this pass)\n\n${guidance.text}` +
      (guidance.truncated ? `\n\n[Note: ${docLabel} document was truncated to the first ${GUIDANCE_CHUNK_LIMIT} chunks.]` : "");

    const userPrompt = `Run a ${docLabel} polish pass on the following script.

Return the COMPLETE revised script only. Do not include any commentary, summary, or change log. Preserve everything that already works; only rewrite what the ${docLabel} require.

## CURRENT SCRIPT
${scriptText}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required — please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("polish-pass error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
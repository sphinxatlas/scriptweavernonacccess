import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  briefId: z.string().uuid(),
  hookFeedback: z.string().max(4000).optional(),
  // Refine mode: when provided, return ONE refined hook based on the existing
  // hook + per-hook feedback, instead of three fresh hook options.
  refineFromHook: z
    .object({
      hook_label: z.string().max(500),
      hook_text: z.string().max(8000),
      angle_route: z.string().max(100).optional(),
    })
    .optional(),
});

// TODO: extract shared guidance loader (currently duplicated from generate-step/index.ts)
const GUIDANCE_CHUNK_LIMIT = 100;
type LayerMeta = {
  text: string;
  sourceUsed: string;
  chunksRead: number;
  totalChunks: number;
  truncated: boolean;
};

async function loadLayer(
  supabase: any,
  fileTypes: string[],
  label: string,
): Promise<LayerMeta> {
  const { data: files } = await supabase
    .from("source_files")
    .select("id, file_type")
    .in("file_type", fileTypes);
  const empty: LayerMeta = { text: "", sourceUsed: "none", chunksRead: 0, totalChunks: 0, truncated: false };
  if (!files || files.length === 0) return empty;
  const ids = files.map((f: any) => f.id);
  const { count: totalChunks } = await supabase
    .from("file_chunks")
    .select("id", { count: "exact", head: true })
    .in("file_id", ids);
  const { data: chunks } = await supabase
    .from("file_chunks")
    .select("content")
    .in("file_id", ids)
    .order("chunk_index")
    .limit(GUIDANCE_CHUNK_LIMIT);
  const read = chunks?.length ?? 0;
  const total = totalChunks ?? read;
  let sourceUsed = label;
  if (fileTypes.includes("instructions") || fileTypes.includes("script_strategy")) {
    const hasNew = files.some((f: any) => f.file_type === "instructions");
    const hasLegacy = files.some((f: any) => f.file_type === "script_strategy");
    sourceUsed = hasNew ? "instructions" : hasLegacy ? "script_strategy" : "none";
  }
  return {
    text: (chunks || []).map((c: any) => c.content).join("\n\n"),
    sourceUsed,
    chunksRead: read,
    totalChunks: total,
    truncated: total > read,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request body", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { briefId, hookFeedback, refineFromHook } = parsed.data;
    const isRefine = !!refineFromHook;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Creative Brief and Script Evidence Pack
    const { data: outputs, error: outErr } = await supabase
      .from("pipeline_outputs")
      .select("step_type, content")
      .eq("brief_id", briefId)
      .in("step_type", ["creative_brief", "script_evidence_pack"]);
    if (outErr) throw outErr;

    const cb = (outputs || []).find((o: any) => o.step_type === "creative_brief");
    const sep = (outputs || []).find((o: any) => o.step_type === "script_evidence_pack");

    if (!sep || !sep.content) {
      return new Response(
        JSON.stringify({
          error:
            "Script Evidence Pack required. Please generate the Script Evidence Pack before generating Hook Options.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!cb || !cb.content) {
      return new Response(
        JSON.stringify({
          error:
            "Creative Brief required. Please generate and approve the Creative Brief before generating Hook Options.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load guidance docs
    const [scriptInstructions, antiAi, hostPersona] = await Promise.all([
      loadLayer(supabase, ["instructions", "script_strategy"], "instructions"),
      loadLayer(supabase, ["anti_ai_guide"], "anti_ai_guide"),
      loadLayer(supabase, ["host_persona"], "host_persona"),
    ]);

    const guidanceBlock = [
      hostPersona.text ? `## HOST PERSONA (binding — voice, humor, rhythm, attitude)\n${hostPersona.text}` : "",
      antiAi.text ? `## ANTI AI WRITING INSTRUCTIONS (binding, harsh)\n${antiAi.text}` : "",
      scriptInstructions.text
        ? `## SCRIPT WRITING INSTRUCTIONS (binding — includes hook rules)\n${scriptInstructions.text}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const HOOK_VOICE_INSTRUCTION = `The hooks you generate must sound like they were written by the specific host described in the Host Persona document. Apply all voice, humor, rhythm, and anti-AI rules from the Anti-AI document and all hook rules from the Script Writing Instructions.

Specifically:

Do not open with a warm-up, a rhetorical question, a generic scene-setting sentence, or any of the banned opening patterns from the Anti-AI document.

Do not use banned vocabulary from the Anti-AI document.

Do not use contrast formulas from the Anti-AI document.

Open with pressure, contradiction, consequence, or a specific tension the viewer already recognizes.

Confirm the title promise immediately.

Create an open loop — the viewer should understand the tension without being given the full answer.

Sound like the specific host persona described in the Host Persona document: sharp, fan-coded, emotionally present, occasionally petty, never a neutral explainer.

Each hook must feel like it could only have been written for this specific video about this specific topic, not reused for any other Harry Potter video.`;

    // Guidance documents + voice instruction must precede the taxonomy and
    // output format instructions in the system prompt.
    const guidanceHeader = [guidanceBlock, `## HOOK VOICE & STYLE (binding)\n${HOOK_VOICE_INSTRUCTION}`]
      .filter(Boolean)
      .join("\n\n");

    const systemPrompt = isRefine
      ? `${guidanceHeader}

You are REFINING ONE existing opening HOOK for a long-form YouTube Harry Potter commentary script written in the Melty voice.

SOURCE PRIORITY (BINDING):
- The Script Evidence Pack is the CONTROLLING input. The refined hook must be grounded in what the Pack actually contains.
- The Creative Brief is DIRECTIONAL ONLY: title promise, high-level thesis direction, tone, and intended emotional payoff.
- If the Creative Brief and the Script Evidence Pack conflict, FOLLOW THE SCRIPT EVIDENCE PACK.
- Do NOT treat the Creative Brief as evidence.

REFINE MODE (BINDING):
- You are returning EXACTLY ONE refined version of the provided hook via the structured tool call.
- Preserve the hook's existing ROUTE (scene contradiction, character wound, fan debate, canon irony, or cold open mystery) unless the user feedback explicitly asks to change route.
- Preserve the strongest specific images, names, and concrete moments from the original hook unless the feedback asks to swap them.
- Apply the user's feedback precisely. Do not rewrite parts the feedback does not address.
- This is a focused edit, not a fresh generation. The output should still feel recognizably like the same hook, only sharper.

The hook should READ like the first 20–40 seconds of a spoken YouTube script — not a summary, not a description, not a teaser blurb. Spoken voiceover only. The hook MUST create a clear OPEN LOOP into the rest of the argument.

SCRIPT WRITING INSTRUCTIONS (binding) govern: hook strength, title promise, opening pressure, open loop, curiosity, and retention. Apply them.

ANTI AI RULES (binding, harsh — do NOT weaken):
- No generic YouTube intros.
- No "have you ever wondered."
- No "in this video / today we're talking about / let's dive in."
- No "not X but Y" / "it's not X, it's Y" / mechanical contrast formulas.
- No three-sentence symmetry stacks (no triads).
- No fake profundity, no greeting-card philosophy.
- No templated signposting.
- No citations, no editor tags, no source references inside hook text.

MELTY PERSONA: voice, rhythm, judgment, specificity. The hook should sound like Melty already mid-thought, not like a host introducing himself.

Return exactly one hook record with: hook_label, hook_text, angle_route, why_it_works, open_loop, risk_or_weakness.`
      : `${guidanceHeader}

You are generating three opening HOOK OPTIONS for a long-form YouTube Harry Potter commentary script written in the Melty voice.

SOURCE PRIORITY (BINDING):
- The Script Evidence Pack is the CONTROLLING input. Hooks must be grounded in what the Pack actually contains.
- The Creative Brief is DIRECTIONAL ONLY: title promise, high-level thesis direction, tone, and intended emotional payoff.
- If the Creative Brief and the Script Evidence Pack conflict, FOLLOW THE SCRIPT EVIDENCE PACK.
- Do NOT treat the Creative Brief as evidence.
- Do NOT use raw Evidence Table, raw Beat Plan, Selected Source Analysis, Six Category Extraction, or raw source formatting. They are not provided here, and you must not invent them.

GENERATION INSTRUCTION (BINDING):
Read the Creative Brief and Script Evidence Pack carefully. Identify the three sharpest, most specific tensions, contradictions, or revelations available in this exact material. For each one, write a hook that opens on that specific tension — not on a category of tension, but on the actual detail, scene, quote, or gap that makes this video worth watching.

Each hook must:

Open with a specific detail, moment, character action, or canon fact from the evidence — not a general statement about the topic

Create an open loop in the first two sentences — the viewer understands something is wrong or unresolved before you explain what

Sound like it was written by the specific host persona in the Host Persona document

Apply all Anti-AI rules — no banned opening patterns, no contrast formulas, no generic scene-setting

Feel like it could only exist for this specific script, not any other Harry Potter video

After generating each hook, tag it with the closest matching route label from the taxonomy below as METADATA ONLY. The route label describes what you made; it does not prescribe what to make. Do NOT start from a route and reverse-engineer a hook to fit it.

Route taxonomy (metadata tags only):
- scene contradiction (a moment in canon that breaks the surface reading)
- character wound (the unhealed emotional pressure driving a character)
- fan debate (a known disagreement among fans, framed honestly)
- canon irony (a setup/payoff irony hidden in the text)
- cold open mystery (open with an unresolved question that pulls the viewer in)

Generate three hooks that are genuinely different from each other — different evidence entry points, different emotional registers, different open loops. Do not generate three versions of the same approach. Route labels MAY repeat across the three hooks if the underlying tensions are genuinely distinct, but the hooks themselves must not be variations of one idea.

Each hook should READ like the first 20–40 seconds of a spoken YouTube script — not a summary, not a description, not a teaser blurb. Spoken voiceover only. Each hook MUST create a clear OPEN LOOP into the rest of the argument.

SCRIPT WRITING INSTRUCTIONS (binding) govern: hook strength, title promise, opening pressure, open loop, curiosity, and retention. Apply them.

ANTI AI RULES (binding, harsh — do NOT weaken):
- No generic YouTube intros.
- No "have you ever wondered."
- No "in this video / today we're talking about / let's dive in."
- No "not X but Y" / "it's not X, it's Y" / mechanical contrast formulas.
- No three-sentence symmetry stacks (no triads).
- No fake profundity, no greeting-card philosophy.
- No templated signposting.
- No citations, no editor tags, no source references inside hook text.

MELTY PERSONA: voice, rhythm, judgment, specificity. The hook should sound like Melty already mid-thought, not like a host introducing himself.

If user feedback is provided, honor it (e.g. "darker", "more canon-led", "less jokey", "more fan-debate driven") without breaking any of the binding rules above.

Each hook record must include:
- hook_label: short human label (e.g. "Snape's last look")
- hook_text: the spoken hook itself (~20–40 seconds of voiceover, paragraph form)
- angle_route: one of [scene contradiction, character wound, fan debate, canon irony, cold open mystery]
- why_it_works: one or two sentences on why this route opens the argument cleanly
- open_loop: the explicit unresolved question or tension this hook leaves dangling
- risk_or_weakness: one honest sentence on where this route could fail or feel weak`;

    const userMessage = isRefine
      ? `## Creative Brief (DIRECTIONAL ONLY — title promise, thesis direction, tone, intended emotional payoff)
${cb.content}

## Script Evidence Pack (CONTROLLING SOURCE — refined hook must be grounded here)
${sep.content}

## Existing Hook to Refine
**Label:** ${refineFromHook!.hook_label}
${refineFromHook!.angle_route ? `**Route:** ${refineFromHook!.angle_route}\n` : ""}**Hook text:**
${refineFromHook!.hook_text}

## User Refinement Feedback (binding — apply precisely)
${(hookFeedback || "").trim() || "(no specific feedback — tighten the hook, sharpen specificity, remove any AI residue, preserve the route and core image)"}

Return exactly ONE refined hook via the tool call. Preserve the route. Preserve the strongest specific images. Apply the feedback. Spoken voiceover only.`
      : `## Creative Brief (DIRECTIONAL ONLY — title promise, thesis direction, tone, intended emotional payoff)
${cb.content}

## Script Evidence Pack (CONTROLLING SOURCE — hooks must be grounded here)
${sep.content}

${hookFeedback && hookFeedback.trim() ? `## User Hook Feedback (honor this)\n${hookFeedback.trim()}\n\n` : ""}Now produce exactly three hook options via the tool call. Start from the sharpest tensions in this specific Pack — not from the route taxonomy. Each hook must open on a specific detail/scene/quote/gap from the evidence. Three genuinely different entry points, emotional registers, and open loops. Tag each with the closest route label as metadata only. No generic YouTube intro tropes. No triads. No "have you ever wondered." No "in this video." No "not X but Y." Spoken voiceover only.`;

    const hookItemSchema = {
      type: "object",
      properties: {
        hook_label: { type: "string" },
        hook_text: { type: "string" },
        angle_route: {
          type: "string",
          enum: [
            "scene contradiction",
            "character wound",
            "fan debate",
            "canon irony",
            "cold open mystery",
          ],
        },
        why_it_works: { type: "string" },
        open_loop: { type: "string" },
        risk_or_weakness: { type: "string" },
      },
      required: [
        "hook_label",
        "hook_text",
        "angle_route",
        "why_it_works",
        "open_loop",
        "risk_or_weakness",
      ],
      additionalProperties: false,
    };

    const tool = isRefine
      ? {
          type: "function",
          function: {
            name: "return_refined_hook",
            description: "Return exactly one refined hook.",
            parameters: {
              type: "object",
              properties: { hook: hookItemSchema },
              required: ["hook"],
              additionalProperties: false,
            },
          },
        }
      : {
      type: "function",
      function: {
        name: "return_hook_options",
        description: "Return exactly three distinct hook options.",
        parameters: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: hookItemSchema,
            },
          },
          required: ["hooks"],
          additionalProperties: false,
        },
      },
    };

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
        tools: [tool],
        tool_choice: {
          type: "function",
          function: { name: isRefine ? "return_refined_hook" : "return_hook_options" },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("No tool call in response:", JSON.stringify(data).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Hook options model returned no structured output. Please regenerate." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed2: any;
    try {
      parsed2 = JSON.parse(argsStr);
    } catch (e) {
      console.error("Tool args JSON parse failed:", e, argsStr.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Hook options JSON parse failed. Please regenerate." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isRefine) {
      const hook = parsed2?.hook;
      if (!hook || typeof hook !== "object") {
        return new Response(
          JSON.stringify({ error: "Refined hook model returned no hook. Please retry." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ hook }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hooks = Array.isArray(parsed2?.hooks) ? parsed2.hooks.slice(0, 3) : [];
    if (hooks.length !== 3) {
      return new Response(
        JSON.stringify({ error: "Hook options model did not return three options. Please regenerate." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ hooks }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-hook-options error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
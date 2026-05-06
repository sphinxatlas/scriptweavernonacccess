import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GUIDANCE_CHUNK_LIMIT = 100;

type PassType = "script_writing" | "anti_ai" | "melty_voice";
type PassScope = "full_script" | "passage";

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

const ANTI_AI_SYSTEM = `You are running a STRICT FINAL ANTI AI CLEANUP PASS on an existing finished YouTube script.

This is NOT a gentle wording polish. This is a strict residue-removal pass. If you finish and the script still contains banned structures, repeated "That's..." punchlines, polished essay transitions, or restated theses, you have FAILED the pass.

Your ONLY rewriting lens is the ANTI AI WRITING INSTRUCTIONS document provided below.

================================================================
HIDDEN INTERNAL WORKFLOW (do all of this silently before output)
================================================================
1. Read the script end-to-end once.
2. Silently scan for and mark every instance of:
   a) Banned contrast formulas (see list below) AND their softened cousins.
   b) Repeated "That's <noun phrase>." / "That's <pronoun> ..." punchline sentences.
   c) Repeated thesis restatements that do not clearly escalate.
   d) Generic essay transitions ("Moreover", "Furthermore", "In essence", "Ultimately", "At its core", "What's more", "And yet", "And so", "Here's the thing", "The truth is", "Make no mistake").
   e) Filler frames ("It's worth noting", "It's important to remember", "Let's be clear", "Let's talk about", "When you really think about it").
   f) Polished-but-empty lines, fake profundity, empty superlatives.
   g) Over-explained sentences where the point already landed in the previous sentence.
3. Rewrite each marked spot AND the immediately surrounding sentences as needed so the rewrite reads naturally.
4. PRESERVE strong human lines (vivid, specific, funny, sharply Melty) untouched unless they violate a hard rule.
5. Run a SILENT FINAL CHECK: re-scan the revised script for any remaining banned structure or softened cousin or repeated "That's..." cluster. If any remain, rewrite them again. Repeat until clean.
6. Output ONLY the complete revised script.

================================================================
BANNED CONTRAST STRUCTURES — must be removed AND structurally reconstructed
================================================================
Direct forms:
- "It's not X, it's Y"
- "That's not X. That's Y."
- "This isn't X. This is Y."
- "Not because X, but because Y"
- "The problem isn't X. The problem is Y."
- "The real issue/tragedy/point/story isn't X. It's Y."
- "X, but really Y"

Softened cousins (ALSO BANNED — do not use these as escape hatches):
- "goes beyond just X"
- "not simply X"
- "more than just X"
- "on the surface X, underneath Y"
- "the deeper issue is ..."
- "the real story is ..."
- "what's actually happening is ..."
- "X, then, goes beyond ..."

Rule: Preserve the MEANING of any banned construction, but change the SENTENCE SHAPE completely. Do NOT swap one banned formula for another, and do NOT swap a direct form for its softened cousin. Rebuild the sentence around a concrete image, action, or moment instead of a rhetorical flip.

Example rewrites (style only — do not copy verbatim):

BAD: "The tragedy of Movie Ginny goes beyond being quiet. The films freeze her..."
GOOD: "The films leave Movie Ginny frozen at the Gryffindor table, still trying to open her mouth while the story moves on without her."

BAD: "That's Ginny's social confidence in three seconds."
GOOD: "In three seconds, Ginny does something the films almost never let her do: she leads the room without orbiting Harry."

BAD: "That's it. That's the seed."
GOOD: "The seed is already there: Ginny is good at Harry's favorite thing, and she's already moving before he notices."

================================================================
REPEATED "THAT'S..." PUNCHLINE RULE
================================================================
Across the whole script, allow AT MOST 1–2 "That's ..." / "That scene is ..." / "That line is ..." / "That's why ..." punchline sentences total, and only when each one is genuinely the strongest possible landing for that beat. Rewrite all others into sentences that lead with a concrete image, action, character beat, or specific observation.

================================================================
REPEATED THESIS RESTATEMENTS
================================================================
If the same thesis is restated more than twice and each restatement does not clearly escalate (sharper stakes, new angle, new evidence pressure), cut or rewrite the redundant ones. The script should move forward, not loop.

================================================================
HARD PRESERVATION RULES
================================================================
- Preserve facts, thesis, evidence, source meaning, claim strength (only weaken unsupported claims), section order, argument structure, canon interpretation, and intended payoff.
- Do NOT add new evidence, invent quotes/details, add new canon claims, or add unsupported jokes.
- Preserve EDITOR REFERENCES / editor tags exactly (e.g. [BOOK: ...], [FILM: ...], [LEXICON: ...]).
- PRESERVE STRONG HUMAN LINES. If a line is vivid, funny, specific, personally voiced, or sharply Melty, leave it alone. Do NOT corporate-flatten it. Example of what NOT to do:
    Original: "And I'm not mad at Hermione for saying it. I'm mad at the adaptation for needing her to say it."
    Bad revision: "My frustration here is with the adaptation..."
  The original is stronger. Keep it.
- Do NOT make the script more polished, more neutral, or more essay-like. The goal is LESS AI, not MORE smooth.

================================================================
OUTPUT
================================================================
Return ONLY the complete revised script. No critique. No preamble. No notes. No change log. No markdown headings beyond what already exists in the script.`;

const PASSAGE_REWRITE_SYSTEM = `You are running a TARGETED PASSAGE REWRITE on a SHORT passage from a YouTube script (e.g. a hook, transition, paragraph, or section).

You have three binding guidance documents loaded below, but they are NOT equal. Use them in this STRICT HIERARCHY:

ORDER OF AUTHORITY (do not collapse these into one blended pass):

1. USER FEEDBACK — binding. If the user asks for a specific tone, length, edit, or fix, that overrides everything else short of inventing facts.

2. SCRIPT WRITING INSTRUCTIONS — the PRIMARY creative lens. Rewrite the passage first to improve:
   - argument clarity and the passage's purpose in the script
   - structure, transition into/out of the passage
   - evidence meaning and the "so what"
   - hook / payoff function of the passage
   - whether the passage actually moves the script forward

3. HOST PERSONA / MELTY — the SECONDARY voice lens, applied on top of the Script Writing rewrite. The voice should be: sharp, book-aware, specific, opinionated, human, funny when it genuinely lands, and natural as spoken YouTube commentary. Do NOT over-Meltyify. Do NOT inflate.

4. ANTI AI WRITING INSTRUCTIONS — applied LAST as a harsh, silent FINAL CLEANUP pass over the wording produced by steps 2 and 3. Anti AI is NOT the creative driver. It does NOT get to flatten the passage into bland neutral writing. Its only job is to scrub residue from the already-rewritten passage.

================================================================
FINAL ANTI AI CLEANUP PASS (silent, mandatory, last step before output)
================================================================
After producing the rewritten passage from steps 1–3, silently re-read it and remove any of the following before returning:
- Mechanical contrast formulas ("not X, but Y", "the problem is not X, it is Y", "it isn't X, it's Y", "that's not X. that's Y.", and softened cousins like "more than just X", "goes beyond X", "the real issue is...", "what's actually happening is...").
- Overwritten or poetic phrasing (e.g. "visible effect of", "eating her from the inside", metaphors that sound literary rather than spoken).
- Fake profundity / lines that sound like a model trying to sound clever.
- Dramatic inflation and performative heightening (e.g. "straight-up terror", "absolute nightmare", "completely shattered") when the user asked for a calmer or more grounded tone.
- Repetitive sentence shapes, triads, or overly neat rhythm.
- Generic YouTube phrasing ("here's the thing", "let's be real", "the truth is", "make no mistake").
- Restated points the previous sentence already made.

Rule: If any phrase in the rewritten passage sounds more dramatic, more polished, more generic, more formulaic, or more try-hard than the user's requested tone, simplify it. Rebuild the sentence around a concrete image, action, or specific observation instead of a rhetorical flourish.

================================================================
PRESERVE
================================================================
- The factual meaning of the pasted passage and the user's intended point.
- Existing canon claims and existing evidence (unless the user asks otherwise).
- Paragraph breaks where useful.
- Level of certainty (unless the user asks to strengthen or soften it).
- EDITOR REFERENCES / editor tags if present.

================================================================
DO NOT
================================================================
- Invent new canon evidence, new quotes, or unsupported facts.
- Expand into a whole new section unless the user asks.
- Reference unseen parts of the script.
- Add labels like "Revised Hook" or "Option 1".
- Add commentary, notes, diagnosis, markdown headings, preamble, or change log.
- Return multiple options unless the user asks.
- Swap one banned contrast formula for another — rewrite the structure entirely.
- Let the Anti AI pass strip out genuine Melty voice or specificity. It removes residue, not character.

OUTPUT RULES (STRICT):
- Return ONLY the revised passage text.
- No commentary, no notes, no labels, no markdown headings, no explanation, no preamble, no change log, no quotation wrappers.`;

const MELTY_VOICE_SYSTEM = `MELTY VOICE POLISH

You are sharpening the host persona's voice in this script. The script's arguments, evidence, claim strength, structure, and order are final. Do not change them. Do not add new claims. Do not remove existing claims. Do not change facts. Do not introduce new evidence. Do not reorder sections.

Improve only these things:
- Word choice: make it sound more like the persona and less like a neutral narrator
- Sentence rhythm: vary length, add natural burstiness, break symmetrical runs
- Reactions: sharpen the moments where the persona would visibly react to the material
- Emotional register: match the host persona document's described register for each type of moment
- Recognizable persona lines: add 1 to 2 more Meltyisms if natural openings exist, keeping the total across the script at 2 to 4 maximum

FINAL ANTI-AI SELF-AUDIT BEFORE OUTPUT

Before returning the polished version, silently audit the script for contrast flip formulas (e.g. "That's not X. That's Y.", "It is not X. It is Y.", "Don't call it X. Call it Y.") and three-part symmetry stacks (any run of three or more consecutive sentences with the same structure). Rewrite them only when doing so does not change the argument, facts, or evidence.

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
    const scope: PassScope = body.scope === "passage" ? "passage" : "full_script";
    const userFeedback: string = (body.userFeedback || "").toString().trim();

    const minLen = scope === "passage" ? 10 : 50;
    if (!scriptText || scriptText.trim().length < minLen) {
      const minMsg = scope === "passage"
        ? "Passage is too short. Paste at least a sentence or two."
        : "Script text is too short. Generate or paste a full script first.";
      return new Response(JSON.stringify({ error: minMsg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let systemPrompt: string;
    let userPrompt: string;

    if (scope === "passage") {
      // Passage Rewrite: load ALL THREE guidance documents.
      const [scriptWriting, antiAi, hostPersona] = await Promise.all([
        loadGuidanceText(supabase, ["instructions", "script_strategy"]),
        loadGuidanceText(supabase, ["anti_ai_guide"]),
        loadGuidanceText(supabase, ["host_persona"]),
      ]);

      const missing: string[] = [];
      if (!scriptWriting.text || scriptWriting.text.trim().length < 20) missing.push("Script Writing Instructions");
      if (!antiAi.text || antiAi.text.trim().length < 20) missing.push("Anti AI Writing Instructions");
      if (!hostPersona.text || hostPersona.text.trim().length < 20) missing.push("Host Persona / Melty");
      if (missing.length > 0) {
        return new Response(
          JSON.stringify({
            error: `Passage Rewrite requires these documents in your Source Library: ${missing.join(", ")}.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      for (const [label, g] of [
        ["Script Writing Instructions", scriptWriting],
        ["Anti AI Writing Instructions", antiAi],
        ["Host Persona", hostPersona],
      ] as const) {
        if (g.truncated) {
          console.warn(`WARNING: Guidance document '${label}' truncated at ${GUIDANCE_CHUNK_LIMIT} chunks.`);
        }
      }

      console.log("[polish-pass]", JSON.stringify({
        scope: "passage",
        scriptWritingChunks: scriptWriting.chunks,
        antiAiChunks: antiAi.chunks,
        hostPersonaChunks: hostPersona.chunks,
        passageChars: scriptText.length,
        hasFeedback: userFeedback.length > 0,
      }));

      systemPrompt =
        PASSAGE_REWRITE_SYSTEM +
        `\n\n## SCRIPT WRITING INSTRUCTIONS (PRIMARY — drives the rewrite)\n\n${scriptWriting.text}` +
        `\n\n## HOST PERSONA / MELTY (SECONDARY — voice on top of the rewrite)\n\n${hostPersona.text}` +
        `\n\n## ANTI AI WRITING INSTRUCTIONS (FINAL CLEANUP — applied last to scrub residue, NOT the creative driver)\n\n${antiAi.text}`;

      userPrompt = `Rewrite the following passage using the strict hierarchy above: user feedback first, then Script Writing Instructions, then Melty voice, then a final silent Anti AI cleanup pass over the result. Return ONLY the revised passage text — no commentary, labels, headings, or explanations.

${userFeedback ? `## USER FEEDBACK\n${userFeedback}\n\n` : ""}## PASSAGE
${scriptText}`;
    } else {
      // Full-script polish pass — unchanged behavior (single-doc lens).
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
        console.warn(`WARNING: Guidance document '${docLabel}' truncated at ${GUIDANCE_CHUNK_LIMIT} chunks.`);
      }

      console.log("[polish-pass]", JSON.stringify({
        passType,
        scope: "full_script",
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

      systemPrompt =
        baseSystem +
        `\n\n## ${docLabel.toUpperCase()} (BINDING — primary lens for this pass)\n\n${guidance.text}` +
        (guidance.truncated ? `\n\n[Note: ${docLabel} document was truncated to the first ${GUIDANCE_CHUNK_LIMIT} chunks.]` : "");

      userPrompt = `Run a ${docLabel} polish pass on the following script.

Return the COMPLETE revised script only. Do not include any commentary, summary, or change log. Preserve everything that already works; only rewrite what the ${docLabel} require.

## CURRENT SCRIPT
${scriptText}`;
    }

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
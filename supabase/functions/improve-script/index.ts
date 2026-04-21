import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOPWORDS = new Set([
  "the","and","for","are","but","not","you","your","with","that","this","from","into","have","has","had","was","were","will","would","could","should","they","them","their","there","when","what","which","while","about","also","just","like","very","only","over","under","than","then","been","being","because","after","before","upon","onto","each","every","some","most","more","much","many","such","into","its","it's","one","two","three","first","last","next","still","ever","never","make","made","get","got","let","yet","off","out","own","our","who","why","how","does","did","done","say","said","says","goes","go","gone","came","come","take","took","taken","know","knew","known","find","found","feel","felt","look","looked","looks","seem","seems","seemed","really","actually","probably","maybe","quite","rather","pretty","kind","sort","thing","things","stuff","way","ways","time","times","day","days","year","years",
]);

function extractClaimQueries(draft: string, maxQueries = 12): string[] {
  // Split into sentences, score by capitalized-name density and length
  const sentences = draft
    .replace(/\s+/g, " ")
    .split(/(?<=[\.\?\!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);

  const scored = sentences.map((s) => {
    const tokens = s.split(/\s+/);
    const propers = tokens.filter((t) => /^[A-Z][a-z]{2,}/.test(t)).length;
    const score = propers * 2 + Math.min(tokens.length, 30) / 10;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // From the top sentences, derive compact queries (3-7 keywords)
  const queries = new Set<string>();
  for (const { s } of scored.slice(0, maxQueries * 2)) {
    const keywords = s
      .replace(/["'\.,;:\?\!\(\)\[\]]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase()))
      .slice(0, 7);
    if (keywords.length >= 2) {
      queries.add(keywords.join(" "));
    }
    if (queries.size >= maxQueries) break;
  }
  return Array.from(queries);
}

const SYSTEM_PROMPT = `You are a script doctor for a source-grounded YouTube channel. You rewrite an existing draft script so it sounds like a creator speaking — clean, natural, voiceover-friendly — while staying faithful to the writer's intent and structure.

Your job:
1. Preserve the draft's intent, argument, and overall section flow.
2. Tighten pacing, sharpen the hook, smooth transitions, and elevate voice.
3. Apply the SCRIPT WRITING INSTRUCTIONS as the highest-priority writing guide. They override all other guidance for structure, pacing, hooks, and style.
4. Apply the ANTI AI LANGUAGE GUIDE strictly. The output must not sound like AI.
5. Insert editor reference tags where retrieved canon evidence supports the claims being made.

QUOTE DISCIPLINE (CRITICAL):
- Maximum 0–2 short direct quotes per 1,000 words. Each quote must be under 12 words.
- Everything else must be paraphrased as natural spoken narration.
- Never paste long passages from books, transcripts, or any source.

SOURCE SPECIFICITY IN NARRATION:
- Every evidence-based paragraph must naturally mention WHERE the moment happens (book or film + installment) inside the spoken narration.
- Examples: "In Order of the Phoenix...", "The fifth film captures...", "Goblet of Fire opens with..."
- Forbidden vague phrasing: "during a key moment", "at one point", "in one scene" without naming the installment.
- Vary phrasing so it does not sound repetitive.

EDITOR TAGS (metadata only — never spoken):
- After each evidence-based paragraph, place an editor tag on its OWN line.
- Allowed formats only:
  [BOOK: filename | chapter if known]
  [FILM: filename | timestamp range if known]
  [LEXICON: filename | context only]
- Editor tags must NOT contain quotes.
- Editor tags are metadata for the editor, not part of the voiceover.

LEXICON MENTION BAN (CRITICAL):
- The script MUST NEVER mention "the Lexicon", "the Harry Potter Lexicon", or any phrase like "According to the Lexicon..." in the spoken narration.
- Lexicon is background context only. It is INVISIBLE in the voiceover text.
- The only place Lexicon may appear is as an editor metadata tag: [LEXICON: filename | context only]
- No other Lexicon callouts, citations, or attribution language may appear in the script body.

"SO-WHAT" TAKEAWAYS:
- After every evidence-based beat, include a short takeaway line (1–2 sentences) that says why this matters to the argument.
- Format: a normal short paragraph in the VO. No labels needed.

FORBIDDEN IN OUTPUT:
- No "VISUAL NOTES" blocks.
- No "SOURCE SECONDARY" blocks.
- No "[CLAIM]:" or "[SOURCE]:" lines.
- No [B-ROLL] markers in spoken text.
- No long pasted quotes.
- No mentions of "the Lexicon" in the narration.

OUTPUT STRUCTURE:
- Clean voiceover paragraphs with short headings (## Section).
- Short paragraphs suited to spoken delivery.
- Editor tags on their own line after each evidence-based beat.
- A short "so-what" takeaway after each evidence-based beat.
- End with a final line: Word count: ~X

Treat the SCRIPT WRITING INSTRUCTIONS as the primary behavior guide. If they conflict with anything else, the Script Instructions win.

Use the RETRIEVED EVIDENCE only to support claims that already exist in the draft. Do NOT invent new factual claims that the draft does not make. If the draft makes a claim and no retrieved evidence supports it, leave the claim alone but do not add a fake editor tag.`;

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
    const draftScript: string = (body.draftScript || "").toString();
    const targetMinWords: number | undefined = body.targetMinWords;
    const targetMaxWords: number | undefined = body.targetMaxWords;
    const toneNote: string = (body.toneNote || "").toString();
    const mode: "initial" | "lengthen" | "feedback" =
      body.mode === "lengthen" || body.mode === "feedback" ? body.mode : "initial";
    const previousOutput: string = (body.previousOutput || "").toString();
    const feedbackNote: string = (body.feedbackNote || "").toString();

    if (!draftScript || draftScript.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Draft script is too short. Paste at least a few sentences." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((mode === "lengthen" || mode === "feedback") && previousOutput.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Previous output is required for revision mode." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mode === "feedback" && feedbackNote.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Feedback note is required for feedback mode." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1. Pull instruction + anti-ai chunks
    const [{ data: instructionFiles }, { data: antiAiFiles }] = await Promise.all([
      supabase.from("source_files").select("id").in("file_type", ["instructions", "script_strategy"]),
      supabase.from("source_files").select("id").eq("file_type", "anti_ai_guide"),
    ]);

    let instructionChunks: any[] = [];
    if (instructionFiles && instructionFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", instructionFiles.map((f: any) => f.id))
        .order("chunk_index")
        .limit(20);
      instructionChunks = data || [];
    }

    let antiAiChunks: any[] = [];
    if (antiAiFiles && antiAiFiles.length > 0) {
      const { data } = await supabase
        .from("file_chunks")
        .select("content")
        .in("file_id", antiAiFiles.map((f: any) => f.id))
        .order("chunk_index")
        .limit(20);
      antiAiChunks = data || [];
    }

    // 2. Extract claim queries from the draft and run them against the source library
    // For revision modes, prefer the latest output so retrieval matches the revised claims.
    const querySource =
      (mode === "lengthen" || mode === "feedback") && previousOutput
        ? previousOutput
        : draftScript;
    const queries = extractClaimQueries(querySource, 12);
    const retrieved: Record<string, { content: string; file_name: string; file_type: string; query: string }> = {};

    await Promise.all(
      queries.map(async (q) => {
        const { data, error } = await supabase.rpc("search_chunks", { search_query: q, max_results: 4 });
        if (error || !data) return;
        for (const row of data as any[]) {
          const key = row.id;
          if (!retrieved[key]) {
            retrieved[key] = {
              content: row.content,
              file_name: row.file_name,
              file_type: row.file_type,
              query: q,
            };
          }
        }
      }),
    );

    const retrievedList = Object.values(retrieved);
    const books = retrievedList.filter((r) => r.file_type === "book").slice(0, 12);
    const transcripts = retrievedList.filter((r) => r.file_type === "transcript").slice(0, 12);
    const lexicon = retrievedList.filter((r) => r.file_type === "lexicon").slice(0, 8);

    const evidenceSections: string[] = [];
    if (books.length > 0) {
      evidenceSections.push(
        "### PRIMARY — Books\n" +
          books.map((c) => `[${c.file_name} — BOOK | matched: "${c.query}"]\n${c.content}`).join("\n\n---\n\n"),
      );
    }
    if (transcripts.length > 0) {
      evidenceSections.push(
        "### PRIMARY — Movie Transcripts\n" +
          transcripts.map((c) => `[${c.file_name} — FILM | matched: "${c.query}"]\n${c.content}`).join("\n\n---\n\n"),
      );
    }
    if (lexicon.length > 0) {
      evidenceSections.push(
        "### SECONDARY — Lexicon (use only as editor metadata, never mention in narration)\n" +
          lexicon.map((c) => `[${c.file_name} — LEXICON | matched: "${c.query}"]\n${c.content}`).join("\n\n---\n\n"),
      );
    }

    const evidenceContext = evidenceSections.length > 0
      ? evidenceSections.join("\n\n========\n\n")
      : "NO RETRIEVED EVIDENCE — proceed without inserting editor tags. Improve voice and pacing only.";

    const instructionContext = instructionChunks.length > 0
      ? instructionChunks.map((c: any) => c.content).join("\n\n")
      : "";
    const antiAiContext = antiAiChunks.length > 0
      ? antiAiChunks.map((c: any) => c.content).join("\n\n")
      : "";

    let systemPrompt = SYSTEM_PROMPT;
    if (instructionContext) {
      systemPrompt += `\n\nSCRIPT WRITING INSTRUCTIONS (HIGHEST PRIORITY — overrides all other guidance for structure, pacing, hooks, and style):\n${instructionContext}`;
    }
    if (antiAiContext) {
      systemPrompt += `\n\nANTI AI LANGUAGE GUIDE (MANDATORY — strictly avoid AI tells, templated intros, repetitive triads, heavy em dashes, generic CTAs):\n${antiAiContext}`;
    }

    const baseLengthInstruction = targetMinWords && targetMaxWords
      ? `Target word count: ${targetMinWords}–${targetMaxWords} words. Self-revise if outside the range.`
      : "Match the length of the input draft within ±15%.";

    let userPrompt: string;

    if (mode === "lengthen") {
      // Aim for ~30–50% more than the previous output.
      const prevWordCount = previousOutput.trim().split(/\s+/).length;
      const newMin = Math.round(prevWordCount * 1.3);
      const newMax = Math.round(prevWordCount * 1.5);
      const lengthenInstruction = targetMinWords && targetMaxWords
        ? `Target word count: ${targetMinWords}–${targetMaxWords} words.`
        : `Target word count: ${newMin}–${newMax} words (roughly 30–50% longer than the previous version, which was ~${prevWordCount} words).`;

      userPrompt = `EXPAND THE FOLLOWING IMPROVED SCRIPT.

${lengthenInstruction}
${toneNote ? `Tone note from the creator: ${toneNote}` : ""}

EXPANSION RULES:
- Preserve every section, every editor tag, every "so-what" beat from the previous version.
- Add depth: more specific examples, smoother transitions, fuller setups, richer payoffs.
- Do NOT invent new factual claims. Only deepen what is already supported by the draft or retrieved evidence.
- Keep all existing rules: paraphrase-first, installment naming, lexicon mention ban, editor tag format.
- The expanded version must read as a single coherent voiceover, not the previous version with padding bolted on.

## ORIGINAL DRAFT (for reference on intent only — do not regress to it):
${draftScript}

## PREVIOUS IMPROVED VERSION (this is what you must expand):
${previousOutput}

## RETRIEVED EVIDENCE FROM SOURCE LIBRARY (use only to support existing claims; insert editor tags where matched):
${evidenceContext}

Now produce the expanded improved script. Output the script only — no preamble, no commentary about what you changed.`;
    } else if (mode === "feedback") {
      const lengthForFeedback = targetMinWords && targetMaxWords
        ? `Target word count: ${targetMinWords}–${targetMaxWords} words.`
        : "Match the length of the previous improved version within ±15% unless the feedback explicitly asks for a different length.";

      userPrompt = `REVISE THE PREVIOUS IMPROVED SCRIPT BASED ON CREATOR FEEDBACK.

${lengthForFeedback}
${toneNote ? `Tone note from the creator: ${toneNote}` : ""}

## CREATOR FEEDBACK (HIGHEST-PRIORITY REVISION INSTRUCTION — apply faithfully, but never override the SCRIPT WRITING INSTRUCTIONS or the rules in the system prompt):
${feedbackNote}

REVISION RULES:
- Apply the feedback precisely. If it asks to drop, restructure, or rewrite a section, do it.
- Keep all existing rules: paraphrase-first, installment naming, lexicon mention ban, editor tag format, "so-what" beats.
- Do NOT invent new factual claims. Use retrieved evidence to ground revised or expanded claims.
- Preserve editor tags wherever the underlying evidence still applies; remove tags for content that is cut.

## ORIGINAL DRAFT (for reference on intent only):
${draftScript}

## PREVIOUS IMPROVED VERSION (this is what you are revising):
${previousOutput}

## RETRIEVED EVIDENCE FROM SOURCE LIBRARY (use only to support existing or revised claims; insert editor tags where matched):
${evidenceContext}

Now produce the revised improved script. Output the script only — no preamble, no commentary about what you changed.`;
    } else {
      userPrompt = `IMPROVE THE FOLLOWING DRAFT SCRIPT.

${baseLengthInstruction}
${toneNote ? `Tone note from the creator: ${toneNote}` : ""}

## DRAFT SCRIPT (preserve intent and section flow):
${draftScript}

## RETRIEVED EVIDENCE FROM SOURCE LIBRARY (use only to support existing claims; insert editor tags where matched):
${evidenceContext}

Now produce the improved script. Apply all rules above. Output the script only — no preamble, no commentary about what you changed.`;
    }

    // Build retrieval summary for the client (collapsible reference panel)
    const referenceHits = retrievedList.map((r) => ({
      file_name: r.file_name,
      file_type: r.file_type,
      matched_query: r.query,
      excerpt: r.content.slice(0, 240),
    }));

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

    // Stream the response back. Prepend a single SSE event with reference hits as a custom marker.
    const encoder = new TextEncoder();
    const refHeader = `event: references\ndata: ${JSON.stringify(referenceHits)}\n\n`;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(refHeader));
        const reader = aiResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error("stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("improve-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
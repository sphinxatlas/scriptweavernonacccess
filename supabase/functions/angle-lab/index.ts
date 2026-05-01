import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the ANGLE LAB — a pre-brief brainstorming partner for a Harry Potter YouTube creator.

Your job is NOT to write a script, an outline longer than 5–7 bullets, or any titles.
Your job is to help the creator pick the strongest content angle BEFORE they create a Topic Brief.

SOURCE PRIORITY (STRICT — apply in this order):
1. **Competitor / commentary transcripts (PRIMARY angle discovery).** These are proven, winning concepts from large channels. Mine them HEAVILY for repeated fan debates, framing patterns, argument structures, audience hooks, recurring takes, and ideation. This is your #1 source for identifying strong angles.
2. **HP Topic Transcripts (secondary, topic-specific signals).** Useful for fan debate context and topic-specific signal. Lower priority than commentary, but still valuable.
3. **Books and movie transcripts (canon validation).** Use to check whether each angle has enough canon support and evidence potential to sustain a full video. They are not the source of the angle — they are the reality check.
4. **Lexicon (secondary clarification only).** Mention only when genuinely useful.
5. **Script writing document / instructions (script viability lens).** Use to judge angle quality through the lens of structure, retention, and script viability — never as canon.

HARD RULES:
- Never invent canon. If you cite a book or movie scene, it must appear in the provided excerpts. If canon support is missing, say so honestly.
- Commentary / theory transcripts can inspire theories and framing, but they are NEVER treated as canon.
- Do NOT copy phrasing from competitor / commentary transcripts.
- Always identify which proposed ideas ALREADY appear in successful competitor/commentary videos (proven concept) vs. which are fresh.

OUTPUT RULES:
- No titles. No script. No long outline.
- Be practical, opinionated, and concrete.
- Use the exact markdown structure below.

## Per-Direction Analysis
For EACH direction the creator listed (and 1–2 strong directions you discover from the transcripts if the creator left the field blank), produce:

### Direction: [name of the direction]
- **Core angle:** One tight sentence stating the actual angle.
- **Why it could work as a video:** 2–4 sentences grounded in what the transcripts and canon excerpts actually show.
- **Competitor transcript signals:** Specific framings, recurring takes, debates, or argument structures from the commentary transcripts that prove this angle works. Reference channel / video title when possible. Note whether this is a PROVEN concept (already appears in successful videos) or a FRESH take.
- **HP topic transcript signals:** Relevant fan debate context or topic-specific signal from the HP Topic Transcripts. Skip if not relevant.
- **Canon evidence potential:** Specific scenes, books, films, or character moments that could support this angle. Cite source files. Be honest if canon support looks thin.
- **Possible weak spots or risks:** Where the angle gets thin, circular, overdone, or where canon may push back.
- **Quick script shape:** 3–5 bullets max — rough beat structure (hook → escalation → payoff). Not a full outline.
- **Recommendation score:** X / 10, with a one-line reason.

## Best Recommended Angle
- **Recommended angle:** [the chosen direction, in plain words]
- **Why this is the strongest option:** 3–5 sentences explaining why this beats the others on evidence + audience interest + argument strength.
- **Suggested argument structure (5–7 bullets):**
  - bullet 1
  - bullet 2
  - ... up to 7 maximum, never more

## Creative Brief Handoff Text
Write a clean, copy-pasteable angle note (one tight paragraph or a short structured block, ~80–160 words) that the creator can drop directly into the "Angle Note" field of a Topic Brief. It must:
- State the central claim / thesis of the video.
- Name the main argument route.
- Mention the key canon territory it will draw from.
- Mention the strongest theory or fan-debate hook it leans on.
- Stay neutral on title / packaging — this is the angle, not the title.

Do not output anything after the handoff text.`;

const NICHE_TRANSFER_SYSTEM_PROMPT = `You are the ANGLE LAB — NICHE TRANSFER MODE — a pre-brief brainstorming partner for a Harry Potter YouTube creator.

The creator has supplied a transcript from a successful video in a DIFFERENT niche. Your job is to extract the underlying content mechanic, structure, emotional hook, argument pattern, and audience promise from that outside-niche video, and then propose Harry Potter angle ideas that would replicate that mechanic — NOT the topic.

ABSOLUTE RULES:
- The outside niche transcript is NEVER evidence. Never cite it as a source for any Harry Potter claim.
- Never copy the outside niche topic literally. Do not force a Harry Potter equivalent if the transfer is weak — say so honestly.
- Never invent canon. If you reference a book or movie scene, it must appear in the provided HP excerpts. If canon support is missing, say so.
- Commentary / theory transcripts can inspire framing, but they are NEVER treated as canon.
- Do NOT copy phrasing from competitor / commentary transcripts.
- No titles. No script. No long outline.

SOURCE HIERARCHY FOR THIS MODE (STRICT):
1. Outside niche transcript → structure / mechanic inspiration ONLY.
2. HP competitor / commentary transcripts (PRIMARY ideation signal — proven audience interest).
3. HP topic transcripts (strong supporting ideation signal — fan debate context).
4. Books / movie transcripts → evidence validation and contradiction testing only.
5. Script writing guidance → judge whether the angle has a strong viewer question, escalation, re-hooks, payoff, and YouTube-native structure.
6. Host persona / Melty → evaluate voice compatibility and possible delivery only. Not evidence.

OUTPUT — use the EXACT markdown structure below, in order:

## Extracted Mechanic From Outside Niche Reference
- Core viewer question:
- Emotional engine:
- Content mechanic:
- Structure pattern:
- Type of payoff:
- Why this worked in its original niche:
- What should be transferred into Harry Potter:
- What should NOT be transferred:

## Harry Potter Angle Matches
(Propose 3–5 distinct HP angle options. For EACH, use this structure:)

### Angle Option: [specific Harry Potter idea]
- Core angle:
- Why this matches the outside-niche mechanic:
- Competitor/commentary transcript signals:
- Canon evidence potential:
- Possible weak spots or risks:
- Quick script shape:
  - Hook:
  - Context:
  - Escalation:
  - Climax:
  - Payoff:
- Why this could work for Melty:
- Recommendation score: X / 10

## Best Transfer Recommendation
- Best HP angle:
- Why this is the strongest:
- What makes it proven:
- What makes it fresh:
- What evidence is needed before creating the Topic Brief:

## Topic Brief Handoff
(One clean, copy-pasteable block, ~120–200 words, ready to drop into the Topic Brief angle description. It must include: the chosen angle, the audience question, the emotional arc, the core argument, the strongest evidence directions, the intended payoff, and any warnings about weak evidence or theory framing. Stay neutral on title/packaging.)

Do not output anything after the Topic Brief Handoff.`;

async function fetchChunksByType(supabase: any, fileType: string, queries: string[], perQuery: number) {
  // Run a few text searches per type and merge.
  const results = await Promise.all(
    queries.map((q) =>
      supabase.rpc("search_chunks_by_type", {
        search_query: q,
        source_type: fileType,
        max_results: perQuery,
      }),
    ),
  );
  const merged = new Map<string, any>();
  results.forEach((r: any, idx: number) => {
    (r.data || []).forEach((row: any) => {
      const existing = merged.get(row.id);
      if (!existing || (row.rank ?? 0) > (existing.rank ?? 0)) {
        merged.set(row.id, { ...row, _matched_query: queries[idx] });
      }
    });
  });
  return Array.from(merged.values()).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
}

async function fetchAllByType(supabase: any, fileType: string, limit: number) {
  const { data } = await supabase
    .from("source_files")
    .select("id, name, file_type")
    .eq("file_type", fileType)
    .limit(limit);
  return data || [];
}

function formatChunks(chunks: any[], cap: number, perChunkChars: number) {
  return chunks
    .slice(0, cap)
    .map(
      (c: any) =>
        `- [${c.file_name}] (matched: "${c._matched_query}")\n${(c.content || "").slice(0, perChunkChars)}`,
    )
    .join("\n\n");
}

function clipText(s: string, max: number) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "\n…(truncated)" : s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      workingIdea,
      directions,
      notes,
      nicheTranscript,
      nicheContext,
      formatReferenceIds,
      topicTranscriptIds,
      alternativeSourceIds,
    } = await req.json();
    const isNicheTransfer = !!(nicheTranscript && typeof nicheTranscript === "string" && nicheTranscript.trim());
    if (!isNicheTransfer && (!workingIdea || typeof workingIdea !== "string" || !workingIdea.trim())) {
      return new Response(JSON.stringify({ error: "workingIdea is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query pack from inputs
    const directionLines: string[] = (directions || "")
      .split("\n")
      .map((l: string) => l.replace(/^[-*•\s]+/, "").trim())
      .filter(Boolean);

    const baseQueries = [workingIdea?.trim(), ...directionLines].filter(Boolean).slice(0, 8);
    if (baseQueries.length === 0) {
      // Fall back to generic HP angle queries when working idea is empty (niche transfer w/o seed)
      baseQueries.push(
        "Harry Potter mystery plot hole",
        "Harry Potter character motivation",
        "Harry Potter magic system contradiction",
        "Harry Potter fan debate theory",
      );
    }

    // PRIORITY 1: heaviest weight on competitor/commentary (proven angles).
    // PRIORITY 2: HP topic transcripts.
    // PRIORITY 3: books + movies (canon validation).
    // PRIORITY 4: lexicon.
    // PRIORITY 5: script writing instructions (viability lens).
    const [
      commentaryChunks,
      bookChunks,
      movieChunks,
      lexiconChunks,
      instructionsChunks,
      scriptStrategyChunks,
    ] = await Promise.all([
      fetchChunksByType(supabase, "competitor_analysis", baseQueries, 12),
      fetchChunksByType(supabase, "book", baseQueries, 5),
      fetchChunksByType(supabase, "transcript", baseQueries, 5),
      fetchChunksByType(supabase, "lexicon", baseQueries, 3),
      fetchChunksByType(supabase, "instructions", baseQueries, 3),
      fetchChunksByType(supabase, "script_strategy", baseQueries, 3),
    ]);

    // Secondary source selections — only fetch what the user explicitly picked.
    const formatIds: string[] = Array.isArray(formatReferenceIds) ? formatReferenceIds : [];
    const topicIds: string[] = Array.isArray(topicTranscriptIds) ? topicTranscriptIds : [];
    const altIds: string[] = Array.isArray(alternativeSourceIds) ? alternativeSourceIds : [];

    const [
      { data: allTopicTranscripts },
      { data: allFormatTranscripts },
      { data: allAltSources },
    ] = await Promise.all([
      topicIds.length
        ? supabase
            .from("brief_topic_transcripts")
            .select("channel_name, video_title, transcript")
            .in("id", topicIds)
        : Promise.resolve({ data: [] as any[] }),
      formatIds.length
        ? supabase
            .from("format_reference_transcripts")
            .select("channel_name, video_title, transcript")
            .in("id", formatIds)
        : Promise.resolve({ data: [] as any[] }),
      altIds.length
        ? supabase
            .from("alternative_sources")
            .select("title, source_type, source_author, url, content, notes")
            .in("id", altIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const topicTranscripts = allTopicTranscripts;

    const commentaryBlock = commentaryChunks.length
      ? formatChunks(commentaryChunks, 20, 1000)
      : "(No commentary transcript matches found.)";
    const bookBlock = bookChunks.length
      ? formatChunks(bookChunks, 10, 700)
      : "(No book matches found.)";
    const movieBlock = movieChunks.length
      ? formatChunks(movieChunks, 10, 700)
      : "(No movie transcript matches found.)";
    const lexiconBlock = lexiconChunks.length
      ? formatChunks(lexiconChunks, 6, 500)
      : "(No lexicon matches found.)";
    const scriptGuidanceChunks = [...instructionsChunks, ...scriptStrategyChunks];
    const scriptGuidanceBlock = scriptGuidanceChunks.length
      ? formatChunks(scriptGuidanceChunks, 6, 600)
      : "(No script writing guidance matches found.)";

    const topicBlock = (topicTranscripts || []).length
      ? (topicTranscripts as any[])
          .map(
            (t) =>
              `### HP Topic Transcript: "${t.video_title}" by ${t.channel_name}\n${clipText(t.transcript, 3500)}`,
          )
          .join("\n\n---\n\n")
      : "(No HP topic transcripts selected.)";

    const formatBlock = (allFormatTranscripts || []).length
      ? (allFormatTranscripts as any[])
          .map(
            (t) =>
              `### Format Reference Transcript: "${t.video_title}" by ${t.channel_name}\n${clipText(t.transcript, 3500)}`,
          )
          .join("\n\n---\n\n")
      : "(No format reference transcripts selected.)";

    const altBlock = (allAltSources || []).length
      ? (allAltSources as any[])
          .map((s) => {
            const meta = [s.source_type, s.source_author, s.url].filter(Boolean).join(" · ");
            const useCase = s.notes ? `\nUse case: ${s.notes}` : "";
            return `### Alternative Source: "${s.title}"${meta ? `\n(${meta})` : ""}${useCase}\n${clipText(s.content, 4000)}`;
          })
          .join("\n\n---\n\n")
      : "";

    const altSection = altBlock
      ? `\n\n## Alternative Sources: secondary audience/context material. Use for fandom signals, humor, memes, audience language, cultural context, and angle inspiration. Do not treat as canon. Do not use to override books or movie transcripts.\n${altBlock}\n`
      : "";

    const nicheTranscriptClipped = isNicheTransfer ? clipText(nicheTranscript.trim(), 16000) : "";
    const nicheContextClean = (nicheContext || "").toString().trim();

    const standardUserMessage = `## Creator Inputs

**Working idea (required):**
${(workingIdea || "").trim()}

**Possible topics / directions (optional):**
${directionLines.length ? directionLines.map((d: string) => `- ${d}`).join("\n") : "(none provided — feel free to surface 2–3 strong directions from the transcripts)"}

**My notes / instinct (optional):**
${(notes || "").trim() || "(none provided)"}

---

## PRIORITY 1 — Competitor / Commentary Transcripts (PRIMARY angle discovery — proven, winning concepts)
${commentaryBlock}

## PRIORITY 1b — Format Reference Transcripts (full library — proven video formats / framings)
${formatBlock}

## PRIORITY 2 — HP Topic Transcripts (full library — fan debate + topic signals)
${topicBlock}

## PRIORITY 3 — Book Excerpts (canon validation)
${bookBlock}

## PRIORITY 3 — Movie Transcript Excerpts (canon validation)
${movieBlock}

## PRIORITY 4 — Lexicon Snippets (secondary clarification only)
${lexiconBlock}

## PRIORITY 5 — Script Writing Guidance (viability lens — structure, retention, hooks)
${scriptGuidanceBlock}
${altSection}
---

Now run the Angle Lab analysis using the structure defined in the system prompt. Mine PRIORITY 1 hardest for proven angles, then layer in the rest. Remember: no titles, no script, no outline longer than 5–7 bullets.`;

    const nicheUserMessage = `## NICHE TRANSFER MODE

The creator wants to adapt a proven content mechanic from another niche into a Harry Potter angle.

## Outside Niche Reference (MECHANIC INSPIRATION ONLY — never cite as evidence, never copy the topic)
${nicheContextClean ? `**Context / channel / video:** ${nicheContextClean}\n\n` : ""}**Transcript:**
${nicheTranscriptClipped}

---

## Creator Seed Inputs (optional steering)

**Working HP idea (optional):**
${(workingIdea || "").trim() || "(none — feel free to surface fresh HP angles that fit the mechanic)"}

**Possible HP topics / directions (optional):**
${directionLines.length ? directionLines.map((d: string) => `- ${d}`).join("\n") : "(none provided)"}

**My notes / instinct (optional):**
${(notes || "").trim() || "(none provided)"}

---

## PRIORITY 2 — HP Competitor / Commentary Transcripts (PRIMARY ideation signal — proven HP audience interest)
${commentaryBlock}

## PRIORITY 2b — Format Reference Transcripts (proven video formats / framings)
${formatBlock}

## PRIORITY 3 — HP Topic Transcripts (fan debate + topic signals)
${topicBlock}

## PRIORITY 4 — Book Excerpts (canon validation only)
${bookBlock}

## PRIORITY 4 — Movie Transcript Excerpts (canon validation only)
${movieBlock}

## PRIORITY 5 — Script Writing Guidance (viability lens — viewer question, escalation, re-hooks, payoff)
${scriptGuidanceBlock}

## Lexicon Snippets (secondary clarification only)
${lexiconBlock}
${altSection}
---

Now run NICHE TRANSFER ANALYSIS using the EXACT output structure from the system prompt. Extract the mechanic from the outside niche transcript first, then propose 3–5 HP angle options that replicate the mechanic — never the topic. Prioritize HP angles with proven competitor/commentary signal. Be honest if the transfer is weak.`;

    const userMessage = isNicheTransfer ? nicheUserMessage : standardUserMessage;
    const systemPrompt = isNicheTransfer ? NICHE_TRANSFER_SYSTEM_PROMPT : SYSTEM_PROMPT;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err: any) {
    console.error("angle-lab error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
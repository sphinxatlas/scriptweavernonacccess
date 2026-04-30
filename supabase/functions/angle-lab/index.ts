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

SOURCE USE RULES (CRITICAL):
- Commentary transcripts (competitor_analysis files) and brief-specific HP topic transcripts are your PRIMARY material for discovering repeated fan debates, common explanations, possible theories, audience interest, and strong argument routes. Lean on them heavily for angle inspiration.
- Books and movie transcripts are used to SENSE-CHECK whether each angle has enough canon support to sustain a full video. They are not the source of the angle — they are the reality check.
- Lexicon is optional context. Mention only when genuinely useful.
- Never invent canon. If you cite a book or movie scene, it must appear in the provided source excerpts. If you cannot find canon support, say so honestly.
- Commentary and topic transcript material can inspire angles even without direct canon confirmation, but flag any claim that would need primary canon to hold up in the final video.
- Do NOT copy phrasing from competitor / commentary transcripts.

OUTPUT RULES:
- No titles. No script. No long outline.
- Be practical, opinionated, and concrete.
- Use the exact markdown structure below.

## Per-Direction Analysis
For EACH direction the creator listed (and 1–2 strong directions you discover from the transcripts if the creator left the field blank), produce:

### Direction: [name of the direction]
- **Angle strength:** High / Medium / Low
- **Why it could work:** 2–4 sentences grounded in what the transcripts and canon excerpts actually show.
- **Main argument route:** The single clearest line of argument this video would follow.
- **Useful canon evidence to look for:** Specific scenes, books, films, or character moments to mine. Cite the source files where relevant.
- **Useful commentary / theory material:** Specific theories, debates, or framings from the commentary / HP topic transcripts that fuel this angle. Reference the channel or video title when possible.
- **Weak spots or risks:** Where the angle gets thin, where canon may push back, where it could feel circular or like a known take.
- **Full video potential:** Yes / Maybe / No — with a one-sentence reason.

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
    const { workingIdea, directions, notes } = await req.json();
    if (!workingIdea || typeof workingIdea !== "string" || !workingIdea.trim()) {
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

    const baseQueries = [workingIdea.trim(), ...directionLines].filter(Boolean).slice(0, 8);
    if (baseQueries.length === 0) baseQueries.push(workingIdea.trim());

    // Heavy weight on commentary + topic transcripts; lighter on canon for sense-check
    const [commentaryChunks, bookChunks, movieChunks, lexiconChunks] = await Promise.all([
      fetchChunksByType(supabase, "competitor_analysis", baseQueries, 8),
      fetchChunksByType(supabase, "book", baseQueries, 5),
      fetchChunksByType(supabase, "transcript", baseQueries, 5),
      fetchChunksByType(supabase, "lexicon", baseQueries, 3),
    ]);

    // Pull ALL brief-specific HP topic transcripts (not linked to any brief here — Angle Lab is pre-brief)
    const { data: topicTranscripts } = await supabase
      .from("brief_topic_transcripts")
      .select("channel_name, video_title, transcript")
      .order("created_at", { ascending: false })
      .limit(8);

    const commentaryBlock = commentaryChunks.length
      ? formatChunks(commentaryChunks, 16, 900)
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

    const topicBlock = (topicTranscripts || []).length
      ? (topicTranscripts as any[])
          .map(
            (t) =>
              `### HP Topic Transcript: "${t.video_title}" by ${t.channel_name}\n${clipText(t.transcript, 4000)}`,
          )
          .join("\n\n---\n\n")
      : "(No brief-specific HP topic transcripts uploaded.)";

    const userMessage = `## Creator Inputs

**Working idea (required):**
${workingIdea.trim()}

**Possible topics / directions (optional):**
${directionLines.length ? directionLines.map((d: string) => `- ${d}`).join("\n") : "(none provided — feel free to surface 2–3 strong directions from the transcripts)"}

**My notes / instinct (optional):**
${(notes || "").trim() || "(none provided)"}

---

## Commentary Transcripts (PRIMARY for angle inspiration — fan debates, theories, common takes)
${commentaryBlock}

## Brief-Specific HP Topic Transcripts (PRIMARY for angle inspiration — research leads, theories)
${topicBlock}

## Book Excerpts (canon sense-check)
${bookBlock}

## Movie Transcript Excerpts (canon sense-check)
${movieBlock}

## Lexicon Snippets (optional context)
${lexiconBlock}

---

Now run the Angle Lab analysis using the structure defined in the system prompt. Remember: no titles, no script, no outline longer than 5–7 bullets.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
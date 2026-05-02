import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SourceType = "book" | "transcript" | "lexicon" | "competitor_analysis";

interface RequestBody {
  briefId: string;
  pastedScript: string;
  editorNotes?: string;
  prioritizeExactFilmTimestamps?: boolean;
  includeBookQuoteInserts?: boolean;
  includeContextualBrollIdeas?: boolean;
}

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","of","in","on","to","and","or","but","for","with","at","by","from",
  "this","that","these","those","it","its","be","been","being","as","if","then","than","so","do","does","did",
  "can","could","should","would","may","might","will","just","about","into","over","after","before","still",
  "where","what","when","why","how","which","who","whom","whose","i","you","he","she","they","we","my","your",
  "really","exactly","ever","also","there","here","not","no","yes","any","some","all","both","every","each",
  "between","because","versus","vs","-","–","like","get","got","one","two","very","much","many","more","most",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9'’]+/g) || []).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function dedupeStrings(arr: string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a.trim());
    if (out.length >= max) break;
  }
  return out;
}

// Split pasted script into beats. Use blank-line paragraphs; if a paragraph is
// huge, split further by sentence groups so each beat is workable for matching.
function segmentScript(script: string): string[] {
  const paragraphs = script
    .split(/\n\s*\n+/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const beats: string[] = [];
  const MAX = 900;
  for (const p of paragraphs) {
    if (p.length <= MAX) { beats.push(p); continue; }
    const sentences = p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [p];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > MAX && buf) {
        beats.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) beats.push(buf.trim());
  }
  // Cap total beats so we don't blow the prompt.
  return beats.slice(0, 40);
}

function makeExcerpt(content: string, terms: string[], max = 360): string {
  if (!content) return "";
  const lower = content.toLowerCase();
  const step = Math.max(60, Math.floor(max / 3));
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < content.length; i += step) {
    const window = lower.slice(i, i + max);
    let score = 0;
    for (const t of terms) if (window.includes(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) bestIdx = 0;
  let start = bestIdx;
  const back = content.slice(Math.max(0, bestIdx - 80), bestIdx);
  const lastBreak = Math.max(back.lastIndexOf(". "), back.lastIndexOf("! "), back.lastIndexOf("? "), back.lastIndexOf("\n"));
  if (lastBreak >= 0) start = Math.max(0, bestIdx - 80) + lastBreak + 1;
  let excerpt = content.slice(start, start + max).trim();
  const lastEnd = Math.max(excerpt.lastIndexOf("."), excerpt.lastIndexOf("!"), excerpt.lastIndexOf("?"));
  if (lastEnd > max * 0.5) excerpt = excerpt.slice(0, lastEnd + 1);
  return excerpt.replace(/\s+/g, " ").trim();
}

async function llmQueryExpansion(beatText: string, briefThesis: string, lovableKey: string): Promise<string[]> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You generate keyword search queries for a Harry Potter source library (books, movie transcripts, lexicon, commentary). Given a script beat, output ONLY a JSON object {\"queries\": string[]} with 5-10 short search queries (1-5 words each). Include character names, object names, scene/event names, locations, and key concepts implied by the beat. No explanations.",
          },
          { role: "user", content: `Brief thesis (context): ${briefThesis}\n\nScript beat:\n${beatText}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.queries)) return parsed.queries.filter((q: any) => typeof q === "string");
  } catch (_e) { /* fall through */ }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as RequestBody;
    const briefId = (body?.briefId || "").trim();
    const pastedScript = (body?.pastedScript || "").trim();
    if (!briefId) {
      return new Response(JSON.stringify({ error: "briefId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pastedScript.length < 100) {
      return new Response(JSON.stringify({ error: "Pasted script is too short. Paste a working draft (≥100 characters)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const editorNotes = (body.editorNotes || "").trim();
    const optPrioritizeFilm = body.prioritizeExactFilmTimestamps !== false;
    const optBookQuotes = body.includeBookQuoteInserts !== false;
    const optBroll = body.includeContextualBrollIdeas !== false;

    // Brief context
    const { data: brief, error: briefErr } = await supabase
      .from("topic_briefs").select("*").eq("id", briefId).single();
    if (briefErr || !brief) throw new Error("Brief not found");

    // Pipeline outputs (read-only context)
    const { data: outputs } = await supabase
      .from("pipeline_outputs").select("step_type, content").eq("brief_id", briefId);
    const outMap: Record<string, string> = {};
    for (const o of (outputs || []) as any[]) outMap[o.step_type] = o.content || "";

    // Segment the pasted script
    const beats = segmentScript(pastedScript);

    // Build a global query pack from script + brief fields
    const globalTerms = dedupeStrings(
      [
        ...tokenize(brief.title || ""),
        ...tokenize(brief.thesis || ""),
        ...tokenize(brief.angle_note || ""),
        ...tokenize(brief.description || ""),
        ...(brief.characters || []),
        ...(brief.focus_areas || []),
      ],
      30,
    );

    // Per-beat retrieval — uses LLM-expanded queries + beat tokens.
    type Hit = {
      beatIndex: number;
      sourceType: SourceType;
      fileName: string;
      chunkIndex: number;
      content: string;
      excerpt: string;
      rank: number;
    };

    const beatHits: Hit[] = [];

    // Throttle concurrency to avoid overloading the gateway / DB
    const BEAT_CONCURRENCY = 4;
    let cursor = 0;
    async function processBeat(i: number) {
      const beat = beats[i];
      const beatTokens = tokenize(beat);
      const llmQs = await llmQueryExpansion(beat, brief.thesis || brief.title || "", lovableKey);
      const queries = dedupeStrings(
        [
          ...llmQs,
          ...(beatTokens.slice(0, 8)),
          // 2-grams from beat
          ...beatTokens.slice(0, 12).map((t, idx) => idx > 0 ? `${beatTokens[idx - 1]} ${t}` : "").filter(Boolean),
          ...globalTerms.slice(0, 6),
        ],
        14,
      );

      const enabledTypes: SourceType[] = ["book", "transcript", "lexicon"];
      // Commentary: searched only lightly, kept as secondary
      enabledTypes.push("competitor_analysis");

      const plan: { query: string; sourceType: SourceType; max: number }[] = [];
      for (const q of queries) {
        plan.push({ query: q, sourceType: "transcript", max: 4 });
        plan.push({ query: q, sourceType: "book", max: 4 });
      }
      for (const q of queries.slice(0, 6)) plan.push({ query: q, sourceType: "lexicon", max: 2 });
      for (const q of queries.slice(0, 4)) plan.push({ query: q, sourceType: "competitor_analysis", max: 2 });

      const responses = await Promise.all(
        plan.map((p) => supabase.rpc("search_chunks_by_type", {
          search_query: p.query, source_type: p.sourceType, max_results: p.max,
        })),
      );

      const merged = new Map<string, any>();
      plan.forEach((_p, idx) => {
        const rows = (responses[idx].data as any[]) || [];
        for (const row of rows) {
          const prev = merged.get(row.id);
          if (!prev || (row.rank ?? 0) > (prev.rank ?? 0)) merged.set(row.id, row);
        }
      });

      // Top per type for this beat
      const byType: Record<SourceType, any[]> = { book: [], transcript: [], lexicon: [], competitor_analysis: [] };
      for (const r of merged.values()) {
        const t = r.file_type as SourceType;
        if (byType[t]) byType[t].push(r);
      }
      for (const t of Object.keys(byType) as SourceType[]) {
        byType[t].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
      }
      const topPerType = { transcript: 4, book: 4, lexicon: 2, competitor_analysis: 2 };
      const beatTermsForExcerpt = dedupeStrings([...beatTokens, ...globalTerms], 20);
      for (const t of ["transcript", "book", "lexicon", "competitor_analysis"] as SourceType[]) {
        for (const row of byType[t].slice(0, topPerType[t])) {
          beatHits.push({
            beatIndex: i,
            sourceType: t,
            fileName: row.file_name || "Unknown source",
            chunkIndex: row.chunk_index ?? 0,
            content: row.content || "",
            excerpt: makeExcerpt(row.content || "", beatTermsForExcerpt),
            rank: row.rank ?? 0,
          });
        }
      }
    }

    while (cursor < beats.length) {
      const batch: Promise<void>[] = [];
      for (let k = 0; k < BEAT_CONCURRENCY && cursor < beats.length; k++, cursor++) {
        batch.push(processBeat(cursor));
      }
      await Promise.all(batch);
    }

    // Group hits by beat for the prompt
    const hitsByBeat: Record<number, Hit[]> = {};
    for (const h of beatHits) {
      (hitsByBeat[h.beatIndex] ||= []).push(h);
    }

    // Build the synthesis prompt
    const briefSummary = [
      `Title: ${brief.title}`,
      brief.thesis ? `Thesis: ${brief.thesis}` : "",
      brief.angle_note ? `Angle: ${brief.angle_note}` : "",
      brief.target_minutes ? `Target length: ~${brief.target_minutes} min` : "",
    ].filter(Boolean).join("\n");

    const pipelineCtx = [
      outMap["evidence_table"] ? `## Evidence Table\n${outMap["evidence_table"].slice(0, 6000)}` : "",
      outMap["outline"] ? `## Outline\n${outMap["outline"].slice(0, 6000)}` : "",
      outMap["six_category_extraction"] ? `## Insights & Research (excerpt)\n${outMap["six_category_extraction"].slice(0, 4000)}` : "",
    ].filter(Boolean).join("\n\n");

    const beatsBlock = beats.map((b, i) => {
      const hs = (hitsByBeat[i] || []).slice(0, 12).map((h, j) => ({
        idx: j,
        sourceType: h.sourceType,
        fileName: h.fileName,
        chunkIndex: h.chunkIndex,
        excerpt: h.excerpt,
      }));
      return `--- BEAT ${i + 1} ---\n${b}\n\nRetrieved candidates for this beat (the ONLY allowed factual sources):\n${JSON.stringify(hs, null, 2)}`;
    }).join("\n\n");

    const optionsBlock = [
      `prioritize_exact_film_timestamps: ${optPrioritizeFilm}`,
      `include_book_quote_inserts: ${optBookQuotes}`,
      `include_contextual_broll_ideas: ${optBroll}`,
      editorNotes ? `editor_notes: ${editorNotes}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an editor-support assistant for a Harry Potter YouTube channel. Your job is to help a human video editor find the best film clips, exact timestamps (only if present in the retrieved film transcript candidates), book passages, quote-card inserts, and contextual B-roll ideas to support a near-final voiceover script.

ABSOLUTE RULES:
- Do NOT rewrite the script.
- Do NOT judge script quality.
- Do NOT add new arguments.
- Do NOT use general Harry Potter knowledge — use ONLY the retrieved candidates supplied for each beat.
- Do NOT invent canon evidence, book quotes, chapter names, scene names, or timestamps. If a film transcript candidate does not contain a timestamp string, write "Estimated" or "No direct film match" — never guess a timecode.
- Do NOT treat commentary transcripts as canon. They are framing/idea support only.
- Do NOT force a clip recommendation if no useful match exists for a beat. It is acceptable to write "No strong match — manual editor review needed".
- Prioritize usefulness for a human video editor.

SOURCE PRIORITY (when picking the Best Clip Recommendation):
1. Film transcript / subtitle (with exact timestamp when present in the retrieved excerpt)
2. Book passage / quote (only if include_book_quote_inserts is true)
3. Lexicon — secondary canon support only
4. Commentary — framing/angle support only, never canon proof
5. Contextual B-roll idea — only if include_contextual_broll_ideas is true; clearly label as NOT evidence

If prioritize_exact_film_timestamps is true, prefer film transcript matches first whenever they are relevant; include the exact timestamp range only if it appears verbatim in the retrieved excerpt; otherwise label "Estimated" with the closest scene reference, or "No direct film match".

OUTPUT FORMAT (Markdown only — no preamble, no closing remarks):

# Clip & Quote Finder

## Editor Priority List

### 1. Must-use clips
- (bullet list of the strongest film clip recommendations across all beats; reference the beat number)

### 2. Nice-to-have clips
- (bullet list)

### 3. Book quote inserts
- (bullet list; omit section if include_book_quote_inserts is false)

### 4. Contextual B-roll ideas
- (bullet list; omit section if include_contextual_broll_ideas is false; label each as contextual, not evidence)

### 5. Moments needing manual timestamp verification
- (bullet list of beats where timestamps are estimated or absent)

## Per-Beat Recommendations

| # | Script Beat | Script Line / Segment | Best Clip Recommendation | Exact Timestamp | Source Type | Source File | Exact Finding | Why It Fits | Editor Use | Confidence | Notes / Caveats |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | Film transcript / Book / Lexicon / Commentary / Contextual B-roll | ... | ... | ... | primary clip / quick cutaway / quote card / visual proof / atmospheric B-roll / contrast insert / reaction beat / context setup / transition visual | High / Medium / Low | ... |

- Exact Finding for film: subtitle/dialogue/scene line copied verbatim from the retrieved excerpt.
- Exact Finding for book: exact passage if present in the retrieved excerpt; otherwise write "exact quote needed" plus the best chapter/passage reference inferable from the file name.
- Exact Finding for lexicon/commentary: the relevant retrieved line.
- Exact Finding for contextual B-roll: describe the visual and write "(contextual — not evidence)".
- One row per beat. If multiple strong matches exist for a beat, use the strongest as the row and list secondaries in Notes / Caveats.
- Use "No direct film match" or "No strong match — manual editor review needed" honestly when retrieval is weak.`;

    const userPrompt = `BRIEF\n${briefSummary}\n\nOPTIONS\n${optionsBlock}\n\nPIPELINE CONTEXT (read-only)\n${pipelineCtx || "(none)"}\n\nPASTED SCRIPT BEATS WITH RETRIEVED CANDIDATES\n${beatsBlock}`;

    const llmResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!llmResp.ok) {
      if (llmResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (llmResp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await llmResp.text();
      throw new Error(`AI gateway failed: ${llmResp.status} ${t.slice(0, 300)}`);
    }
    const llmJson = await llmResp.json();
    const outputMarkdown: string = llmJson.choices?.[0]?.message?.content || "";

    if (!outputMarkdown.trim()) {
      throw new Error("Empty response from AI");
    }

    // Persist (replace prior run for this brief — keep most recent only)
    await supabase.from("clip_quote_finder_runs").delete().eq("brief_id", briefId);
    const { data: saved, error: saveErr } = await supabase
      .from("clip_quote_finder_runs")
      .insert({
        brief_id: briefId,
        pasted_script: pastedScript,
        editor_notes: editorNotes || null,
        prioritize_exact_film_timestamps: optPrioritizeFilm,
        include_book_quote_inserts: optBookQuotes,
        include_contextual_broll_ideas: optBroll,
        output_markdown: outputMarkdown,
      })
      .select()
      .single();
    if (saveErr) console.error("save failed", saveErr);

    return new Response(
      JSON.stringify({
        id: saved?.id ?? null,
        outputMarkdown,
        beatCount: beats.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("find-clips-quotes error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Find Clips & Quotes failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
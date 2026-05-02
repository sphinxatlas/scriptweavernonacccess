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
      return `--- SCRIPT SEGMENT ${i + 1} (internal reference only — do NOT mention segment numbers in the output) ---\n${b}\n\nRetrieved candidates for this segment (the ONLY allowed factual sources):\n${JSON.stringify(hs, null, 2)}`;
    }).join("\n\n");

    const optionsBlock = [
      `prioritize_exact_film_timestamps: ${optPrioritizeFilm}`,
      `include_book_quote_inserts: ${optBookQuotes}`,
      `include_contextual_broll_ideas: ${optBroll}`,
      editorNotes ? `editor_notes: ${editorNotes}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are producing a clean editor handoff for a Harry Potter YouTube video. The reader is a human video editor — not a writer, not an analyst. They need to know exactly what footage, quote, or B-roll to use, where to find it, and why it supports the script.

ABSOLUTE RULES:
- Do NOT rewrite, judge, or extend the script.
- Do NOT use general Harry Potter knowledge — use ONLY the retrieved candidates supplied with each script segment.
- Do NOT invent timestamps, quotes, chapter names, scene names, or source files. If a film transcript candidate does not contain an explicit timestamp string (e.g. "00:57:49,815 → 00:57:54,835"), do NOT make one up — either leave Timestamp blank, write "scene reference only", or move the item to "Manual Verification Needed".
- Do NOT treat commentary transcripts as canon. They are framing/idea support only and should rarely appear in the editor handoff at all.
- Do NOT force a recommendation. If retrieval is weak for a part of the script, say so honestly.

STYLE RULES (very important):
- Do NOT mention "beats", "Beat 1", "Beat 14", "script beat", "per-beat", "segment 1", "pipeline", "evidence type", "emotional function", or any internal/AI-pipeline language.
- Do NOT output a giant 11-column table. Use clean clip cards with simple labels.
- Use practical editor labels for clip purposes (e.g. "Establish the Map's power", "Proves Lupin sees Pettigrew", "Shows Ron and Scabbers", "Visualizes Hogwarts paranoia", "Quote card option", "Contextual transition").
- Each recommendation should appear in only ONE place unless it is genuinely critical enough to repeat.
- Clearly distinguish exact evidence (verbatim from a retrieved excerpt) from contextual visual support.
- Keep editor notes short, concrete, and useful.

SOURCE PRIORITY when choosing the recommended clip/quote:
1. Film transcript / subtitle (with exact timestamp ONLY when it appears verbatim in the retrieved excerpt)
2. Book passage (only if include_book_quote_inserts is true)
3. Lexicon — minor secondary support only
4. Contextual B-roll idea — only if include_contextual_broll_ideas is true; always labeled as NOT evidence
5. Commentary — almost never surface; only as a quiet framing reference if truly useful

OUTPUT FORMAT — Markdown only. No preamble, no closing remarks. Omit any section that has nothing to put in it (do not output empty sections). If a checkbox option is false, omit that section entirely.

# Clip & Quote Finder

## 1. Core Clips to Pull First

The most important film clips, in priority order. Use this exact card format for each:

### [Clip purpose — short, editor-facing label]
Film: [film name, e.g. Prisoner of Azkaban]
Timestamp: [exact range from retrieved excerpt, OR "scene reference only"]
Source file: [file name from retrieved candidate]
Use for: [where in the video this supports]
Exact line / action: ["verbatim line from retrieved excerpt" OR brief scene action description if no dialogue]
Editor note: [1–2 sentences, practical]
Confidence: High | Medium | Low

## 2. Supporting Clips

Same card format as Core Clips. Keep editor notes shorter. Skip this section if there are no genuinely useful secondary clips.

## 3. Book Quote Cards

Only include if include_book_quote_inserts is true. For each:

### [Quote purpose]
Book: [book name]
Chapter / passage: [chapter or passage reference if inferable from the retrieved file/excerpt; otherwise "unknown — verify"]
Source file: [file name]
Quote: ["verbatim from retrieved excerpt" OR "exact quote needed" if not present]
Use for: [where this card supports the script]
On-screen style suggestion: [e.g. short typographic card, parchment-style overlay, voiceover under reaction shot]
Confidence: High | Medium | Low
Verification note: [only if the exact quote is not in the retrieved excerpt or wording is uncertain]

If a quote is too long for an on-screen card, suggest the best shortened version and keep the full retrieved passage in the verification note.

## 4. Contextual B-Roll

Only include if include_contextual_broll_ideas is true. Group items by visual purpose, NOT by script segment. Use only the categories that actually have items, drawing from this list when relevant: Map / parchment visuals · Hogwarts paranoia visuals · Ron and Scabbers visuals · Fred and George visuals · Lupin / Snape tension visuals · Time-Turner / magical logic visuals · Atmospheric transition shots. Use other clearly-named categories if they fit the script better.

For each item under a category:
- Visual: [short description]
  - Use for: [where in the video]
  - Best likely film/source: [film/book name if reasonably inferable, otherwise "any HP film"]
  - Evidence status: Contextual only / not proof
  - Editor note: [short]

## 5. Manual Verification Needed

Only items that genuinely need human checking — missing timestamps, uncertain quotes, ambiguous scene references. For each:

- [Issue title]: what needs checking
  - Why it matters: [short]
  - Suggested source: [book chapter / film scene / file name]
  - Current confidence: High | Medium | Low

Skip this section entirely if nothing requires verification.

## 6. Optional Edit Flow

A simple recommended visual order for the editor, grouped as Opening / Middle / Ending. Use clip purposes and (where available) timestamps — no segment numbers, no script beats. Example item style:

Opening:
1. Ron + Scabbers setup
2. Map opening shot — 00:57:49,815 → 00:57:54,835
3. "So this map shows…? Everyone."

Keep this list short and practical. Omit the section if there isn't enough material to suggest a meaningful order.`;

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
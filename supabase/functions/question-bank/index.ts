import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SourceType = "book" | "transcript" | "lexicon" | "competitor_analysis";

interface RequestBody {
  question: string;
  sourceFilters?: {
    books?: boolean;
    transcripts?: boolean;
    lexicon?: boolean;
    commentary?: boolean;
  };
}

interface EvidenceRow {
  sourceType: SourceType;
  sourceName: string;
  location: string;
  exactFinding: string;
  whatItProves: string;
  evidenceStrength: "Strong" | "Medium" | "Weak";
  canonWeight: "Primary canon" | "Canon support" | "Commentary only";
  notes?: string;
}

const CANON_WEIGHT: Record<SourceType, EvidenceRow["canonWeight"]> = {
  book: "Primary canon",
  transcript: "Primary canon",
  lexicon: "Canon support",
  competitor_analysis: "Commentary only",
};

const SOURCE_LABEL: Record<SourceType, string> = {
  book: "Book",
  transcript: "Movie Transcript",
  lexicon: "Lexicon",
  competitor_analysis: "Commentary Transcript",
};

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","of","in","on","to","and","or","but","for","with","at","by","from",
  "this","that","these","those","it","its","be","been","being","as","if","then","than","so","do","does","did",
  "can","could","should","would","may","might","will","just","about","into","over","after","before","still",
  "where","what","when","why","how","which","who","whom","whose","i","you","he","she","they","we","my","your",
  "really","exactly","ever","also","there","here","not","no","yes","any","some","all","both","every","each",
  "between","because","versus","vs","or","-","–"
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9'’]+/g) || []).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function dedupe(arr: string[], max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const key = a.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a.trim());
    if (out.length >= max) break;
  }
  return out;
}

async function buildQueryPack(question: string, lovableKey: string): Promise<string[]> {
  // Heuristic baseline pack so we always have queries even if the LLM call fails.
  const tokens = tokenize(question);
  const baseline: string[] = [];
  baseline.push(question);
  // 2-grams
  for (let i = 0; i < tokens.length - 1; i++) {
    baseline.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  // singletons
  for (const t of tokens) baseline.push(t);

  // Ask LLM to expand into synonyms, character names, alt phrasings.
  let llmQueries: string[] = [];
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You generate keyword search queries for a Harry Potter source library (books, movie transcripts, Lexicon, commentary transcripts). Output ONLY a JSON object {\"queries\": string[]} with 8-15 short search queries. Include exact key terms, synonyms, character names, object names, event names, book/film titles if implied, timeline terms, and contradiction terms when relevant. Each query should be 1-5 words. No explanations.",
          },
          { role: "user", content: question },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.ok) {
      const json = await resp.json();
      const content = json.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.queries)) llmQueries = parsed.queries.filter((q: any) => typeof q === "string");
    }
  } catch (_e) {
    // ignore — fall back to baseline
  }

  return dedupe([...llmQueries, ...baseline], 25);
}

function makeExcerpt(content: string, question: string, max = 320): string {
  const tokens = tokenize(question);
  if (!content) return "";
  const lower = content.toLowerCase();
  let bestIdx = -1;
  let bestScore = 0;
  // Slide a window of ~max chars and score by how many query tokens appear
  const step = Math.max(60, Math.floor(max / 3));
  for (let i = 0; i < content.length; i += step) {
    const window = lower.slice(i, i + max);
    let score = 0;
    for (const t of tokens) if (window.includes(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) bestIdx = 0;
  // Snap to nearest sentence boundary
  let start = bestIdx;
  const back = content.slice(Math.max(0, bestIdx - 80), bestIdx);
  const lastBreak = Math.max(back.lastIndexOf(". "), back.lastIndexOf("! "), back.lastIndexOf("? "), back.lastIndexOf("\n"));
  if (lastBreak >= 0) start = Math.max(0, bestIdx - 80) + lastBreak + 1;
  let excerpt = content.slice(start, start + max).trim();
  // Trim to last sentence end if possible
  const lastEnd = Math.max(excerpt.lastIndexOf("."), excerpt.lastIndexOf("!"), excerpt.lastIndexOf("?"));
  if (lastEnd > max * 0.5) excerpt = excerpt.slice(0, lastEnd + 1);
  return excerpt.replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as RequestBody;
    const question = (body?.question || "").trim();
    if (!question || question.length < 3) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filters = {
      books: body.sourceFilters?.books !== false,
      transcripts: body.sourceFilters?.transcripts !== false,
      lexicon: body.sourceFilters?.lexicon !== false,
      commentary: body.sourceFilters?.commentary !== false,
    };

    const queries = await buildQueryPack(question, lovableKey);

    const enabledTypes: SourceType[] = [];
    if (filters.books) enabledTypes.push("book");
    if (filters.transcripts) enabledTypes.push("transcript");
    if (filters.lexicon) enabledTypes.push("lexicon");
    if (filters.commentary) enabledTypes.push("competitor_analysis");

    const perQuery: Record<SourceType, number> = {
      book: 6,
      transcript: 6,
      lexicon: 4,
      competitor_analysis: 4,
    };

    const plan: { query: string; sourceType: SourceType }[] = [];
    for (const t of enabledTypes) {
      // Limit commentary query breadth
      const qs = t === "competitor_analysis" ? queries.slice(0, 6) : queries;
      for (const q of qs) plan.push({ query: q, sourceType: t });
    }

    const responses = await Promise.all(
      plan.map((p) =>
        supabase.rpc("search_chunks_by_type", {
          search_query: p.query,
          source_type: p.sourceType,
          max_results: perQuery[p.sourceType],
        }),
      ),
    );

    // Merge & dedupe by chunk id, keep best rank
    const merged = new Map<string, any>();
    plan.forEach((p, idx) => {
      const rows = (responses[idx].data as any[]) || [];
      for (const row of rows) {
        const prev = merged.get(row.id);
        if (!prev || (row.rank ?? 0) > (prev.rank ?? 0)) {
          merged.set(row.id, { ...row, _matchedQuery: p.query });
        }
      }
    });

    // Group by source type & sort by rank
    const byType: Record<SourceType, any[]> = {
      book: [], transcript: [], lexicon: [], competitor_analysis: [],
    };
    for (const row of merged.values()) {
      const t = row.file_type as SourceType;
      if (!byType[t]) continue;
      byType[t].push(row);
    }
    for (const t of Object.keys(byType) as SourceType[]) {
      byType[t].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
    }

    // Take top N per type for evidence consideration
    const topPerType = { book: 5, transcript: 5, lexicon: 3, competitor_analysis: 3 };
    const candidates: any[] = [];
    for (const t of ["book", "transcript", "lexicon", "competitor_analysis"] as SourceType[]) {
      candidates.push(...byType[t].slice(0, topPerType[t]));
    }

    if (candidates.length === 0) {
      const emptyResponse = {
        answer:
          "The uploaded sources do not contain a direct confirmation. No relevant passages were found in the books, transcripts, lexicon, or commentary transcripts for this question.",
        confidence: "Low",
        canonStatus: "Unsupported by uploaded sources",
        explanation:
          "Search across the enabled source types returned no chunks matching the question's key terms.",
        scriptSafeTakeaway: "Do not make this claim in a script — uploaded sources do not support it.",
        caveats: ["Try uploading more sources or rephrasing the question with different key terms."],
        evidence: [] as EvidenceRow[],
      };
      const saved = await persist(supabase, question, emptyResponse);
      return new Response(JSON.stringify({ ...emptyResponse, entryId: saved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build evidence excerpts (deterministic, pulled from chunks — no hallucination)
    const evidenceCandidates: EvidenceRow[] = candidates.map((row) => {
      const sourceType = row.file_type as SourceType;
      const exact = makeExcerpt(row.content || "", question);
      const location = `${row.file_name || "Unknown source"}, chunk ${row.chunk_index ?? "?"}`;
      return {
        sourceType,
        sourceName: row.file_name || "Unknown source",
        location,
        exactFinding: exact,
        whatItProves: "",
        evidenceStrength: "Medium",
        canonWeight: CANON_WEIGHT[sourceType],
        notes: sourceType === "competitor_analysis"
          ? "Commentary only — not canon proof."
          : sourceType === "lexicon"
            ? "Lexicon — canon support, never overrides books or films."
            : undefined,
      };
    });

    // Ask the LLM to produce structured answer + grade evidence — strictly grounded in candidates.
    const evidenceForPrompt = evidenceCandidates.map((e, i) => ({
      idx: i,
      sourceType: SOURCE_LABEL[e.sourceType],
      canonWeight: e.canonWeight,
      sourceName: e.sourceName,
      location: e.location,
      excerpt: e.exactFinding,
    }));

    const systemPrompt = `You are a Harry Potter canon fact-checker. You answer ONLY using the provided evidence excerpts from uploaded sources. You MUST NOT use general knowledge of Harry Potter. You MUST NOT invent quotes, chapter names, timestamps, or sources.

Source hierarchy:
- Tier 1 (Primary canon): Book, Movie Transcript
- Tier 2 (Canon support): Lexicon — clarifies but never overrides Tier 1
- Tier 3 (Commentary only): Commentary Transcript — never proof of canon, only fan claims/interpretations

Rules:
- Base the factual answer mainly on Tier 1 (book + transcript), supported by Tier 2.
- Treat Tier 3 only as evidence of fan/commentary claims, never as canon proof.
- If evidence is weak or missing, say so clearly. Do not pretend.
- If books and films differ, separate them clearly.
- Confidence: High (multiple Tier-1 hits directly answer it), Medium (partial/indirect Tier-1), Low (no Tier-1 or only commentary/lexicon).
- For each evidence item, output: whatItProves (short plain explanation), evidenceStrength (Strong/Medium/Weak), and an "include" boolean — set include=false ONLY if the excerpt is clearly irrelevant to the question. Keep at least the strongest 2-6 items when available.
- Never modify exactFinding text. Reference items by idx only.

Output JSON ONLY, schema:
{
  "answer": string,
  "confidence": "High" | "Medium" | "Low",
  "canonStatus": "Confirmed in books" | "Confirmed in films" | "Confirmed in books and films" | "Book only" | "Film only" | "Adaptation difference" | "Not directly confirmed" | "Fan interpretation" | "Unsupported by uploaded sources" | "Contradicted by uploaded sources" | "Mixed evidence",
  "explanation": string,
  "scriptSafeTakeaway": string,
  "caveats": string[],
  "evidenceGrades": [{ "idx": number, "include": boolean, "whatItProves": string, "evidenceStrength": "Strong" | "Medium" | "Weak", "notes": string }]
}`;

    const userPrompt = `Question: ${question}\n\nEvidence excerpts (the ONLY allowed source of facts):\n${JSON.stringify(evidenceForPrompt, null, 2)}`;

    const llmResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!llmResp.ok) {
      const errText = await llmResp.text();
      throw new Error(`AI gateway failed: ${llmResp.status} ${errText.slice(0, 300)}`);
    }
    const llmJson = await llmResp.json();
    const parsed = JSON.parse(llmJson.choices?.[0]?.message?.content || "{}");

    const grades: Record<number, any> = {};
    for (const g of parsed.evidenceGrades || []) {
      if (typeof g?.idx === "number") grades[g.idx] = g;
    }

    let evidence: EvidenceRow[] = evidenceCandidates
      .map((e, i) => {
        const g = grades[i];
        if (g && g.include === false) return null;
        return {
          ...e,
          whatItProves: (g?.whatItProves as string) || "Relevant passage retrieved from source.",
          evidenceStrength: (g?.evidenceStrength as EvidenceRow["evidenceStrength"]) || e.evidenceStrength,
          notes: g?.notes || e.notes,
        } as EvidenceRow;
      })
      .filter(Boolean) as EvidenceRow[];

    // Sort: primary canon first (book, transcript), then lexicon, then commentary; within group by strength.
    const strengthRank = { Strong: 3, Medium: 2, Weak: 1 } as const;
    const typeRank: Record<SourceType, number> = { book: 4, transcript: 3, lexicon: 2, competitor_analysis: 1 };
    evidence.sort((a, b) => {
      const t = typeRank[b.sourceType] - typeRank[a.sourceType];
      if (t !== 0) return t;
      return strengthRank[b.evidenceStrength] - strengthRank[a.evidenceStrength];
    });

    const finalResponse = {
      answer: parsed.answer || "",
      confidence: parsed.confidence || "Low",
      canonStatus: parsed.canonStatus || "Not directly confirmed",
      explanation: parsed.explanation || "",
      scriptSafeTakeaway: parsed.scriptSafeTakeaway || "",
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats : [],
      evidence,
    };

    const entryId = await persist(supabase, question, finalResponse);

    return new Response(JSON.stringify({ ...finalResponse, entryId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("question-bank error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Question Bank failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function persist(supabase: any, question: string, r: {
  answer: string;
  confidence: string;
  canonStatus: string;
  explanation: string;
  scriptSafeTakeaway: string;
  caveats: string[];
  evidence: EvidenceRow[];
}): Promise<string | null> {
  try {
    const { data: entry, error } = await supabase
      .from("question_bank_entries")
      .insert({
        question,
        answer: r.answer,
        confidence: r.confidence,
        canon_status: r.canonStatus,
        explanation: r.explanation,
        script_safe_takeaway: r.scriptSafeTakeaway,
        caveats: r.caveats,
      })
      .select()
      .single();
    if (error) throw error;
    if (r.evidence.length > 0) {
      const rows = r.evidence.map((e, i) => ({
        entry_id: entry.id,
        source_type: e.sourceType,
        source_name: e.sourceName,
        location: e.location,
        exact_finding: e.exactFinding,
        what_it_proves: e.whatItProves,
        evidence_strength: e.evidenceStrength,
        canon_weight: e.canonWeight,
        notes: e.notes ?? null,
        position: i,
      }));
      await supabase.from("question_bank_evidence").insert(rows);
    }
    return entry.id as string;
  } catch (e) {
    console.error("persist failed", e);
    return null;
  }
}
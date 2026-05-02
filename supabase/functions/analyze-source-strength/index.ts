import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SourceTable =
  | "brief_topic_transcripts"
  | "alternative_sources"
  | "source_files";

const VALID_TABLES: SourceTable[] = [
  "brief_topic_transcripts",
  "alternative_sources",
  "source_files",
];

const MAX_SAMPLE_CHARS = 12000;

function sampleText(text: string): string {
  if (text.length <= MAX_SAMPLE_CHARS) return text;
  const head = text.slice(0, Math.floor(MAX_SAMPLE_CHARS * 0.6));
  const tail = text.slice(-Math.floor(MAX_SAMPLE_CHARS * 0.4));
  return `${head}\n\n[...middle truncated...]\n\n${tail}`;
}

async function fetchSourceText(
  supabase: ReturnType<typeof createClient>,
  table: SourceTable,
  id: string,
): Promise<{ text: string; title: string }> {
  if (table === "brief_topic_transcripts") {
    const { data, error } = await supabase
      .from("brief_topic_transcripts")
      .select("transcript, video_title, channel_name")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error("Source not found");
    return {
      text: (data as any).transcript || "",
      title: `${(data as any).channel_name} — ${(data as any).video_title}`,
    };
  }
  if (table === "alternative_sources") {
    const { data, error } = await supabase
      .from("alternative_sources")
      .select("content, title")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error("Source not found");
    return {
      text: (data as any).content || "",
      title: (data as any).title || "",
    };
  }
  // source_files (competitor_analysis): reconstruct from chunks
  const { data: file, error: fileErr } = await supabase
    .from("source_files")
    .select("name, file_type")
    .eq("id", id)
    .single();
  if (fileErr || !file) throw new Error("Source not found");
  if ((file as any).file_type !== "competitor_analysis") {
    throw new Error("Only commentary transcripts can be analyzed");
  }
  const { data: chunks, error: chunkErr } = await supabase
    .from("file_chunks")
    .select("content, chunk_index")
    .eq("file_id", id)
    .order("chunk_index", { ascending: true });
  if (chunkErr) throw new Error("Failed to load chunks");
  const text = (chunks ?? [])
    .map((c: any) => c.content)
    .join("\n\n");
  return { text, title: (file as any).name || "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { table, id } = await req.json();
    if (!table || !id) throw new Error("table and id are required");
    if (!VALID_TABLES.includes(table)) throw new Error("Invalid table");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { text, title } = await fetchSourceText(supabase, table, id);
    if (!text || text.trim().length < 200) {
      // Too short to meaningfully judge — mark limited
      await supabase.from(table).update({ script_strength: "limited" }).eq("id", id);
      return new Response(
        JSON.stringify({ script_strength: "limited", reason: "too_short" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const sample = sampleText(text);
    const systemPrompt = `You rate secondary sources for usefulness in writing Harry Potter video essay scripts.

Rate the source using exactly ONE of these labels:
- "strong": Likely useful for angles, structure, fan debate, useful framing, or script ideas. Has substantive analysis, original observations, fan perspective, or clear narrative framing.
- "useful": Has some relevant information but may need selective use. Mixed signal — some good moments, some filler.
- "limited": Mostly generic, repetitive, thin, or not very helpful for script writing. Surface-level recap, clickbait, or off-topic.

Respond with ONLY a JSON object: {"label": "strong" | "useful" | "limited"}`;

    const userPrompt = `Source title: ${title}\n\nContent sample:\n${sample}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let label: string | null = null;
    const match = raw.match(/"label"\s*:\s*"(strong|useful|limited)"/i);
    if (match) label = match[1].toLowerCase();
    else if (/\bstrong\b/i.test(raw)) label = "strong";
    else if (/\buseful\b/i.test(raw)) label = "useful";
    else if (/\blimited\b/i.test(raw)) label = "limited";

    if (!label || !["strong", "useful", "limited"].includes(label)) {
      throw new Error("Could not parse strength label from AI response");
    }

    const { error: updateErr } = await supabase
      .from(table)
      .update({ script_strength: label })
      .eq("id", id);
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ script_strength: label }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-source-strength error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
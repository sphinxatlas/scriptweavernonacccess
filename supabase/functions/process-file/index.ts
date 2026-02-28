import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of previous chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
      currentChunk = overlapWords.join(" ") + "\n\n" + trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileId } = await req.json();
    if (!fileId) throw new Error("fileId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file info
    const { data: file, error: fileError } = await supabase
      .from("source_files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) throw new Error("File not found");

    // Update status
    await supabase.from("source_files").update({ status: "processing" }).eq("id", fileId);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-files")
      .download(file.storage_path);

    if (downloadError || !fileData) throw new Error("Failed to download file");

    const text = await fileData.text();
    const chunks = chunkText(text);

    // Delete old chunks
    await supabase.from("file_chunks").delete().eq("file_id", fileId);

    // Insert new chunks in batches
    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize).map((content, idx) => ({
        file_id: fileId,
        content,
        chunk_index: i + idx,
      }));

      const { error: insertError } = await supabase.from("file_chunks").insert(batch);
      if (insertError) throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    // Update status
    await supabase.from("source_files").update({ status: "indexed" }).eq("id", fileId);

    return new Response(
      JSON.stringify({ success: true, chunksCreated: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-file error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

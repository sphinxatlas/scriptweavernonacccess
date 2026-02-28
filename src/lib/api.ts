import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SourceFile = Tables<"source_files">;
export type TopicBrief = Tables<"topic_briefs">;
export type PipelineOutput = Tables<"pipeline_outputs">;

export type PipelineStepType = "evidence_table" | "analysis_memo" | "outline" | "full_script" | "verification";

export const PIPELINE_STEPS: { type: PipelineStepType; label: string; description: string }[] = [
  { type: "evidence_table", label: "Evidence Table", description: "Extract and organize source evidence" },
  { type: "analysis_memo", label: "Analysis Memo", description: "Synthesize themes and arguments" },
  { type: "outline", label: "Script Outline", description: "Structure the video script" },
  { type: "full_script", label: "Full Script", description: "Generate the complete script" },
  { type: "verification", label: "Verification Report", description: "Fact-check against sources" },
];

export async function uploadSourceFile(file: File, fileType: "book" | "transcript" | "instructions") {
  const storagePath = `${fileType}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("source-files")
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("source_files")
    .insert({
      name: file.name,
      file_type: fileType,
      storage_path: storagePath,
      file_size: file.size,
      status: "uploaded",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function processFile(fileId: string) {
  const response = await supabase.functions.invoke("process-file", {
    body: { fileId },
  });

  if (response.error) throw response.error;
  return response.data;
}

export async function deleteSourceFile(fileId: string, storagePath: string) {
  await supabase.storage.from("source-files").remove([storagePath]);
  const { error } = await supabase.from("source_files").delete().eq("id", fileId);
  if (error) throw error;
}

export async function getSourceFiles() {
  const { data, error } = await supabase
    .from("source_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getTopicBriefs() {
  const { data, error } = await supabase
    .from("topic_briefs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTopicBrief(title: string, description: string) {
  const { data, error } = await supabase
    .from("topic_briefs")
    .insert({ title, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTopicBrief(id: string) {
  const { error } = await supabase.from("topic_briefs").delete().eq("id", id);
  if (error) throw error;
}

export async function getPipelineOutputs(briefId: string) {
  const { data, error } = await supabase
    .from("pipeline_outputs")
    .select("*")
    .eq("brief_id", briefId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function savePipelineOutput(briefId: string, stepType: PipelineStepType, content: string) {
  // Upsert - delete existing then insert
  await supabase
    .from("pipeline_outputs")
    .delete()
    .eq("brief_id", briefId)
    .eq("step_type", stepType);

  const { data, error } = await supabase
    .from("pipeline_outputs")
    .insert({ brief_id: briefId, step_type: stepType, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function streamGenerateStep(
  briefId: string,
  stepType: PipelineStepType,
  onDelta: (text: string) => void,
  onDone: () => void,
) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-step`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ briefId, stepType }),
    }
  );

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Generation failed (${resp.status})`);
  }

  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Flush remaining
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SourceFile = Tables<"source_files">;
export type TopicBrief = Tables<"topic_briefs">;
export type PipelineOutput = Tables<"pipeline_outputs">;
export type EvidencePoint = Tables<"evidence_points">;
export type ImprovedScript = Tables<"improved_scripts">;

export type PipelineStepType =
  | "creative_brief"
  | "six_category_extraction"
  | "competitor_format_analysis"
  | "retrieval"
  | "evidence_table"
  | "analysis_memo"
  | "outline"
  | "full_script"
  | "verification";

export const PIPELINE_STEPS: {
  type: PipelineStepType;
  label: string;
  description: string;
  visible: boolean;
}[] = [
  {
    type: "creative_brief",
    label: "Creative Brief",
    description: "Generates thesis, argument structure, emotional arc, and tone from your inputs.",
    visible: true,
  },
  {
    type: "six_category_extraction",
    label: "Insights & Research",
    description: "Mines canon for evidence, patterns, contradictions, subtext, and original angles.",
    visible: true,
  },
  {
    type: "evidence_table",
    label: "Evidence Table",
    description: "Curated shortlist of the strongest argument points with source citations.",
    visible: true,
  },
  {
    type: "outline",
    label: "Outline",
    description: "Full script outline with section structure, word budgets, and editor tags.",
    visible: true,
  },
  {
    type: "full_script",
    label: "Full Script",
    description: "Complete voiceover script with editor tags.",
    visible: true,
  },
  { type: "retrieval", label: "Retrieval", description: "", visible: false },
  { type: "analysis_memo", label: "Analysis Memo", description: "", visible: false },
  { type: "verification", label: "Verification", description: "", visible: false },
  { type: "competitor_format_analysis", label: "Format Analysis", description: "", visible: false },
];

export async function uploadSourceFile(file: File, fileType: "book" | "transcript" | "instructions" | "lexicon" | "competitor_analysis" | "host_persona" | "anti_ai_guide") {
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

export const TARGET_LENGTH_OPTIONS = [
  { minutes: 8, min: 1120, max: 1280, label: "8 min (1,120–1,280 words)" },
  { minutes: 10, min: 1400, max: 1600, label: "10 min (1,400–1,600 words)" },
  { minutes: 12, min: 1680, max: 1920, label: "12 min (1,680–1,920 words)" },
  { minutes: 15, min: 2100, max: 2400, label: "15 min (2,100–2,400 words)" },
  { minutes: 20, min: 2800, max: 3200, label: "20 min (2,800–3,200 words)" },
];

export interface CreateBriefInput {
  title: string;
  angle_note: string;
  target_minutes: number;
  target_min_words: number;
  target_max_words: number;
  comparison_mode: boolean;
}

export async function createTopicBrief(input: CreateBriefInput) {
  const payload = {
    ...input,
    description: input.angle_note ?? "",
  };
  const { data, error } = await supabase
    .from("topic_briefs")
    .insert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTopicBrief(id: string, input: Partial<CreateBriefInput>) {
  const payload: any = { ...input };
  if (Object.prototype.hasOwnProperty.call(input, "angle_note")) {
    payload.description = input.angle_note ?? "";
  }
  const { data, error } = await supabase
    .from("topic_briefs")
    .update(payload)
    .eq("id", id)
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

// Evidence points
export async function getEvidencePoints(briefId: string) {
  const { data, error } = await supabase
    .from("evidence_points")
    .select("*")
    .eq("brief_id", briefId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function toggleEvidenceStar(id: string, starred: boolean) {
  const { error } = await supabase
    .from("evidence_points")
    .update({ starred })
    .eq("id", id);
  if (error) throw error;
}

export async function saveEvidencePoints(briefId: string, points: Omit<EvidencePoint, "id" | "created_at">[]) {
  // Clear existing
  await supabase.from("evidence_points").delete().eq("brief_id", briefId);
  
  if (points.length > 0) {
    const { error } = await supabase.from("evidence_points").insert(points);
    if (error) throw error;
  }
}

export async function streamGenerateStep(
  briefId: string,
  stepType: PipelineStepType,
  onDelta: (text: string) => void,
  onDone: () => void,
  starredOnly?: boolean,
) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-step`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ briefId, stepType, starredOnly }),
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

// Improved scripts history
export interface CreateImprovedScriptInput {
  title: string;
  draft_script: string;
  improved_output?: string;
  target_min_words?: number | null;
  target_max_words?: number | null;
  tone_note?: string | null;
}

export async function listImprovedScripts() {
  const { data, error } = await supabase
    .from("improved_scripts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createImprovedScript(input: CreateImprovedScriptInput) {
  const { data, error } = await supabase
    .from("improved_scripts")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateImprovedScript(
  id: string,
  input: Partial<Pick<ImprovedScript, "title" | "improved_output" | "revision_count" | "tone_note" | "target_min_words" | "target_max_words" | "draft_script">>,
) {
  const { data, error } = await supabase
    .from("improved_scripts")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameImprovedScript(id: string, title: string) {
  return updateImprovedScript(id, { title });
}

export async function deleteImprovedScript(id: string) {
  const { error } = await supabase.from("improved_scripts").delete().eq("id", id);
  if (error) throw error;
}

// ── Format Reference Transcripts ──
export async function getFormatReferenceTranscripts() {
  const { data, error } = await supabase
    .from('format_reference_transcripts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveFormatReferenceTranscript(input: {
  channel_name: string;
  video_title: string;
  transcript: string;
}) {
  const { data, error } = await supabase
    .from('format_reference_transcripts')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFormatReferenceTranscript(id: string) {
  const { error } = await supabase
    .from('format_reference_transcripts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Brief Topic Transcripts ──
export async function getBriefTopicTranscripts() {
  const { data, error } = await supabase
    .from('brief_topic_transcripts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveBriefTopicTranscript(input: {
  channel_name: string;
  video_title: string;
  transcript: string;
}) {
  const { data, error } = await supabase
    .from('brief_topic_transcripts')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBriefTopicTranscript(id: string) {
  const { error } = await supabase
    .from('brief_topic_transcripts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Brief Links ──
export async function linkFormatReferencesToBrief(briefId: string, transcriptIds: string[]) {
  await supabase.from('brief_format_reference_links').delete().eq('brief_id', briefId);
  if (transcriptIds.length === 0) return;
  const { error } = await supabase.from('brief_format_reference_links').insert(
    transcriptIds.map(id => ({ brief_id: briefId, transcript_id: id }))
  );
  if (error) throw error;
}

export async function linkTopicTranscriptsToBrief(briefId: string, transcriptIds: string[]) {
  await supabase.from('brief_topic_transcript_links').delete().eq('brief_id', briefId);
  if (transcriptIds.length === 0) return;
  const { error } = await supabase.from('brief_topic_transcript_links').insert(
    transcriptIds.map(id => ({ brief_id: briefId, transcript_id: id }))
  );
  if (error) throw error;
}

export async function getBriefFormatReferences(briefId: string) {
  const { data, error } = await supabase
    .from('brief_format_reference_links')
    .select('transcript_id, format_reference_transcripts(*)')
    .eq('brief_id', briefId);
  if (error) throw error;
  return (data || []).map((r: any) => r.format_reference_transcripts).filter(Boolean);
}

export async function getBriefTopicTranscriptLinks(briefId: string) {
  const { data, error } = await supabase
    .from('brief_topic_transcript_links')
    .select('transcript_id, brief_topic_transcripts(*)')
    .eq('brief_id', briefId);
  if (error) throw error;
  return (data || []).map((r: any) => r.brief_topic_transcripts).filter(Boolean);
}

export async function updateBriefCreativeBriefFields(briefId: string, updates: {
  creative_brief_feedback?: string;
  creative_brief_approved?: boolean;
}) {
  const { error } = await supabase
    .from('topic_briefs')
    .update(updates)
    .eq('id', briefId);
  if (error) throw error;
}

export interface ReferenceHit {
  file_name: string;
  file_type: string;
  matched_query: string;
  excerpt: string;
}

export async function streamImproveScript(
  input: {
    draftScript: string;
    targetMinWords?: number;
    targetMaxWords?: number;
    toneNote?: string;
    mode?: "initial" | "lengthen" | "feedback";
    previousOutput?: string;
    feedbackNote?: string;
  },
  onDelta: (text: string) => void,
  onDone: () => void,
  onReferences?: (refs: ReferenceHit[]) => void,
) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/improve-script`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Improve failed (${resp.status})`);
  }
  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;
  let pendingEvent: string | null = null;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") {
        pendingEvent = null;
        continue;
      }
      if (line.startsWith("event: ")) {
        pendingEvent = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      if (pendingEvent === "references") {
        try {
          const refs = JSON.parse(jsonStr) as ReferenceHit[];
          onReferences?.(refs);
        } catch { /* ignore */ }
        pendingEvent = null;
        continue;
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

  onDone();
}

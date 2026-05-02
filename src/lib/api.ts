import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SourceFile = Tables<"source_files">;
export type TopicBrief = Tables<"topic_briefs">;
export type PipelineOutput = Tables<"pipeline_outputs">;
export type ImprovedScript = Tables<"improved_scripts">;

export type PipelineStepType =
  | "creative_brief"
  | "six_category_extraction"
  | "competitor_format_analysis"
  | "retrieval"
  | "selected_source_analysis"
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
    type: "selected_source_analysis",
    label: "Selected Source Analysis",
    description: "Pressure-tests the angle against the secondary sources selected for this brief — surfaces fan signals, overused angles, objections, and original synthesis routes. Never canon proof.",
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

// Reconstruct full text content of an uploaded source file from its indexed chunks.
export async function getSourceFileContent(fileId: string): Promise<string> {
  const { data, error } = await supabase
    .from("file_chunks")
    .select("content, chunk_index")
    .eq("file_id", fileId)
    .order("chunk_index", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => c.content).join("\n\n");
}

// Get a short-lived signed URL to download the original uploaded file from storage.
export async function getSourceFileDownloadUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from("source-files")
    .createSignedUrl(storagePath, expiresInSeconds, { download: true });
  if (error) throw error;
  return data.signedUrl;
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

// Duplicate an existing Topic Brief: copies all input fields and linked transcripts,
// but never copies pipeline outputs, evidence, creative_brief feedback/approval, or generated fields.
export async function duplicateTopicBrief(briefId: string) {
  const { data: original, error: fetchErr } = await supabase
    .from("topic_briefs")
    .select("*")
    .eq("id", briefId)
    .single();
  if (fetchErr) throw fetchErr;
  if (!original) throw new Error("Brief not found");

  const insertPayload: any = {
    title: `${original.title} (copy)`,
    description: original.description ?? "",
    angle_note: original.angle_note,
    target_minutes: original.target_minutes,
    target_min_words: original.target_min_words,
    target_max_words: original.target_max_words,
    comparison_mode: original.comparison_mode,
    competitor_script_1: original.competitor_script_1,
    competitor_script_2: original.competitor_script_2,
    competitor_script_3: original.competitor_script_3,
    competitor_script_4: original.competitor_script_4,
    competitor_script_5: original.competitor_script_5,
    // Explicitly do NOT copy: thesis, focus_areas, characters, proof_goal,
    // priority_sources, emotional_angle, tone, creative_brief_feedback,
    // creative_brief_approved (these are pipeline-generated or review state).
  };

  const { data: created, error: insertErr } = await supabase
    .from("topic_briefs")
    .insert(insertPayload)
    .select()
    .single();
  if (insertErr) throw insertErr;

  // Copy linked transcripts
  const [{ data: formatLinks }, { data: topicLinks }, { data: altLinks }] = await Promise.all([
    supabase.from("brief_format_reference_links").select("transcript_id").eq("brief_id", briefId),
    supabase.from("brief_topic_transcript_links").select("transcript_id").eq("brief_id", briefId),
    supabase.from("brief_alternative_source_links" as any).select("alternative_source_id").eq("brief_id", briefId),
  ]);

  const formatIds = (formatLinks || []).map((r: any) => r.transcript_id);
  const topicIds = (topicLinks || []).map((r: any) => r.transcript_id);
  const altIds = ((altLinks as any[]) || []).map((r: any) => r.alternative_source_id);

  if (formatIds.length > 0) {
    await supabase.from("brief_format_reference_links").insert(
      formatIds.map((id) => ({ brief_id: created.id, transcript_id: id })),
    );
  }
  if (topicIds.length > 0) {
    await supabase.from("brief_topic_transcript_links").insert(
      topicIds.map((id) => ({ brief_id: created.id, transcript_id: id })),
    );
  }
  if (altIds.length > 0) {
    await supabase.from("brief_alternative_source_links" as any).insert(
      altIds.map((id) => ({ brief_id: created.id, alternative_source_id: id })),
    );
  }

  return created;
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

export async function streamGenerateStep(
  briefId: string,
  stepType: PipelineStepType,
  onDelta: (text: string) => void,
  onDone: () => void,
  options?: { revisionFeedback?: string; previousFullScript?: string; finalVoicePass?: boolean },
) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-step`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        briefId,
        stepType,
        revisionFeedback: options?.revisionFeedback,
        previousFullScript: options?.previousFullScript,
        finalVoicePass: options?.finalVoicePass,
      }),
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

// ── Angle Lab ──
export async function streamAngleLab(
  input: {
    workingIdea: string;
    directions?: string;
    notes?: string;
    nicheTranscript?: string;
    nicheContext?: string;
    formatReferenceIds?: string[];
    topicTranscriptIds?: string[];
    alternativeSourceIds?: string[];
  },
  onDelta: (text: string) => void,
  onDone: () => void,
) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/angle-lab`,
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
    throw new Error(errData.error || `Angle Lab failed (${resp.status})`);
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

  onDone();
}

// ── Angle Lab runs (saved history) ──
export interface AngleLabRun {
  id: string;
  working_idea: string;
  possible_topics: string | null;
  user_notes: string | null;
  raw_output: string;
  parsed_directions: any | null;
  created_at: string;
  updated_at: string;
}

export async function listAngleLabRuns(): Promise<AngleLabRun[]> {
  const { data, error } = await supabase
    .from("angle_lab_runs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AngleLabRun[];
}

export async function createAngleLabRun(input: {
  working_idea: string;
  possible_topics?: string;
  user_notes?: string;
  raw_output: string;
  parsed_directions?: any;
}): Promise<AngleLabRun> {
  const { data, error } = await supabase
    .from("angle_lab_runs")
    .insert({
      working_idea: input.working_idea,
      possible_topics: input.possible_topics ?? null,
      user_notes: input.user_notes ?? null,
      raw_output: input.raw_output,
      parsed_directions: input.parsed_directions ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AngleLabRun;
}

export async function deleteAngleLabRun(id: string): Promise<void> {
  const { error } = await supabase.from("angle_lab_runs").delete().eq("id", id);
  if (error) throw error;
}

// ── Question Bank ──
export type QuestionBankSourceType = "book" | "transcript" | "lexicon" | "competitor_analysis";

export interface QuestionBankEvidence {
  sourceType: QuestionBankSourceType;
  sourceName: string;
  location: string;
  exactFinding: string;
  whatItProves: string;
  evidenceStrength: "Strong" | "Medium" | "Weak";
  canonWeight: "Primary canon" | "Canon support" | "Commentary only";
  notes?: string;
}

export interface QuestionBankAnswer {
  entryId?: string | null;
  answer: string;
  confidence: "High" | "Medium" | "Low";
  canonStatus: string;
  explanation: string;
  scriptSafeTakeaway: string;
  caveats: string[];
  evidence: QuestionBankEvidence[];
}

export interface QuestionBankSourceFilters {
  books?: boolean;
  transcripts?: boolean;
  lexicon?: boolean;
  commentary?: boolean;
}

export async function askQuestionBank(
  question: string,
  sourceFilters?: QuestionBankSourceFilters,
): Promise<QuestionBankAnswer> {
  const { data, error } = await supabase.functions.invoke("question-bank", {
    body: { question, sourceFilters },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as QuestionBankAnswer;
}

export interface QuestionBankEntry {
  id: string;
  question: string;
  answer: string;
  confidence: string;
  canon_status: string;
  explanation: string | null;
  script_safe_takeaway: string | null;
  caveats: any;
  tags: string[] | null;
  created_at: string;
}

export async function getQuestionBankEntries(): Promise<QuestionBankEntry[]> {
  const { data, error } = await supabase
    .from("question_bank_entries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function getQuestionBankEntry(id: string): Promise<QuestionBankAnswer & { question: string; created_at: string }> {
  const { data: entry, error } = await supabase
    .from("question_bank_entries")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: evRows, error: evErr } = await supabase
    .from("question_bank_evidence")
    .select("*")
    .eq("entry_id", id)
    .order("position", { ascending: true });
  if (evErr) throw evErr;
  const evidence: QuestionBankEvidence[] = (evRows || []).map((r: any) => ({
    sourceType: r.source_type,
    sourceName: r.source_name,
    location: r.location ?? "",
    exactFinding: r.exact_finding,
    whatItProves: r.what_it_proves ?? "",
    evidenceStrength: r.evidence_strength,
    canonWeight: r.canon_weight,
    notes: r.notes ?? undefined,
  }));
  return {
    entryId: entry.id,
    question: (entry as any).question,
    created_at: (entry as any).created_at,
    answer: (entry as any).answer,
    confidence: (entry as any).confidence,
    canonStatus: (entry as any).canon_status,
    explanation: (entry as any).explanation ?? "",
    scriptSafeTakeaway: (entry as any).script_safe_takeaway ?? "",
    caveats: Array.isArray((entry as any).caveats) ? (entry as any).caveats : [],
    evidence,
  };
}

export async function deleteQuestionBankEntry(id: string): Promise<void> {
  const { error } = await supabase.from("question_bank_entries").delete().eq("id", id);
  if (error) throw error;
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
  const charCount = input.transcript.length;
  const estimatedTokens = Math.max(1, Math.round(charCount / 4));
  const { data, error } = await supabase
    .from('brief_topic_transcripts')
    .insert({
      ...input,
      char_count: charCount,
      estimated_tokens: estimatedTokens,
    })
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

// ── Alternative Sources (secondary, non-canon) ──
export interface AlternativeSource {
  id: string;
  title: string;
  source_type: string | null;
  source_author: string | null;
  url: string | null;
  content: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  char_count?: number | null;
  estimated_tokens?: number | null;
  script_strength?: 'strong' | 'useful' | 'limited' | null;
}

export async function getAlternativeSources(): Promise<AlternativeSource[]> {
  const { data, error } = await supabase
    .from('alternative_sources')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as AlternativeSource[];
}

export async function saveAlternativeSource(input: {
  title: string;
  content: string;
  source_type?: string | null;
  source_author?: string | null;
  url?: string | null;
  notes?: string | null;
}): Promise<AlternativeSource> {
  const charCount = input.content.length;
  const estimatedTokens = Math.max(1, Math.round(charCount / 4));
  const { data, error } = await supabase
    .from('alternative_sources')
    .insert({
      title: input.title,
      content: input.content,
      source_type: input.source_type ?? null,
      source_author: input.source_author ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      char_count: charCount,
      estimated_tokens: estimatedTokens,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AlternativeSource;
}

export async function deleteAlternativeSource(id: string): Promise<void> {
  const { error } = await supabase
    .from('alternative_sources')
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

export async function linkAlternativeSourcesToBrief(briefId: string, sourceIds: string[]) {
  await supabase.from('brief_alternative_source_links' as any).delete().eq('brief_id', briefId);
  if (sourceIds.length === 0) return;
  const { error } = await supabase.from('brief_alternative_source_links' as any).insert(
    sourceIds.map(id => ({ brief_id: briefId, alternative_source_id: id }))
  );
  if (error) throw error;
}

export async function getBriefAlternativeSourceLinks(briefId: string): Promise<AlternativeSource[]> {
  const { data, error } = await supabase
    .from('brief_alternative_source_links' as any)
    .select('alternative_source_id, alternative_sources(*)')
    .eq('brief_id', briefId);
  if (error) throw error;
  return (data || []).map((r: any) => r.alternative_sources).filter(Boolean) as AlternativeSource[];
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

// ── Source intelligence (char/token metadata + strength label) ──
export type ScriptStrength = 'strong' | 'useful' | 'limited';

export type SourceStrengthTable =
  | 'brief_topic_transcripts'
  | 'alternative_sources'
  | 'source_files';

export function formatSourceMeta(
  charCount: number | null | undefined,
  estimatedTokens: number | null | undefined,
  scriptStrength: ScriptStrength | null | undefined,
): string {
  const chars = typeof charCount === 'number' ? charCount : 0;
  const tokens = typeof estimatedTokens === 'number'
    ? estimatedTokens
    : Math.max(1, Math.round(chars / 4));
  const fmtChars = chars >= 1000
    ? `${(chars / 1000).toFixed(chars >= 10000 ? 0 : 1)}k chars`
    : `${chars} chars`;
  const fmtTokens = tokens >= 1000
    ? `~${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k tokens`
    : `~${tokens} tokens`;
  const strengthLabel = scriptStrength
    ? scriptStrength === 'strong'
      ? 'Strong'
      : scriptStrength === 'useful'
      ? 'Useful'
      : 'Limited'
    : 'Not analyzed';
  return `${fmtChars} · ${fmtTokens} · Script strength: ${strengthLabel}`;
}

export async function analyzeSourceStrength(
  table: SourceStrengthTable,
  id: string,
): Promise<ScriptStrength> {
  const response = await supabase.functions.invoke('analyze-source-strength', {
    body: { table, id },
  });
  if (response.error) throw response.error;
  const label = (response.data as any)?.script_strength;
  if (label !== 'strong' && label !== 'useful' && label !== 'limited') {
    throw new Error('Invalid response from analyzer');
  }
  return label;
}

// ── Clip & Quote Finder (editor-only utility) ──
export interface ClipQuoteFinderRun {
  id: string;
  brief_id: string;
  pasted_script: string;
  editor_notes: string | null;
  prioritize_exact_film_timestamps: boolean;
  include_book_quote_inserts: boolean;
  include_contextual_broll_ideas: boolean;
  output_markdown: string;
  created_at: string;
  updated_at: string;
}

export interface ClipQuoteFinderInput {
  briefId: string;
  pastedScript: string;
  editorNotes?: string;
  prioritizeExactFilmTimestamps: boolean;
  includeBookQuoteInserts: boolean;
  includeContextualBrollIdeas: boolean;
}

export async function runClipQuoteFinder(
  input: ClipQuoteFinderInput,
): Promise<{ id: string | null; outputMarkdown: string; beatCount: number }> {
  const { data, error } = await supabase.functions.invoke('find-clips-quotes', {
    body: input,
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export async function getClipQuoteFinderRun(briefId: string): Promise<ClipQuoteFinderRun | null> {
  const { data, error } = await supabase
    .from('clip_quote_finder_runs' as any)
    .select('*')
    .eq('brief_id', briefId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function deleteClipQuoteFinderRun(id: string): Promise<void> {
  const { error } = await supabase.from('clip_quote_finder_runs' as any).delete().eq('id', id);
  if (error) throw error;
}

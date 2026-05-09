import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MultiSelectChips, type MultiSelectOption } from "@/components/MultiSelectChips";
import { ChevronDown, FlaskConical, Loader2, Clock, GitCompare, Copy, History, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  streamGenerateStep,
  streamPolishPass,
  TARGET_LENGTH_OPTIONS,
  getFormatReferenceTranscripts,
  getBriefTopicTranscripts,
  getAlternativeSources,
  getSourceFiles,
  getEvidencePoints,
  replaceEvidencePoints,
  setEvidencePointApproval,
  type EvidencePoint,
  type HookOption,
  type CreateBriefInput,
} from "@/lib/api";
import { parseEvidenceTable } from "@/lib/parseEvidenceTable";
import { EvidenceTableView } from "@/components/pipeline/EvidenceTableView";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type StepKey =
  | "creative_brief"
  | "six_category_extraction"
  | "selected_source_analysis"
  | "evidence_table"
  | "outline"
  | "script_evidence_pack"
  | "hook_options"
  | "full_script"
  | "melty_voice"
  | "anti_ai";

const STEP_LABELS: Record<StepKey, string> = {
  creative_brief: "Creative Brief",
  six_category_extraction: "Six-Category",
  selected_source_analysis: "Selected Source Analysis",
  evidence_table: "Evidence Table",
  outline: "Beat Plan",
  script_evidence_pack: "Script Evidence Pack",
  hook_options: "Hook Options",
  full_script: "Full Script",
  melty_voice: "Melty Voice Pass",
  anti_ai: "Anti-AI Cleanup",
};

const STEP_ORDER: StepKey[] = [
  "creative_brief",
  "six_category_extraction",
  "selected_source_analysis",
  "evidence_table",
  "outline",
  "script_evidence_pack",
  "hook_options",
  "full_script",
  "melty_voice",
  "anti_ai",
];

const EXPECTED_MODEL: Record<StepKey, string> = {
  creative_brief: "openai/gpt-5.2",
  six_category_extraction: "openai/gpt-5.2",
  selected_source_analysis: "openai/gpt-5.2",
  evidence_table: "openai/gpt-5.2",
  outline: "openai/gpt-5.2",
  script_evidence_pack: "openai/gpt-5.2",
  hook_options: "openai/gpt-5.2",
  full_script: "openai/gpt-5.2",
  melty_voice: "google/gemini-2.5-pro",
  anti_ai: "google/gemini-2.5-pro",
};

const BOOK_OPTIONS = [
  "Book 1: Philosopher's Stone",
  "Book 2: Chamber of Secrets",
  "Book 3: Prisoner of Azkaban",
  "Book 4: Goblet of Fire",
  "Book 5: Order of the Phoenix",
  "Book 6: Half-Blood Prince",
  "Book 7: Deathly Hallows",
];

const MOVIE_OPTIONS = [
  "Movie 1: Philosopher's Stone",
  "Movie 2: Chamber of Secrets",
  "Movie 3: Prisoner of Azkaban",
  "Movie 4: Goblet of Fire",
  "Movie 5: Order of the Phoenix",
  "Movie 6: Half-Blood Prince",
  "Movie 7.1: Deathly Hallows Part 1",
  "Movie 7.2: Deathly Hallows Part 2",
];

type StepResult = {
  status: "pending" | "running" | "pass" | "fail" | "skip";
  output: string;
  notes: string;
  warnings: string[];
  model?: string;
  diagnostics?: any;
  hooks?: HookOption[];
};

const blankForm = (): CreateBriefInput => ({
  title: "Why Book Ron Is Not Movie Ron",
  angle_note: "The films kept the jokes and lost the spine. Ron's loyalty is load-bearing in the books and decorative in the films.",
  target_minutes: 10,
  target_min_words: 1400,
  target_max_words: 1600,
  comparison_mode: false,
  characters: ["Ron Weasley"],
  focus_areas: ["Trio dynamic", "Adaptation gap", "Emotional function"],
  priority_sources: [],
});

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const HISTORY_KEY = "pipeline-test-history";
const HISTORY_MAX = 10;

type HistoryEntry = {
  timestamp: string;
  form: CreateBriefInput;
  selectedFormatIds: string[];
  selectedTopicIds: string[];
  selectedAltIds: string[];
};

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry: HistoryEntry) {
  const existing = loadHistory();
  const next = [entry, ...existing].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

function statusIcon(s: StepResult["status"]) {
  if (s === "pass") return "✅ PASS";
  if (s === "fail") return "❌ FAIL";
  if (s === "skip") return "⚠️ SKIP";
  if (s === "running") return "… RUN";
  return "—  WAIT";
}

export default function PipelineTest() {
  const [form, setForm] = useState<CreateBriefInput>(blankForm());
  const [selectedFormatIds, setSelectedFormatIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedAltIds, setSelectedAltIds] = useState<string[]>([]);
  // EXPERIMENTAL: hybrid vector search toggle. Test mode only — never sent on
  // real pipeline runs.
  const [useVectorSearch, setUseVectorSearch] = useState<boolean>(false);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [results, setResults] = useState<Record<StepKey, StepResult>>(() =>
    Object.fromEntries(STEP_ORDER.map((k) => [k, { status: "pending", output: "", notes: "", warnings: [] }])) as any,
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  // Test runs use a synthetic UUID brief id so evidence_points can be
  // persisted, approved/rejected, and threaded into Beat Plan / SEP / Full
  // Script the same way as a real run. Rows are deleted at run end / unmount.
  const [testBriefId, setTestBriefId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "awaiting_approval" | "phase2" | "done">("idle");
  const pendingOutputsRef = useRef<Partial<Record<StepKey, string>>>({});
  const [evidenceRows, setEvidenceRows] = useState<EvidencePoint[]>([]);
  const [continuing, setContinuing] = useState(false);

  const { data: formatRefs = [] } = useQuery({
    queryKey: ["format-references"],
    queryFn: getFormatReferenceTranscripts,
  });
  const { data: topicTranscripts = [] } = useQuery({
    queryKey: ["topic-transcripts"],
    queryFn: getBriefTopicTranscripts,
  });
  const { data: alternativeSources = [] } = useQuery({
    queryKey: ["alternative-sources"],
    queryFn: getAlternativeSources,
  });
  const { data: sourceFiles = [] } = useQuery({
    queryKey: ["source-files"],
    queryFn: getSourceFiles,
  });
  const libraryFileNames = (sourceFiles as any[]).map((f: any) => f.name);

  // Best-effort cleanup of synthetic evidence_points rows when the page is
  // closed mid-run.
  useEffect(() => {
    return () => {
      if (testBriefId) {
        supabase.from("evidence_points").delete().eq("brief_id", testBriefId);
        supabase.from("topic_briefs").delete().eq("id", testBriefId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetchTestEvidence = async (id: string) => {
    const rows = await getEvidencePoints(id);
    setEvidenceRows(rows);
  };

  const updateForm = (key: keyof CreateBriefInput, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const update = (k: StepKey, patch: Partial<StepResult>) =>
    setResults((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const reset = () =>
    setResults(Object.fromEntries(STEP_ORDER.map((k) => [k, { status: "pending", output: "", notes: "", warnings: [] }])) as any);

  const inlineBrief = () => ({
    title: form.title,
    description: form.angle_note,
    angle_note: form.angle_note,
    characters: form.characters || [],
    focus_areas: form.focus_areas || [],
    priority_sources: form.priority_sources || [],
    target_min_words: 650,
    target_max_words: 800,
    comparison_mode: form.comparison_mode,
  });

  const runStep = async (
    step: Exclude<StepKey, "hook_options" | "melty_voice" | "anti_ai">,
    outputs: Partial<Record<StepKey, string>>,
    briefIdArg: string,
  ): Promise<{ text: string; diagnostics?: any }> => {
    update(step, { status: "running" });
    let text = "";
    let diagnostics: any = null;
    await streamGenerateStep(
      briefIdArg,
      step as any,
      (delta) => { text += delta; },
      () => {},
      {
        testMode: true,
        testInlineBrief: inlineBrief(),
        testInlineOutputs: outputs as Record<string, string>,
        testInlineAlternativeSourceIds: selectedAltIds,
        testInlineFormatReferenceIds: selectedFormatIds,
        testInlineTopicTranscriptIds: selectedTopicIds,
        testInlineUseVectorSearch: useVectorSearch,
        onDiagnostics: (d) => { diagnostics = d; },
      },
    );
    return { text, diagnostics };
  };

  const handleApproval = async (
    id: string,
    status: "approved" | "rejected",
    note?: string | null,
  ) => {
    if (!testBriefId) return;
    try {
      await setEvidencePointApproval(id, status, note);
      await refetchTestEvidence(testBriefId);
    } catch (err: any) {
      toast.error(err.message || "Failed to update approval");
    }
  };

  const handleRun = async () => {
    if (!confirmed) {
      toast.error("Please confirm the diagnostic checkbox first.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Video title is required");
      return;
    }
    if (!form.angle_note.trim()) {
      toast.error("Angle note is required");
      return;
    }
    if (selectedFormatIds.length === 0) {
      toast.error("Select at least one Format Reference Video — required for the Creative Brief.");
      return;
    }
    // Clean up any prior synthetic test rows before starting a fresh run.
    if (testBriefId) {
      try {
        await supabase.from("evidence_points").delete().eq("brief_id", testBriefId);
        await supabase.from("topic_briefs").delete().eq("id", testBriefId);
      } catch {/* ignore */}
    }
    const newBriefId = crypto.randomUUID();
    setTestBriefId(newBriefId);
    setEvidenceRows([]);
    setPhase("idle");
    pendingOutputsRef.current = {};
    setRunning(true);
    setStartedAt(new Date().toISOString());
    reset();

    // Save inputs to localStorage history
    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      form: { ...form },
      selectedFormatIds: [...selectedFormatIds],
      selectedTopicIds: [...selectedTopicIds],
      selectedAltIds: [...selectedAltIds],
    };
    saveHistoryEntry(entry);
    setHistory(loadHistory());

    const outputs: Partial<Record<StepKey, string>> = {};
    let firstFailedAt: StepKey | null = null;

    // Phase 1 stops at the Evidence Table so the user can approve / reject
    // high-risk points and add author notes before Beat Plan / SEP / Full
    // Script consume them — same flow as the real pipeline.
    const phase1: Exclude<StepKey, "hook_options" | "melty_voice" | "anti_ai">[] = [
      "creative_brief",
      "six_category_extraction",
      "selected_source_analysis",
      "evidence_table",
    ];

    try {
      for (const step of phase1) {
        try {
          const { text, diagnostics } = await runStep(step, outputs, newBriefId);
          outputs[step] = text;
          const warnings: string[] = [];
          if (diagnostics?.guidance) {
            for (const [k, v] of Object.entries(diagnostics.guidance)) {
              if ((v as any).truncated) warnings.push(`Guidance doc truncated: ${k}`);
            }
          }
          if (diagnostics?.retrieval) {
            const r = diagnostics.retrieval;
            // Creative Brief intentionally runs before retrieval — zero
            // retrieval is expected for that step and is not a failure.
            if (step !== "creative_brief") {
              for (const t of ["book", "transcript", "lexicon", "commentary"] as const) {
                if (r[t] === 0) warnings.push(`Zero retrieval on ${t}`);
              }
            }
          }
          const expected = EXPECTED_MODEL[step];
          if (diagnostics?.model && diagnostics.model !== expected) {
            warnings.push(`Model mismatch: got ${diagnostics.model}, expected ${expected}`);
          }
          let notes = `${wordCount(text)} words`;
          update(step, { status: "pass", output: text, model: diagnostics?.model, diagnostics, notes, warnings });
        } catch (e: any) {
          update(step, { status: "fail", notes: e.message || "error" });
          firstFailedAt = step;
          throw e;
        }
      }

      // Persist parsed evidence rows under the synthetic brief id so the
      // approve/reject UI + author notes can drive what threads into Beat
      // Plan, SEP, and Full Script — identical to the real pipeline.
      try {
        const drafts = parseEvidenceTable(outputs.evidence_table || "");
        if (drafts.length > 0) {
          // evidence_points.brief_id has a FK to topic_briefs, so we need a
          // placeholder brief row before we can persist parsed rows. It is
          // deleted alongside the evidence rows when the test ends.
          const { error: briefErr } = await supabase
            .from("topic_briefs")
            .upsert({
              id: newBriefId,
              title: `[TEST] ${form.title || "Untitled"}`,
              description: form.angle_note || "Test pipeline run",
            });
          if (briefErr) throw briefErr;
          await replaceEvidencePoints(newBriefId, drafts);
          await refetchTestEvidence(newBriefId);
        }
      } catch (err) {
        console.warn("Failed to persist test evidence_points:", err);
      }
      pendingOutputsRef.current = outputs;
      setPhase("awaiting_approval");
    } catch (e) {
      if (firstFailedAt) {
        const idx = STEP_ORDER.indexOf(firstFailedAt);
        for (let i = idx; i < STEP_ORDER.length; i++) {
          if (results[STEP_ORDER[i]].status !== "fail")
            update(STEP_ORDER[i], { status: "skip", notes: `upstream failure at ${firstFailedAt}` });
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const handleContinueAfterApproval = async () => {
    if (!testBriefId) return;
    const outputs = { ...pendingOutputsRef.current };
    let firstFailedAt: StepKey | null = null;
    setContinuing(true);
    setPhase("phase2");

    const phase2Gen: Exclude<StepKey, "hook_options" | "melty_voice" | "anti_ai">[] = [
      "outline",
      "script_evidence_pack",
    ];

    try {
      for (const step of phase2Gen) {
        try {
          const { text, diagnostics } = await runStep(step, outputs, testBriefId);
          outputs[step] = text;
          const warnings: string[] = [];
          if (diagnostics?.guidance) {
            for (const [k, v] of Object.entries(diagnostics.guidance)) {
              if ((v as any).truncated) warnings.push(`Guidance doc truncated: ${k}`);
            }
          }
          if (diagnostics?.retrieval) {
            const r = diagnostics.retrieval;
            for (const t of ["book", "transcript", "lexicon", "commentary"] as const) {
              if (r[t] === 0) warnings.push(`Zero retrieval on ${t}`);
            }
          }
          const expected = EXPECTED_MODEL[step];
          if (diagnostics?.model && diagnostics.model !== expected) {
            warnings.push(`Model mismatch: got ${diagnostics.model}, expected ${expected}`);
          }
          let notes = `${wordCount(text)} words`;
          if (step === "outline") {
            const beats = (text.match(/^\s*(?:beat\s*)?\d+[.)]/gim) || []).length;
            notes += ` • ~${beats} beats detected`;
          }
          update(step, { status: "pass", output: text, model: diagnostics?.model, diagnostics, notes, warnings });
        } catch (e: any) {
          update(step, { status: "fail", notes: e.message || "error" });
          firstFailedAt = step;
          throw e;
        }
      }

      // Hook Options + Full Script + polish passes (unchanged from before)
      try {
        update("hook_options", { status: "running" });
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-hook-options`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              briefId: testBriefId,
              testMode: true,
              testInlineCreativeBrief: outputs.creative_brief,
              testInlineScriptEvidencePack: outputs.script_evidence_pack,
            }),
          },
        );
        const data = await resp.json();
        if (!resp.ok || !Array.isArray(data?.hooks)) throw new Error(data?.error || "Hook options failed");
        const allHooks: HookOption[] = data.hooks;
        const opens = new Set(allHooks.map((h) => h.angle_route || h.hook_label));
        const warnings: string[] = [];
        if (opens.size < allHooks.length) warnings.push("Hook differentiation low");
        update("hook_options", {
          status: "pass",
          hooks: allHooks,
          output: allHooks.map((h, i) => `## Hook ${i + 1} — ${h.hook_label}\n${h.hook_text}`).join("\n\n"),
          notes: `${allHooks.length} hooks • distinct entry points: ${opens.size === allHooks.length ? "yes" : "no"}`,
          warnings,
        });
        const chosen = allHooks[0]?.hook_text || "";

        // Full Script
        update("full_script", { status: "running" });
        let fsText = "";
        let fsDiag: any = null;
        await streamGenerateStep(
          testBriefId,
          "full_script",
          (d) => { fsText += d; },
          () => {},
          {
            testMode: true,
            testInlineBrief: inlineBrief(),
            testInlineOutputs: outputs as Record<string, string>,
            testInlineAlternativeSourceIds: selectedAltIds,
            testInlineFormatReferenceIds: selectedFormatIds,
            testInlineTopicTranscriptIds: selectedTopicIds,
            testInlineUseVectorSearch: useVectorSearch,
            hookDirection: chosen,
            onDiagnostics: (d) => { fsDiag = d; },
          },
        );
        outputs.full_script = fsText;
        update("full_script", {
          status: "pass",
          output: fsText,
          model: fsDiag?.model,
          notes: `${wordCount(fsText)} words • complete 4-beat script`,
          warnings: [],
        });

        // Melty Voice Pass
        update("melty_voice", { status: "running" });
        let mvText = "";
        await streamPolishPass(
          { passType: "melty_voice", scriptText: fsText, scope: "full_script" },
          (d) => { mvText += d; },
          () => {},
        );
        const mvWords = wordCount(mvText);
        // Beat log minimum is defined against the INPUT script (Full Script
        // output) word count, floored — matching the polish-pass spec.
        const inputScriptWords = wordCount(fsText);
        const minBeats = Math.floor(inputScriptWords / 300);
        // Extract the PERSONALITY BEAT LOG section and count numbered
        // entries inside it. The pass output uses headings like
        // "PERSONALITY BEAT LOG" followed by "1." / "2." numbered entries
        // and ends at the next section heading (RESISTED SECTIONS,
        // PARENTHETICAL ASIDE LOG, MOCK FORMAL REGISTER LOG, I VS WE
        // AUDIT LOG) or the "---" script separator. The previous parser
        // looked for the literal string "beat <n>" which the pass no
        // longer emits, so it always returned 0.
        const sectionMatch = mvText.match(
          /PERSONALITY BEAT LOG[\s\S]*?(?=\n\s*(?:RESISTED SECTIONS|PARENTHETICAL ASIDE LOG|MOCK FORMAL REGISTER LOG|I VS WE AUDIT LOG|HOOK AUDIT LOG)\b|\n\s*---\s*\n|$)/i,
        );
        const beatLog = sectionMatch
          ? (sectionMatch[0].match(/^\s*\d+[.)]/gm) || []).length
          : 0;
        const mvWarn: string[] = [];
        if (beatLog < minBeats) mvWarn.push(`Beat log minimum not met (${beatLog} < ${minBeats})`);
        update("melty_voice", {
          status: "pass",
          output: mvText,
          model: EXPECTED_MODEL.melty_voice,
          notes: `${mvWords} words • beat log ${beatLog}/min ${minBeats}`,
          warnings: mvWarn,
        });

        // Anti-AI Cleanup
        update("anti_ai", { status: "running" });
        let aiText = "";
        await streamPolishPass(
          { passType: "anti_ai", scriptText: mvText, scope: "full_script" },
          (d) => { aiText += d; },
          () => {},
        );
        const diff = aiText.trim() === mvText.trim() ? 0 : 1;
        const aiWarn: string[] = [];
        if (diff === 0) aiWarn.push("Anti-AI diff: 0 changes");
        update("anti_ai", {
          status: "pass",
          output: aiText,
          model: EXPECTED_MODEL.anti_ai,
          notes: `${wordCount(aiText)} words • diff: ${diff === 0 ? "none" : "changes detected"}`,
          warnings: aiWarn,
        });
      } catch (e: any) {
        if (!firstFailedAt) {
          const currentRunning = STEP_ORDER.find((k) => results[k]?.status === "running");
          firstFailedAt = currentRunning || "hook_options";
          update(firstFailedAt, { status: "fail", notes: e.message || "error" });
        }
        const idx = STEP_ORDER.indexOf(firstFailedAt) + 1;
        for (let i = idx; i < STEP_ORDER.length; i++) {
          update(STEP_ORDER[i], { status: "skip", notes: `upstream failure at ${firstFailedAt}` });
        }
      }
    } catch (e) {
      if (firstFailedAt) {
        const idx = STEP_ORDER.indexOf(firstFailedAt);
        for (let i = idx; i < STEP_ORDER.length; i++) {
          if (results[STEP_ORDER[i]].status !== "fail")
            update(STEP_ORDER[i], { status: "skip", notes: `upstream failure at ${firstFailedAt}` });
        }
      }
    } finally {
      setContinuing(false);
      setPhase("done");
      // Synthetic evidence rows have served their purpose; remove them so
      // they don't accumulate in the database.
      try {
        await supabase.from("evidence_points").delete().eq("brief_id", testBriefId);
        await supabase.from("topic_briefs").delete().eq("id", testBriefId);
      } catch {/* ignore */}
    }
  };

  const handleCopyAll = async () => {
    const reportLines: string[] = [];
    reportLines.push("=== PIPELINE TEST REPORT ===");
    reportLines.push(`Triggered: ${startedAt}`);
    reportLines.push(`Brief: ${form.title}`);
    reportLines.push("Mode: Test (4-beat cap)");
    reportLines.push("");
    for (const k of STEP_ORDER) {
      const r = results[k];
      reportLines.push(`${STEP_LABELS[k]}  ${statusIcon(r.status)}  ${r.notes}`);
    }
    reportLines.push("");
    reportLines.push("WARNINGS");
    if (allWarnings.length === 0) {
      reportLines.push("None");
    } else {
      for (const w of allWarnings) reportLines.push(`⚠️ ${w}`);
    }
    reportLines.push("");
    reportLines.push(`ESTIMATED TOKEN USAGE: ~${estTokens.toLocaleString()}`);
    reportLines.push(`OVERALL: ${overallStatus}`);
    reportLines.push("");

    for (const k of STEP_ORDER) {
      const r = results[k];
      reportLines.push(`=== ${STEP_LABELS[k].toUpperCase()} ===`);
      reportLines.push(r.output || "(no output)");
      reportLines.push("");
    }

    const fullText = reportLines.join("\n");
    try {
      await navigator.clipboard.writeText(fullText);
      toast.success("All outputs copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const totalChars = STEP_ORDER.reduce((acc, k) => acc + (results[k].output?.length || 0), 0);
  const estTokens = Math.round(totalChars / 4);
  const allWarnings = STEP_ORDER.flatMap((k) => results[k].warnings.map((w) => `[${STEP_LABELS[k]}] ${w}`));
  const overallStatus = STEP_ORDER.every((k) => results[k].status === "pass")
    ? "✅ ALL SYSTEMS OPERATIONAL"
    : STEP_ORDER.some((k) => results[k].status === "fail")
    ? "❌ FAILURE DETECTED"
    : startedAt
    ? "… IN PROGRESS"
    : "—";

  const formatOptions: MultiSelectOption[] = (formatRefs as any[]).map((r: any) => ({
    value: r.id,
    label: r.video_title,
    sublabel: r.channel_name,
  }));
  const topicOptions: MultiSelectOption[] = (topicTranscripts as any[]).map((r: any) => ({
    value: r.id,
    label: r.video_title,
    sublabel: r.channel_name,
  }));
  const altOptions: MultiSelectOption[] = (alternativeSources as any[]).map((r: any) => ({
    value: r.id,
    label: r.title,
    sublabel: r.source_type || r.source_author || undefined,
  }));

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-mono font-bold text-foreground">Pipeline Test</h1>
              <p className="text-sm text-muted-foreground">
                Diagnostic full-pipeline run with capped inputs (4-beat cap). Nothing is saved.
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                History {history.length > 0 ? `(${history.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto">
              <DropdownMenuLabel>Recent Runs (localStorage)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {history.length === 0 && (
                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                  No saved runs yet.
                </div>
              )}
              {history.map((h, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => {
                    setForm(h.form);
                    setSelectedFormatIds(h.selectedFormatIds || []);
                    setSelectedTopicIds(h.selectedTopicIds || []);
                    setSelectedAltIds(h.selectedAltIds || []);
                    toast.success("Form populated from history");
                  }}
                  className="flex flex-col items-start gap-1 cursor-pointer"
                >
                  <span className="text-sm font-medium truncate w-full">
                    {h.form.title || "(untitled)"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(h.timestamp).toLocaleString()}
                  </span>
                </DropdownMenuItem>
              ))}
              {history.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      localStorage.removeItem(HISTORY_KEY);
                      setHistory([]);
                      toast.success("History cleared");
                    }}
                    className="text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear history
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="border border-primary/30 rounded-lg p-5 mb-6 bg-card">
          <h3 className="font-mono text-sm font-semibold text-foreground mb-4">Pipeline Test Brief</h3>
          <div className="space-y-4">
            {/* Video Title */}
            <div>
              <Label className="text-xs text-muted-foreground">Video Title</Label>
              <Input
                placeholder="e.g., Why Snape's Redemption Arc is Overrated"
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                className="bg-secondary border-border mt-1"
              />
            </div>

            {/* Angle Note */}
            <div>
              <Label className="text-xs text-muted-foreground">Angle Note</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Your angle or direction for this video. A few sentences. The system will develop this into a full thesis.
              </p>
              <Textarea
                placeholder="e.g., Snape's redemption is built on a single act..."
                value={form.angle_note}
                onChange={(e) => updateForm("angle_note", e.target.value)}
                rows={4}
                className="bg-secondary border-border resize-none"
              />
            </div>

            {/* Main Characters */}
            <div>
              <Label className="text-xs text-muted-foreground">Main Characters</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Characters central to this video. Used to build retrieval queries. e.g., Ginny Weasley, Harry Potter
              </p>
              <Input
                placeholder="Ginny Weasley, Harry Potter"
                value={(form.characters || []).join(", ")}
                onChange={(e) =>
                  updateForm("characters", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
                }
                className="bg-secondary border-border mt-1"
              />
            </div>

            {/* Focus Areas */}
            <div>
              <Label className="text-xs text-muted-foreground">Focus Areas</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Key themes, scenes, or topics this video covers.
              </p>
              <Input
                placeholder="Chamber of Secrets trauma, OotP confrontation, adaptation gaps"
                value={(form.focus_areas || []).join(", ")}
                onChange={(e) =>
                  updateForm("focus_areas", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
                }
                className="bg-secondary border-border mt-1"
              />
            </div>

            {/* Priority Books */}
            <div>
              <Label className="text-xs text-muted-foreground">Priority Books</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Which books are most relevant. Retrieval will weight these.
              </p>
              <MultiSelectChips
                options={BOOK_OPTIONS.map((b) => ({ value: b, label: b }))}
                selected={(form.priority_sources || []).filter((s) => BOOK_OPTIONS.includes(s))}
                onChange={(vals) => {
                  const movies = (form.priority_sources || []).filter((s) => MOVIE_OPTIONS.includes(s));
                  updateForm("priority_sources", [...vals, ...movies]);
                }}
                placeholder="Select priority books…"
              />
            </div>

            {/* Priority Movies */}
            <div>
              <Label className="text-xs text-muted-foreground">Priority Movies</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Which films are most relevant. Retrieval will weight these.
              </p>
              <MultiSelectChips
                options={MOVIE_OPTIONS.map((m) => ({ value: m, label: m }))}
                selected={(form.priority_sources || []).filter((s) => MOVIE_OPTIONS.includes(s))}
                onChange={(vals) => {
                  const books = (form.priority_sources || []).filter((s) => BOOK_OPTIONS.includes(s));
                  updateForm("priority_sources", [...books, ...vals]);
                }}
                placeholder="Select priority movies…"
              />
            </div>

            {/* Target Length (optional in test runs) */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Target Length (Voiceover) <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Select
                value={String(form.target_minutes)}
                onValueChange={(v) => {
                  const opt = TARGET_LENGTH_OPTIONS.find((o) => o.minutes === Number(v));
                  if (opt) {
                    updateForm("target_minutes", opt.minutes);
                    updateForm("target_min_words", opt.min);
                    updateForm("target_max_words", opt.max);
                  }
                }}
              >
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LENGTH_OPTIONS.map((opt) => (
                    <SelectItem key={opt.minutes} value={String(opt.minutes)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Not used in test runs. Output length is controlled by the 4-beat cap.
              </p>
            </div>

            {/* Comparison Mode */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Switch
                checked={form.comparison_mode}
                onCheckedChange={(v) => updateForm("comparison_mode", v)}
              />
              <div>
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5 text-primary" />
                  Book vs Movie Comparison Mode
                </Label>
                <p className="text-xs text-muted-foreground">Forces paired retrieval and contrast-based analysis</p>
              </div>
            </div>

            {/* Hybrid Vector Search — EXPERIMENTAL, test-mode only */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Switch
                checked={useVectorSearch}
                onCheckedChange={setUseVectorSearch}
              />
              <div>
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Use Vector Search (Experimental)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Hybrid FTS + pgvector with RRF fusion. Test mode only — does not affect the real pipeline. Per-query FTS vs vector rankings appear in step diagnostics.
                </p>
              </div>
            </div>

            {/* Format Reference Videos */}
            <div className="pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground">Format Reference Videos</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">
                Non-HP format reference videos. Used for argument structure and positioning only — never for Harry Potter content.
              </p>
              <MultiSelectChips
                options={formatOptions}
                selected={selectedFormatIds}
                onChange={(vals) => {
                  if (vals.length > 2) {
                    toast.error("Maximum 2 format references");
                    return;
                  }
                  setSelectedFormatIds(vals);
                }}
                placeholder={formatOptions.length === 0 ? "No format references available" : "Select format references…"}
                emptyText="No format references available."
                searchable
                searchPlaceholder="Search format references..."
                emptySearchMessage="No matching sources found."
              />
            </div>

            {/* HP Topic Transcripts */}
            <div className="pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground">HP Topic Transcripts (optional)</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">
                HP videos covering a similar topic to this video. Used as research leads.
              </p>
              <MultiSelectChips
                options={topicOptions}
                selected={selectedTopicIds}
                onChange={setSelectedTopicIds}
                placeholder={topicOptions.length === 0 ? "No HP topic transcripts available" : "Select HP topic transcripts…"}
                emptyText="No HP topic transcripts available."
                searchable
                searchPlaceholder="Search HP topic transcripts..."
                emptySearchMessage="No matching sources found."
              />
            </div>

            {/* Alternative Sources */}
            <div className="pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground">Alternative Sources (optional)</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">
                Optional pasted sources such as Reddit threads, fan comments, wiki extracts, blog posts, or research notes.
              </p>
              <MultiSelectChips
                options={altOptions}
                selected={selectedAltIds}
                onChange={setSelectedAltIds}
                placeholder={altOptions.length === 0 ? "No alternative sources available" : "Select alternative sources…"}
                emptyText="No alternative sources yet. Add some in the Secondary Source Library."
                searchable
                searchPlaceholder="Search alternative sources..."
                emptySearchMessage="No matching sources found."
              />
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Estimated cost before run: ~25,000–50,000 input tokens (capped 4-beat run, halved secondary budgets).
              </p>
              <div className="flex items-center gap-2">
                <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
                <Label htmlFor="confirm" className="text-sm cursor-pointer">
                  I understand this is a diagnostic run. Outputs will not be saved.
                </Label>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleRun}
                  disabled={running || continuing || phase === "awaiting_approval" || phase === "phase2" || !confirmed}
                >
                  {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</> : "Run Pipeline Test"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {startedAt && (
          <Card className="p-6 mb-6 font-mono text-xs whitespace-pre-wrap">
            <div className="font-bold mb-2">PIPELINE TEST REPORT</div>
            <div>Triggered: {startedAt}</div>
            <div>Brief: {form.title}</div>
            <div>Mode: Test (4-beat cap)</div>
            <div className="my-3 border-t border-border" />
            {STEP_ORDER.map((k) => {
              const r = results[k];
              return (
                <div key={k} className="grid grid-cols-[200px_80px_1fr] gap-2">
                  <span>{STEP_LABELS[k]}</span>
                  <span>{statusIcon(r.status)}</span>
                  <span className="text-muted-foreground">{r.notes}</span>
                </div>
              );
            })}
            <div className="my-3 border-t border-border" />
            <div className="font-bold">WARNINGS</div>
            {allWarnings.length === 0 ? <div className="text-muted-foreground">None</div> :
              allWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
            <div className="my-3 border-t border-border" />
            <div>ESTIMATED TOKEN USAGE: ~{estTokens.toLocaleString()}</div>
            <div className="font-bold mt-2">OVERALL: {overallStatus}</div>
          </Card>
        )}

        {results.anti_ai?.status === "pass" && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">Anti-AI Polish Complete</span>
            <span className="text-green-600/70 dark:text-green-400/70">
              — Test pass finished{results.anti_ai.notes ? ` · ${results.anti_ai.notes}` : ""}
            </span>
          </div>
        )}

        {startedAt && (
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
              <Copy className="w-3.5 h-3.5" />
              Copy All Outputs
            </Button>
          </div>
        )}

        {(phase === "awaiting_approval" || phase === "phase2") && (
          <Card className="p-5 mb-6 border-primary/40">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  Evidence Approval (Test Run)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Approve or reject high-risk evidence and add optional notes.
                  Approved rows + notes will be threaded into Beat Plan, SEP,
                  and Full Script — same as the real pipeline. Rows are
                  deleted when the run finishes.
                </p>
              </div>
              <Button
                onClick={handleContinueAfterApproval}
                disabled={continuing || phase === "phase2"}
                size="sm"
              >
                {continuing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Continuing…</>
                ) : (
                  "Continue Pipeline"
                )}
              </Button>
            </div>
            {evidenceRows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No evidence rows parsed from the Evidence Table output.
              </p>
            ) : (
              <EvidenceTableView
                rows={evidenceRows}
                libraryFileNames={libraryFileNames}
                onSetApproval={handleApproval}
              />
            )}
          </Card>
        )}

        {STEP_ORDER.map((k) => {
          const r = results[k];
          if (!r.output && r.status === "pending") return null;
          return (
            <Collapsible key={k} className="mb-2">
              <Card>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs w-16">{statusIcon(r.status)}</span>
                    <span className="font-medium">{STEP_LABELS[k]}</span>
                    <span className="text-xs text-muted-foreground">{r.notes}</span>
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="p-4 text-xs whitespace-pre-wrap border-t border-border max-h-96 overflow-auto">{r.output || "(no output)"}</pre>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </Layout>
  );
}
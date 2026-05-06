import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PipelineSidebar } from "@/components/pipeline/PipelineSidebar";
import {
  PIPELINE_STEPS,
  getPipelineOutputs,
  savePipelineOutput,
  streamGenerateStep,
  streamPolishPass,
  updateBriefCreativeBriefFields,
  generateHookOptions,
  refineHookOption,
  type HookOption,
  type PipelineStepType,
  getEvidencePoints,
  replaceEvidencePoints,
  setEvidencePointApproval,
  getSourceFiles,
} from "@/lib/api";
import { parseEvidenceTable } from "@/lib/parseEvidenceTable";
import { EvidenceTableView } from "@/components/pipeline/EvidenceTableView";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  Copy,
  Download,
  ThumbsUp,
  Sparkles,
  Wand2,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type ActiveStep = PipelineStepType;

export default function PipelineView() {
  const { briefId } = useParams<{ briefId: string }>();
  const [activeStep, setActiveStep] = useState<ActiveStep>("creative_brief");
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [approving, setApproving] = useState(false);
  const [antiAiRunning, setAntiAiRunning] = useState(false);
  const [antiAiStream, setAntiAiStream] = useState("");
  const [confirmAntiAiOpen, setConfirmAntiAiOpen] = useState(false);
  const [meltyRunning, setMeltyRunning] = useState(false);
  const [meltyStream, setMeltyStream] = useState("");
  const [passageInput, setPassageInput] = useState("");
  const [passageFeedback, setPassageFeedback] = useState("");
  const [passageRunning, setPassageRunning] = useState(false);
  const [passageOutput, setPassageOutput] = useState("");
  // ── Hook Options (transient UI state only — never persisted) ──
  const [hookOptions, setHookOptions] = useState<HookOption[]>([]);
  const [hookOptionsLoading, setHookOptionsLoading] = useState(false);
  // Index of the currently selected generated hook (-1 = none, -2 = custom)
  const [selectedHookIdx, setSelectedHookIdx] = useState<number>(-1);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [customHookOpen, setCustomHookOpen] = useState(false);
  const [customHookText, setCustomHookText] = useState("");

  // Resolve the hook text passed to Full Script generation.
  const selectedHookDirection = (() => {
    if (selectedHookIdx === -2) return customHookText.trim();
    if (selectedHookIdx >= 0 && hookOptions[selectedHookIdx]) {
      const h = hookOptions[selectedHookIdx];
      return `${h.hook_label}\n\n${h.hook_text}`.trim();
    }
    return "";
  })();
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: brief, refetch: refetchBrief } = useQuery({
    queryKey: ["brief", briefId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_briefs")
        .select("*")
        .eq("id", briefId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!briefId,
  });

  const { data: outputs = [], refetch: refetchOutputs } = useQuery({
    queryKey: ["pipeline-outputs", briefId],
    queryFn: () => getPipelineOutputs(briefId!),
    enabled: !!briefId,
  });

  const { data: evidencePoints = [], refetch: refetchEvidence } = useQuery({
    queryKey: ["evidence-points", briefId],
    queryFn: () => getEvidencePoints(briefId!),
    enabled: !!briefId,
  });

  const { data: sourceFiles = [] } = useQuery({
    queryKey: ["source-files-all"],
    queryFn: getSourceFiles,
  });
  const libraryFileNames = sourceFiles.map((f: any) => f.name);

  const getStepOutput = (step: PipelineStepType) =>
    outputs.find((o) => o.step_type === step);

  const currentOutput = getStepOutput(activeStep as PipelineStepType);
  const displayContent = generating ? streamContent : currentOutput?.content || "";

  const handleGenerate = async (
    overrideStep?: PipelineStepType,
  ) => {
    if (!briefId) return;
    const step: PipelineStepType = overrideStep || (activeStep as PipelineStepType);
    setGenerating(true);
    setStreamContent("");

    let accumulated = "";

    try {
      await streamGenerateStep(
        briefId,
        step,
        (delta) => {
          accumulated += delta;
          setStreamContent(accumulated);
        },
        async () => {
          await savePipelineOutput(briefId, step, accumulated);
          if (step === "evidence_table") {
            try {
              const drafts = parseEvidenceTable(accumulated);
              if (drafts.length > 0) {
                await replaceEvidencePoints(briefId, drafts);
                await refetchEvidence();
              }
            } catch (err) {
              console.warn("Failed to parse Evidence Table into rows:", err);
            }
          }
          refetchOutputs();
          setGenerating(false);
          toast.success(`${PIPELINE_STEPS.find((s) => s.type === step)?.label} generated`);
        },
        step === "full_script" && selectedHookDirection.trim()
          ? { hookDirection: selectedHookDirection.trim() }
          : undefined,
      );
    } catch (err: any) {
      setGenerating(false);
      toast.error(err.message || "Generation failed");
    }
  };

  const handleGenerateHookOptions = async () => {
    if (!briefId) return;
    setHookOptionsLoading(true);
    try {
      const { hooks } = await generateHookOptions(briefId);
      setHookOptions(hooks);
      setSelectedHookIdx(-1);
      setRefineFeedback("");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate hook options");
    } finally {
      setHookOptionsLoading(false);
    }
  };

  const handleRefineSelectedHook = async () => {
    if (!briefId) return;
    if (selectedHookIdx < 0) return;
    const current = hookOptions[selectedHookIdx];
    if (!current) return;
    if (!refineFeedback.trim()) {
      toast.error("Add feedback to refine this hook.");
      return;
    }
    setRefining(true);
    try {
      const { hook } = await refineHookOption(briefId, current, refineFeedback);
      setHookOptions((prev) => {
        const next = [...prev];
        next[selectedHookIdx] = hook;
        return next;
      });
      setRefineFeedback("");
      toast.success("Hook refined");
    } catch (err: any) {
      toast.error(err.message || "Failed to refine hook");
    } finally {
      setRefining(false);
    }
  };

  const handleApproveCreativeBrief = async () => {
    if (!briefId) return;
    setApproving(true);
    try {
      await updateBriefCreativeBriefFields(briefId, {
        creative_brief_feedback: feedbackText,
        creative_brief_approved: true,
      });
      await refetchBrief();
      toast.success("Creative Brief approved — generating Insights & Research");
      setActiveStep("six_category_extraction");
      setFeedbackText("");
      // Trigger generation of next step immediately
      setTimeout(() => handleGenerate("six_category_extraction"), 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    const step = PIPELINE_STEPS.find((s) => s.type === activeStep);
    const blob = new Blob([displayContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief?.title || "output"} - ${step?.label || activeStep}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (generating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent, generating]);

  if (!briefId) return null;

  const isCreativeBrief = activeStep === "creative_brief";
  const creativeBriefApproved = !!(brief && (brief as any).creative_brief_approved);
  const creativeBriefFeedback = brief && (brief as any).creative_brief_feedback;
  const showCreativeBriefReview = isCreativeBrief && currentOutput && !generating && !creativeBriefApproved;
  const showCreativeBriefApproved = isCreativeBrief && currentOutput && !generating && creativeBriefApproved;

  const fullScriptContent =
    (outputs.find((o) => o.step_type === "full_script")?.content as string | undefined) || "";

  const meltyVoicePassContent =
    (outputs.find((o) => (o.step_type as string) === "melty_voice_pass")?.content as string | undefined) || "";

  // Anti-AI prefers the Melty Voice Pass output when it exists, otherwise falls back to the raw Full Script.
  const antiAiInput = meltyVoicePassContent || fullScriptContent;

  const isFullScriptStep = activeStep === "full_script";
  const isEvidenceTableStep = activeStep === "evidence_table";

  const pendingHighRiskCount = (() => {
    if (evidencePoints.length === 0) return 0;
    // Need to import classifier inline; we'll compute via the same logic.
    let count = 0;
    // Lazy import not possible here; re-derive minimal logic
    for (const r of evidencePoints) {
      const reasons: string[] = [];
      const lib = libraryFileNames.map((n) => n.toLowerCase());
      const sf = (r.source_file || "").toLowerCase();
      const fileMissing =
        !!r.source_file && !lib.some((l) => l.includes(sf) || sf.includes(l));
      const conf = (r.confidence || "").toLowerCase();
      const et = (r.evidence_type || "").toLowerCase();
      const st = (r.source_type || "").toLowerCase();
      if (fileMissing && r.source_file) reasons.push("x");
      if (!r.source_file) reasons.push("x");
      if (conf === "medium" || conf === "low") reasons.push("x");
      if (et === "theory" || et === "speculation" || et === "interpretation") reasons.push("x");
      if (st === "book" && !r.book_evidence) reasons.push("x");
      if (st === "movie" && !r.movie_evidence) reasons.push("x");
      if (st === "both" && (!r.book_evidence || !r.movie_evidence)) reasons.push("x");
      if (st === "commentary" || st === "secondary") reasons.push("x");
      const isHigh = reasons.length > 0;
      if (isHigh && !r.approval_status) count++;
    }
    return count;
  })();

  const handleSetApproval = async (id: string, status: "approved" | "rejected") => {
    try {
      await setEvidencePointApproval(id, status);
      await refetchEvidence();
    } catch (err: any) {
      toast.error(err.message || "Failed to update approval");
    }
  };

  const runFullScriptAntiAi = async () => {
    if (!briefId) return;
    if (!antiAiInput || antiAiInput.trim().length < 50) {
      toast.error("Generate a Full Script first.");
      return;
    }
    setConfirmAntiAiOpen(false);
    setAntiAiRunning(true);
    setAntiAiStream("");
    let acc = "";
    try {
      await streamPolishPass(
        { passType: "anti_ai", scope: "full_script", scriptText: antiAiInput },
        (delta) => {
          acc += delta;
          setAntiAiStream(acc);
        },
        async () => {
          if (!acc.trim()) {
            setAntiAiRunning(false);
            toast.error("Anti AI cleanup returned no content. Nothing was overwritten.");
            return;
          }
          await savePipelineOutput(briefId, "full_script", acc);
          await refetchOutputs();
          setAntiAiRunning(false);
          setAntiAiStream("");
          toast.success("Full Script Anti AI cleanup saved.");
        },
      );
    } catch (err: any) {
      setAntiAiRunning(false);
      toast.error(err.message || "Anti AI cleanup failed");
    }
  };

  const runFullScriptMelty = async () => {
    if (!briefId) return;
    if (!fullScriptContent || fullScriptContent.trim().length < 50) {
      toast.error("Generate a Full Script first.");
      return;
    }
    setMeltyRunning(true);
    setMeltyStream("");
    let acc = "";
    try {
      await streamPolishPass(
        { passType: "melty_voice", scope: "full_script", scriptText: fullScriptContent },
        (delta) => {
          acc += delta;
          setMeltyStream(acc);
        },
        async () => {
          if (!acc.trim()) {
            setMeltyRunning(false);
            toast.error("Melty Voice Pass returned no content.");
            return;
          }
          await savePipelineOutput(briefId, "melty_voice_pass" as PipelineStepType, acc);
          await refetchOutputs();
          setMeltyRunning(false);
          setMeltyStream("");
          toast.success("Melty Voice Pass saved. It will now feed the Anti AI Cleanup.");
        },
      );
    } catch (err: any) {
      setMeltyRunning(false);
      toast.error(err.message || "Melty Voice Pass failed");
    }
  };

  const runPassageRevision = async () => {
    if (!passageInput.trim()) {
      toast.error("Paste a passage to revise.");
      return;
    }
    setPassageRunning(true);
    setPassageOutput("");
    let acc = "";
    try {
      await streamPolishPass(
        {
          passType: "anti_ai",
          scope: "passage",
          scriptText: passageInput,
          userFeedback: passageFeedback,
        },
        (delta) => {
          acc += delta;
          setPassageOutput(acc);
        },
        () => {
          setPassageRunning(false);
          if (!acc.trim()) toast.error("No revised passage returned.");
        },
      );
    } catch (err: any) {
      setPassageRunning(false);
      toast.error(err.message || "Passage revision failed");
    }
  };

  const copyPassageOutput = () => {
    if (!passageOutput) return;
    navigator.clipboard.writeText(passageOutput);
    toast.success("Revised passage copied");
  };

  return (
    <Layout>
      <div className="flex h-screen">
        <PipelineSidebar
          brief={brief || null}
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          generating={generating}
          getStepOutput={getStepOutput}
        />

        <div className="flex-1 flex flex-col">
          <>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="font-mono text-sm font-bold text-foreground">
                {PIPELINE_STEPS.find((s) => s.type === (activeStep as PipelineStepType))?.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {PIPELINE_STEPS.find((s) => s.type === (activeStep as PipelineStepType))?.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {displayContent && !generating && (
                <>
                  <Button size="sm" variant="ghost" onClick={handleCopy} className="gap-1.5 text-xs">
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDownload} className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </Button>
                </>
              )}
              {/* Final Voice Pass moved into Advanced options below */}
              <Button
                size="sm"
                onClick={() => handleGenerate()}
                disabled={
                  generating || (isFullScriptStep && pendingHighRiskCount > 0)
                }
                className="gap-1.5"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : currentOutput ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {showCreativeBriefReview ? (
              <div ref={contentRef} className="h-full overflow-auto p-6">
                <MarkdownContent content={displayContent} />
                <div className="border-t border-border my-6" />
                <div className="space-y-3 max-w-3xl">
                  <Label className="text-sm font-medium">Feedback (optional)</Label>
                  <Textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Add any changes or direction before the pipeline continues. Leave blank to approve as-is."
                    rows={4}
                    className="bg-secondary border-border resize-none"
                  />
                  <Button onClick={handleApproveCreativeBrief} disabled={approving} className="gap-1.5">
                    {approving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Approve & Continue
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : showCreativeBriefApproved ? (
              <div ref={contentRef} className="h-full overflow-auto p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Approved
                  </span>
                </div>
                <MarkdownContent content={displayContent} />
                {creativeBriefFeedback && (
                  <div className="mt-6 p-4 rounded-md bg-secondary/50 border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Your feedback:</p>
                    <p className="text-sm text-foreground/85 whitespace-pre-wrap">{creativeBriefFeedback}</p>
                  </div>
                )}
              </div>
            ) : (
              <div ref={contentRef} className="h-full overflow-auto p-6">
                {isFullScriptStep && pendingHighRiskCount > 0 && (
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-300">
                      <AlertTriangle className="w-4 h-4" />
                      <span>
                        <strong>{pendingHighRiskCount}</strong> high risk evidence point
                        {pendingHighRiskCount === 1 ? "" : "s"} need review before generating the
                        Full Script.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveStep("evidence_table")}
                      className="h-7 text-xs"
                    >
                      Review Evidence Table
                    </Button>
                  </div>
                )}
                {isEvidenceTableStep && evidencePoints.length > 0 && !generating ? (
                  <EvidenceTableView
                    rows={evidencePoints}
                    libraryFileNames={libraryFileNames}
                    onSetApproval={handleSetApproval}
                  />
                ) : displayContent ? (
                  <MarkdownContent content={displayContent} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Play className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">No content generated yet</p>
                    <p className="text-xs text-muted-foreground/60">
                      Click "Generate" to create the{" "}
                      {PIPELINE_STEPS.find((s) => s.type === activeStep)?.label?.toLowerCase()}
                    </p>
                  </div>
                )}

                {generating && (
                  <div className="flex items-center gap-2 mt-4 text-xs text-primary">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Generating from source material...
                  </div>
                )}

                {isFullScriptStep && !generating && (
                  <div className="mt-10 border-t border-border pt-6 max-w-3xl space-y-8">
                    {/* Hook Options (optional) — transient UI state only, never persisted */}
                    <div className="space-y-4 p-4 rounded-md border border-border bg-secondary/30">
                      <div>
                        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-primary" />
                          Hook Options (optional)
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Generates three distinct opening hooks from the saved Creative Brief and Script Evidence Pack.
                          Pick one — the Full Script will open with it verbatim. Not saved — refresh discards.
                        </p>
                      </div>

                      <Button
                        size="sm"
                        onClick={handleGenerateHookOptions}
                        disabled={hookOptionsLoading}
                        className="gap-1.5"
                      >
                        {hookOptionsLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Generating hooks...
                          </>
                        ) : (
                          <>
                            <Lightbulb className="w-3.5 h-3.5" />
                            {hookOptions.length ? "Regenerate hooks" : "Generate Hook Options"}
                          </>
                        )}
                      </Button>

                      {hookOptions.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 mt-2">
                          {hookOptions.map((h, i) => {
                            const isActive = selectedHookIdx === i;
                            return (
                              <div
                                key={i}
                                className={`rounded-md border p-3 bg-background space-y-2 ${
                                  isActive ? "border-primary" : "border-border"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-foreground">
                                      {h.hook_label}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-foreground/70 border border-border">
                                      {h.angle_route}
                                    </span>
                                    {isActive && (
                                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={isActive ? "secondary" : "default"}
                                    onClick={() => {
                                      setSelectedHookIdx(i);
                                      setRefineFeedback("");
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    {isActive ? "Selected" : "Use this hook"}
                                  </Button>
                                </div>
                                <p className="text-sm text-foreground/85 whitespace-pre-wrap">
                                  {h.hook_text}
                                </p>

                                {isActive && (
                                  <div className="space-y-2 pt-2 border-t border-border">
                                    <Label className="text-xs">Refine this hook</Label>
                                    <Textarea
                                      value={refineFeedback}
                                      onChange={(e) => setRefineFeedback(e.target.value)}
                                      rows={2}
                                      placeholder='e.g. "tighten the second sentence", "open with the scene instead of the question", "drop the joke"'
                                      className="bg-background border-border resize-none text-sm"
                                      disabled={refining}
                                    />
                                    <div className="flex justify-end">
                                      <Button
                                        size="sm"
                                        onClick={handleRefineSelectedHook}
                                        disabled={refining || !refineFeedback.trim()}
                                        className="h-7 text-xs gap-1.5"
                                      >
                                        {refining ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Refining...
                                          </>
                                        ) : (
                                          <>
                                            <Wand2 className="w-3.5 h-3.5" />
                                            Regenerate from feedback
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Custom paste — collapsed text-link entry point */}
                      <div className="pt-2 border-t border-border">
                        {!customHookOpen ? (
                          <button
                            type="button"
                            onClick={() => setCustomHookOpen(true)}
                            className="text-xs text-primary hover:underline"
                          >
                            Write my own opening
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Your own opening</Label>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomHookOpen(false);
                                  if (selectedHookIdx === -2) setSelectedHookIdx(-1);
                                  setCustomHookText("");
                                }}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                            <Textarea
                              value={customHookText}
                              onChange={(e) => setCustomHookText(e.target.value)}
                              rows={6}
                              placeholder="Paste or write your own hook. The Full Script will open with it verbatim."
                              className="bg-background border-border resize-none text-sm"
                            />
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant={selectedHookIdx === -2 ? "secondary" : "default"}
                                disabled={!customHookText.trim()}
                                onClick={() => setSelectedHookIdx(-2)}
                                className="h-7 text-xs"
                              >
                                {selectedHookIdx === -2 ? "Selected" : "Use this hook"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Script Cleanup & Passage Rewrite
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Focused post-generation tools. Neither tool uses the Creative Brief,
                        Evidence Pack, Beat Plan, or any pipeline context.
                      </p>
                    </div>

                    {/* Tool 1a — Melty Voice Pass (runs before Anti AI Cleanup) */}
                    <div className="space-y-3 p-4 rounded-md border border-border bg-secondary/30">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Melty Voice Pass
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Step 1 of 2
                          </span>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Injects Melty's personality, reactive beats, and fan-coded voice into the
                          full script draft. Saved separately; the Anti AI Cleanup below will use this
                          output as its input once it exists.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={runFullScriptMelty}
                        disabled={meltyRunning || !fullScriptContent}
                        className="gap-1.5"
                      >
                        {meltyRunning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Running Melty Voice Pass...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            {meltyVoicePassContent ? "Re-run Melty Voice Pass" : "Run Melty Voice Pass"}
                          </>
                        )}
                      </Button>
                      {meltyRunning && meltyStream && (
                        <div className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background p-3 text-xs whitespace-pre-wrap text-foreground/80">
                          {meltyStream}
                          <div className="flex items-center gap-2 mt-2 text-primary">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Streaming Melty Voice Pass... will save when complete.
                          </div>
                        </div>
                      )}
                      {!meltyRunning && meltyVoicePassContent && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-muted-foreground">
                              Melty Voice Pass output (saved). Will feed the Anti AI Cleanup below.
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(meltyVoicePassContent);
                                toast.success("Copied Melty Voice Pass output");
                              }}
                              className="gap-1.5 text-xs h-7"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </Button>
                          </div>
                          <div className="max-h-96 overflow-auto rounded border border-border bg-background p-3 text-xs whitespace-pre-wrap text-foreground">
                            {meltyVoicePassContent}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tool 1b — Full Script Anti AI Cleanup */}
                    <div className="space-y-3 p-4 rounded-md border border-border bg-secondary/30">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Full Script Anti AI Cleanup
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Step 2 of 2
                          </span>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Runs the {meltyVoicePassContent ? "saved Melty Voice Pass" : "saved Full Script"}{" "}
                          through the Anti AI document. Overwrites the saved Full Script after you
                          confirm and the run completes.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setConfirmAntiAiOpen(true)}
                        disabled={antiAiRunning || !antiAiInput}
                        className="gap-1.5"
                      >
                        {antiAiRunning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Cleaning...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Run Full Script Anti AI Cleanup
                          </>
                        )}
                      </Button>
                      {antiAiRunning && antiAiStream && (
                        <div className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background p-3 text-xs whitespace-pre-wrap text-foreground/80">
                          {antiAiStream}
                          <div className="flex items-center gap-2 mt-2 text-primary">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Streaming Anti AI cleanup... will save when complete.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tool 2 — Passage Rewrite */}
                    <div className="space-y-3 p-4 rounded-md border border-border bg-secondary/30">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Passage Rewrite</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Paste a hook, transition, paragraph, or section. Uses Script Writing,
                          Anti AI, and Melty guidance together. Returns the revised passage only and
                          never saves automatically.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Pasted passage</Label>
                        <Textarea
                          value={passageInput}
                          onChange={(e) => setPassageInput(e.target.value)}
                          rows={6}
                          placeholder="Paste the passage to revise..."
                          className="bg-background border-border resize-none text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Feedback (optional)</Label>
                        <Textarea
                          value={passageFeedback}
                          onChange={(e) => setPassageFeedback(e.target.value)}
                          rows={3}
                          placeholder='e.g. "this hook is not strong enough", "make this less academic", "remove the contrast formula"'
                          className="bg-background border-border resize-none text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={runPassageRevision}
                        disabled={passageRunning || !passageInput.trim()}
                        className="gap-1.5"
                      >
                        {passageRunning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Revising...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            Revise Passage
                          </>
                        )}
                      </Button>
                      {passageOutput && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Revised passage</Label>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={copyPassageOutput}
                              className="gap-1.5 text-xs h-7"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </Button>
                          </div>
                          <div className="rounded border border-border bg-background p-3 text-sm whitespace-pre-wrap text-foreground/85">
                            {passageOutput}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
          </>
        </div>
      </div>

      <AlertDialog open={confirmAntiAiOpen} onOpenChange={setConfirmAntiAiOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite saved Full Script?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs the entire saved Full Script through the Anti AI Writing Instructions
              document. When the stream finishes successfully, the revised version will replace the
              saved Full Script. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runFullScriptAntiAi}>Run & Overwrite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-mono prose-headings:text-foreground prose-p:text-foreground/85 prose-strong:text-foreground prose-a:text-primary prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-th:text-foreground prose-td:text-foreground/80 prose-table:border-border">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

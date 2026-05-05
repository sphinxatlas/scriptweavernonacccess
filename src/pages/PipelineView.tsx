import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { PipelineSidebar } from "@/components/pipeline/PipelineSidebar";
import { ClipQuoteFinderPanel } from "@/components/pipeline/ClipQuoteFinderPanel";
import {
  PIPELINE_STEPS,
  getPipelineOutputs,
  savePipelineOutput,
  streamGenerateStep,
  updateBriefCreativeBriefFields,
  type PipelineStepType,
} from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  Copy,
  Download,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

type ActiveStep = PipelineStepType | "clip_quote_finder";

export default function PipelineView() {
  const { briefId } = useParams<{ briefId: string }>();
  const [activeStep, setActiveStep] = useState<ActiveStep>("creative_brief");
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [approving, setApproving] = useState(false);
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

  const getStepOutput = (step: PipelineStepType) =>
    outputs.find((o) => o.step_type === step);

  const isClipFinder = activeStep === "clip_quote_finder";
  const currentOutput = isClipFinder ? undefined : getStepOutput(activeStep as PipelineStepType);
  const displayContent = generating ? streamContent : currentOutput?.content || "";

  const handleGenerate = async (
    overrideStep?: PipelineStepType,
  ) => {
    if (!briefId) return;
    const step: PipelineStepType =
      overrideStep || (activeStep === "clip_quote_finder" ? "full_script" : (activeStep as PipelineStepType));
    if (activeStep === "clip_quote_finder" && !overrideStep) return;
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
          refetchOutputs();
          setGenerating(false);
          toast.success(`${PIPELINE_STEPS.find((s) => s.type === step)?.label} generated`);
        },
      );
    } catch (err: any) {
      setGenerating(false);
      toast.error(err.message || "Generation failed");
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
          {isClipFinder ? (
            <>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="font-mono text-sm font-bold text-foreground">Clip & Quote Finder</h2>
                  <p className="text-xs text-muted-foreground">
                    Editor-only utility — does not affect the pipeline.
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <ClipQuoteFinderPanel
                  briefId={briefId}
                  briefTitle={brief?.title}
                  initialScript={fullScriptContent}
                />
              </div>
            </>
          ) : (
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
              <Button size="sm" onClick={() => handleGenerate()} disabled={generating} className="gap-1.5">
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
                {displayContent ? (
                  <>
                    {activeStep === "full_script" && lastPassLabel && !generating && (
                      <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/30">
                        <Sparkles className="w-3 h-3" />
                        {lastPassLabel}
                      </div>
                    )}
                    <MarkdownContent content={displayContent} />
                  </>
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

                {showFullScriptRevision && (
                  <div className="mt-8 border-t border-border pt-6 max-w-3xl">
                    <div className="mb-8">
                      <h3 className="text-sm font-mono font-bold text-foreground mb-1">
                        Final Polish (optional)
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Run the finished script through a single guidance document as a focused rewrite pass. Each pass is independent and overwrites the current Full Script. Edits you make manually elsewhere should be saved back here before running.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunPolishPass("script_writing")}
                          disabled={generating}
                          className="gap-1.5"
                        >
                          {runningPass === "script_writing" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileCheck2 className="w-3.5 h-3.5" />
                          )}
                          Run Script Writing Pass
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunPolishPass("anti_ai")}
                          disabled={generating}
                          className="gap-1.5"
                        >
                          {runningPass === "anti_ai" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          Run Anti AI Pass
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunPolishPass("melty_voice")}
                          disabled={generating}
                          className="gap-1.5"
                        >
                          {runningPass === "melty_voice" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mic className="w-3.5 h-3.5" />
                          )}
                          Melty Voice Polish
                        </Button>
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedPolish((v) => !v)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${showAdvancedPolish ? "rotate-180" : ""}`}
                          />
                          Advanced options
                        </button>
                        {showAdvancedPolish && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleFinalVoicePass}
                              disabled={generating}
                              className="gap-1.5 text-xs"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Final Voice Pass (legacy)
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <h3 className="text-sm font-mono font-bold text-foreground flex items-center gap-2">
                        <Wand2 className="w-3.5 h-3.5 text-primary" />
                        Revise this Full Script
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pipeline step revision for the current Full Script. Not the separate Script Improver tool. Your feedback is reapplied with the full pipeline context (brief, evidence, outline, sources, persona, and writing guidance).
                      </p>
                    </div>

                    <Label className="text-xs font-medium">Revision Feedback (required)</Label>
                    <Textarea
                      value={revisionFeedback}
                      onChange={(e) => setRevisionFeedback(e.target.value)}
                      placeholder="Tell ScriptForge what to improve in this script. You can mention content, structure, repetition, pacing, tone, missing context, argument strength, source use, or anything else."
                      rows={6}
                      className="bg-secondary border-border resize-none mt-1.5"
                    />

                    <p className="text-[11px] text-muted-foreground mt-3 mb-2">
                      Optional quick chips — click to append helpful feedback. None are required.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REVISION_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => appendChip(chip.append)}
                          className="text-[11px] px-2 py-1 rounded-md border border-border bg-secondary/50 hover:bg-secondary text-foreground/80 hover:text-foreground transition-colors"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={handleReviseFullScript}
                        disabled={!revisionFeedback.trim() || generating}
                        className="gap-1.5"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Revise Full Script
                      </Button>
                      {!revisionFeedback.trim() && (
                        <span className="text-[11px] text-muted-foreground">
                          Please add revision feedback before regenerating.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
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

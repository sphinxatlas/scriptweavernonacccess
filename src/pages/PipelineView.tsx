import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PipelineSidebar } from "@/components/pipeline/PipelineSidebar";
import { EvidencePanel } from "@/components/pipeline/EvidencePanel";
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
  Star,
  ThumbsUp,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PipelineView() {
  const { briefId } = useParams<{ briefId: string }>();
  const [activeStep, setActiveStep] = useState<PipelineStepType>("creative_brief");
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [approving, setApproving] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");
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

  const currentOutput = getStepOutput(activeStep);
  const displayContent = generating ? streamContent : currentOutput?.content || "";

  const handleGenerate = async (
    overrideStep?: PipelineStepType,
    revisionOpts?: { revisionFeedback: string; previousFullScript: string },
  ) => {
    if (!briefId) return;
    const step = overrideStep || activeStep;
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
          if (revisionOpts) setRevisionFeedback("");
        },
        starredOnly,
        revisionOpts
          ? {
              revisionFeedback: revisionOpts.revisionFeedback,
              previousFullScript: revisionOpts.previousFullScript,
            }
          : undefined,
      );
    } catch (err: any) {
      setGenerating(false);
      toast.error(err.message || "Generation failed");
    }
  };

  const handleReviseFullScript = () => {
    const fb = revisionFeedback.trim();
    if (!fb) {
      toast.error("Please add revision feedback before regenerating.");
      return;
    }
    const prev = (currentOutput?.content || "").toString();
    handleGenerate("full_script", { revisionFeedback: fb, previousFullScript: prev });
  };

  const REVISION_CHIPS: { label: string; append: string }[] = [
    { label: "Reduce repetition", append: "Reduce repetition and remove points that are being made more than once. Keep the strongest version of each idea." },
    { label: "Sharpen the argument", append: "Make the central argument sharper and more decisive. Cut hedging and tighten the logic." },
    { label: "Add more canon evidence", append: "Add more specific canon evidence from the books and movie transcripts to support the key claims." },
    { label: "More book/movie contrast", append: "Use more direct book vs movie contrast where the adaptation choices reveal something meaningful." },
    { label: "More personality / Melty-driven", append: "Make the voice feel more personality-driven and host-led, not detached or generic." },
    { label: "Stronger hook", append: "Rewrite the hook so it lands harder in the first 15 seconds and earns the watch." },
    { label: "Improve pacing", append: "Improve pacing — speed up slow stretches, add rehooks, and remove sections that drag." },
    { label: "Stronger ending", append: "Make the ending stronger, with a sharper payoff and a more memorable closing line." },
    { label: "Add more context", append: "Add more context where the argument assumes the viewer already knows the setup." },
    { label: "Less generic", append: "Make the writing less generic. Replace vague phrasing with specific scenes, lines, and moments." },
    { label: "More emotionally engaging", append: "Make it more emotionally engaging — name the feeling, not just the fact." },
    { label: "More plausible theory", append: "Make any theories feel more plausible by grounding them more clearly in canon detail." },
    { label: "Less academic", append: "Make the script less academic and more YouTube-spoken — like a creator talking, not an essay being read." },
    { label: "Add 'so what' after evidence", append: "After every evidence beat, add a clear 'so what' — the takeaway or interpretation, not just the fact." },
    { label: "Smoother transitions", append: "Smooth out the transitions between sections so the script flows as one continuous argument." },
    { label: "More YouTube-native", append: "Make it more YouTube-native: conversational, opinionated, and built for retention." },
    { label: "Strengthen the conclusion", append: "Strengthen the conclusion so the thesis lands with weight and the viewer feels the argument was proven." },
    { label: "Keep title/angle present", append: "Keep the title and core angle visibly present throughout the script, not just in the hook and outro." },
  ];

  const appendChip = (text: string) => {
    setRevisionFeedback((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      return trimmed + "\n\n" + text;
    });
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

  const showStarredToggle = activeStep === "outline" || activeStep === "full_script";
  const showEvidenceTab = activeStep === "evidence_table" && !generating;
  const isCreativeBrief = activeStep === "creative_brief";
  const creativeBriefApproved = !!(brief && (brief as any).creative_brief_approved);
  const creativeBriefFeedback = brief && (brief as any).creative_brief_feedback;
  const showCreativeBriefReview = isCreativeBrief && currentOutput && !generating && !creativeBriefApproved;
  const showCreativeBriefApproved = isCreativeBrief && currentOutput && !generating && creativeBriefApproved;
  const showFullScriptRevision =
    activeStep === "full_script" && !!currentOutput && !generating;

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
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="font-mono text-sm font-bold text-foreground">
                {PIPELINE_STEPS.find((s) => s.type === activeStep)?.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {PIPELINE_STEPS.find((s) => s.type === activeStep)?.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {showStarredToggle && (
                <div className="flex items-center gap-2 mr-2 border-r border-border pr-3">
                  <Switch checked={starredOnly} onCheckedChange={setStarredOnly} />
                  <Label className="text-xs flex items-center gap-1 cursor-pointer">
                    <Star className="w-3 h-3 text-primary" />
                    Starred only
                  </Label>
                </div>
              )}
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
            ) : showEvidenceTab && currentOutput ? (
              <Tabs defaultValue="output" className="h-full flex flex-col">
                <TabsList className="mx-6 mt-3 w-fit">
                  <TabsTrigger value="output" className="text-xs">Generated Output</TabsTrigger>
                  <TabsTrigger value="evidence" className="text-xs gap-1">
                    <Star className="w-3 h-3" />
                    Evidence Points
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="output" className="flex-1 overflow-auto p-6">
                  <MarkdownContent content={displayContent} />
                </TabsContent>
                <TabsContent value="evidence" className="flex-1 overflow-auto p-6">
                  <EvidencePanel briefId={briefId} />
                </TabsContent>
              </Tabs>
            ) : (
              <div ref={contentRef} className="h-full overflow-auto p-6">
                {displayContent ? (
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
              </div>
            )}
          </div>
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

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  PIPELINE_STEPS,
  getPipelineOutputs,
  savePipelineOutput,
  streamGenerateStep,
  type PipelineStepType,
} from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  RotateCcw,
  Copy,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PipelineView() {
  const { briefId } = useParams<{ briefId: string }>();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState<PipelineStepType>("evidence_table");
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: brief } = useQuery({
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

  const {
    data: outputs = [],
    refetch: refetchOutputs,
  } = useQuery({
    queryKey: ["pipeline-outputs", briefId],
    queryFn: () => getPipelineOutputs(briefId!),
    enabled: !!briefId,
  });

  const getStepOutput = (step: PipelineStepType) =>
    outputs.find((o) => o.step_type === step);

  const currentOutput = getStepOutput(activeStep);
  const displayContent = generating ? streamContent : currentOutput?.content || "";

  const handleGenerate = async () => {
    if (!briefId) return;
    setGenerating(true);
    setStreamContent("");

    let accumulated = "";

    try {
      await streamGenerateStep(
        briefId,
        activeStep,
        (delta) => {
          accumulated += delta;
          setStreamContent(accumulated);
        },
        async () => {
          // Save the complete output
          await savePipelineOutput(briefId, activeStep, accumulated);
          refetchOutputs();
          setGenerating(false);
          toast.success(`${PIPELINE_STEPS.find(s => s.type === activeStep)?.label} generated`);
        }
      );
    } catch (err: any) {
      setGenerating(false);
      toast.error(err.message || "Generation failed");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    const step = PIPELINE_STEPS.find(s => s.type === activeStep);
    const blob = new Blob([displayContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief?.title || "output"} - ${step?.label || activeStep}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-scroll during generation
  useEffect(() => {
    if (generating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent, generating]);

  if (!briefId) return null;

  return (
    <Layout>
      <div className="flex h-screen">
        {/* Step sidebar */}
        <div className="w-56 border-r border-border p-4 flex flex-col">
          <button
            onClick={() => navigate("/briefs")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Briefs
          </button>

          {brief && (
            <div className="mb-4 pb-4 border-b border-border">
              <h2 className="font-mono text-xs font-bold text-foreground line-clamp-2">{brief.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{brief.description}</p>
            </div>
          )}

          <div className="space-y-1 flex-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const hasOutput = !!getStepOutput(step.type);
              const isActive = activeStep === step.type;

              return (
                <button
                  key={step.type}
                  onClick={() => !generating && setActiveStep(step.type)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    generating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {hasOutput ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium truncate">{step.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="font-mono text-sm font-bold text-foreground">
                {PIPELINE_STEPS.find(s => s.type === activeStep)?.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {PIPELINE_STEPS.find(s => s.type === activeStep)?.description}
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
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
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

          <div ref={contentRef} className="flex-1 overflow-auto p-6">
            {displayContent ? (
              <div className="prose prose-invert prose-sm max-w-none prose-headings:font-mono prose-headings:text-foreground prose-p:text-foreground/85 prose-strong:text-foreground prose-a:text-primary prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-th:text-foreground prose-td:text-foreground/80 prose-table:border-border">
                <ReactMarkdown>{displayContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  No content generated yet
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Click "Generate" to create the {PIPELINE_STEPS.find(s => s.type === activeStep)?.label?.toLowerCase()}
                </p>
              </div>
            )}

            {generating && (
              <div className="flex items-center gap-2 mt-4 text-xs text-primary">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                Generating from source material...
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

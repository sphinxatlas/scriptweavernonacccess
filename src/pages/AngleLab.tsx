import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { streamAngleLab } from "@/lib/api";
import { toast } from "sonner";
import { Lightbulb, Sparkles, ArrowRight, Copy } from "lucide-react";

function extractHandoff(output: string): string {
  // Pulls everything under the "## Creative Brief Handoff Text" heading.
  const marker = /##\s*Creative Brief Handoff Text\s*\n/i;
  const match = output.match(marker);
  if (!match || match.index === undefined) return "";
  const after = output.slice(match.index + match[0].length);
  // Stop at the next H2 if any
  const next = after.search(/\n##\s+/);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

export default function AngleLab() {
  const navigate = useNavigate();
  const [workingIdea, setWorkingIdea] = useState("");
  const [directions, setDirections] = useState("");
  const [notes, setNotes] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!workingIdea.trim()) {
      toast.error("Working idea is required");
      return;
    }
    setRunning(true);
    setOutput("");
    try {
      await streamAngleLab(
        {
          workingIdea: workingIdea.trim(),
          directions: directions.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        (delta) => setOutput((prev) => prev + delta),
        () => {},
      );
    } catch (err: any) {
      toast.error(err.message || "Angle Lab failed");
    } finally {
      setRunning(false);
    }
  };

  const handoff = extractHandoff(output);

  const handleCopy = async () => {
    if (!handoff) return;
    await navigator.clipboard.writeText(handoff);
    toast.success("Handoff text copied");
  };

  const handleUseForBrief = () => {
    if (!handoff) {
      toast.error("No handoff text yet — run the analysis first");
      return;
    }
    sessionStorage.setItem(
      "angleLabPrefill",
      JSON.stringify({
        title: workingIdea.trim(),
        angle_note: handoff,
      }),
    );
    navigate("/briefs?from=angle-lab");
  };

  return (
    <Layout>
      <div className="p-8 max-w-5xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-mono font-bold text-foreground">Angle Lab</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Pre-brief brainstorming. Refine a rough Harry Potter video idea into a stronger angle before
              creating a Topic Brief. No titles. No script. Just angle strength, argument routes, and a
              clean handoff into the brief.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="border border-border rounded-lg p-5 bg-card space-y-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">Inputs</h2>

            <div>
              <Label className="text-xs text-muted-foreground">
                Working idea <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder='e.g., "The biggest plot hole that ruined Harry Potter"'
                value={workingIdea}
                onChange={(e) => setWorkingIdea(e.target.value)}
                className="bg-secondary border-border mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Possible topics / directions (optional)</Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                One per line. The lab will judge each one.
              </p>
              <Textarea
                placeholder={"- Marauder's Map and Peter Pettigrew\n- Hermione's Time Turner\n- The Trace\n- Fidelius Charm"}
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                rows={6}
                className="bg-secondary border-border resize-none text-sm"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">My notes / instinct (optional)</Label>
              <Textarea
                placeholder="e.g., I want this to feel dramatic, surprising, and strong enough for a full video."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="bg-secondary border-border resize-none text-sm"
              />
            </div>

            <Button onClick={handleRun} disabled={running} className="gap-1.5 w-full">
              <Sparkles className="w-4 h-4" />
              {running ? "Brainstorming…" : "Run Angle Lab"}
            </Button>

            <p className="text-[11px] text-muted-foreground/70">
              Uses your Source Library: commentary transcripts and HP topic transcripts heavily for angle
              ideas, books and movie transcripts to sense-check canon support.
            </p>
          </div>

          {/* Output */}
          <div className="border border-border rounded-lg p-5 bg-card flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-sm font-semibold text-foreground">Analysis</h2>
              {handoff && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={handleCopy} className="gap-1.5 h-7 text-xs">
                    <Copy className="w-3.5 h-3.5" />
                    Copy handoff
                  </Button>
                  <Button size="sm" onClick={handleUseForBrief} className="gap-1.5 h-7 text-xs">
                    Use for Topic Brief
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {output ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground flex-1 overflow-auto">
                {output}
              </pre>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                {running ? "Streaming analysis…" : "Output will appear here."}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
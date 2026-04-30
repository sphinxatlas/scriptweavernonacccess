import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  streamAngleLab,
  listAngleLabRuns,
  createAngleLabRun,
  deleteAngleLabRun,
  type AngleLabRun,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Lightbulb,
  Sparkles,
  ArrowRight,
  Copy,
  Trash2,
  History,
  ChevronRight,
} from "lucide-react";

// ── Parsing helpers ──

interface ParsedDirection {
  name: string;
  body: string; // full markdown body of this direction (without the heading line)
  coreAngle: string;
  recommendationScore: string;
}

interface ParsedOutput {
  directions: ParsedDirection[];
  bestRecommended: string;
  handoff: string;
}

function extractSection(output: string, headingRegex: RegExp): string {
  const match = output.match(headingRegex);
  if (!match || match.index === undefined) return "";
  const after = output.slice(match.index + match[0].length);
  const next = after.search(/\n##\s+/);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

function extractField(body: string, label: string): string {
  // matches lines like "- **Core angle:** something" possibly continuing on next lines
  const re = new RegExp(
    `[-*]\\s*\\*\\*${label}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n[-*]\\s*\\*\\*|\\n###\\s|\\n##\\s|$)`,
    "i",
  );
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

function parseOutput(output: string): ParsedOutput {
  const directions: ParsedDirection[] = [];

  // Split by "### Direction:" headings
  const dirRegex = /###\s*Direction:\s*([^\n]+)\n([\s\S]*?)(?=\n###\s*Direction:|\n##\s+|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = dirRegex.exec(output)) !== null) {
    const name = m[1].trim().replace(/^\[|\]$/g, "").trim();
    const body = m[2].trim();
    directions.push({
      name,
      body,
      coreAngle: extractField(body, "Core angle"),
      recommendationScore: extractField(body, "Recommendation score"),
    });
  }

  const bestRecommended = extractSection(output, /##\s*Best Recommended Angle\s*\n/i);
  const handoff = extractSection(output, /##\s*Creative Brief Handoff Text\s*\n/i);

  return { directions, bestRecommended, handoff };
}

function pushPrefillAndGo(
  navigate: ReturnType<typeof useNavigate>,
  title: string,
  angleNote: string,
) {
  sessionStorage.setItem(
    "angleLabPrefill",
    JSON.stringify({ title, angle_note: angleNote }),
  );
  navigate("/briefs?from=angle-lab");
}

export default function AngleLab() {
  const navigate = useNavigate();

  // Form state
  const [workingIdea, setWorkingIdea] = useState("");
  const [directions, setDirections] = useState("");
  const [notes, setNotes] = useState("");

  // Run / output state
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<AngleLabRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = async () => {
    try {
      const runs = await listAngleLabRuns();
      setHistory(runs);
    } catch (err: any) {
      toast.error(err.message || "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const parsed = useMemo(() => parseOutput(output), [output]);

  const handleRun = async () => {
    if (!workingIdea.trim()) {
      toast.error("Working idea is required");
      return;
    }
    setRunning(true);
    setOutput("");
    setActiveRunId(null);
    let acc = "";
    try {
      await streamAngleLab(
        {
          workingIdea: workingIdea.trim(),
          directions: directions.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        (delta) => {
          acc += delta;
          setOutput((prev) => prev + delta);
        },
        () => {},
      );

      // Save run on completion
      const parsedFinal = parseOutput(acc);
      try {
        const saved = await createAngleLabRun({
          working_idea: workingIdea.trim(),
          possible_topics: directions.trim() || undefined,
          user_notes: notes.trim() || undefined,
          raw_output: acc,
          parsed_directions: {
            directions: parsedFinal.directions,
            bestRecommended: parsedFinal.bestRecommended,
            handoff: parsedFinal.handoff,
          },
        });
        setActiveRunId(saved.id);
        await loadHistory();
        toast.success("Angle Lab run saved");
      } catch (saveErr: any) {
        toast.error(saveErr.message || "Failed to save run");
      }
    } catch (err: any) {
      toast.error(err.message || "Angle Lab failed");
    } finally {
      setRunning(false);
    }
  };

  const openRun = (run: AngleLabRun) => {
    setActiveRunId(run.id);
    setWorkingIdea(run.working_idea);
    setDirections(run.possible_topics || "");
    setNotes(run.user_notes || "");
    setOutput(run.raw_output || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this Angle Lab run?")) return;
    try {
      await deleteAngleLabRun(id);
      if (activeRunId === id) {
        setActiveRunId(null);
        setOutput("");
      }
      await loadHistory();
      toast.success("Run deleted");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  const handleCopyHandoff = async () => {
    if (!parsed.handoff) {
      toast.error("No handoff text yet");
      return;
    }
    await navigator.clipboard.writeText(parsed.handoff);
    toast.success("Handoff text copied");
  };

  const handleUseBestForBrief = () => {
    if (!parsed.handoff) {
      toast.error("No handoff text yet — run the analysis first");
      return;
    }
    pushPrefillAndGo(navigate, workingIdea.trim(), parsed.handoff);
  };

  const handleUseDirectionForBrief = (dir: ParsedDirection) => {
    const title = dir.name || workingIdea.trim();
    const parts: string[] = [];
    if (dir.coreAngle) parts.push(`Core angle: ${dir.coreAngle}`);
    if (dir.body) parts.push(dir.body);
    if (notes.trim()) parts.push(`Creator notes: ${notes.trim()}`);
    const angleNote = parts.join("\n\n");
    pushPrefillAndGo(navigate, title, angleNote);
  };

  const handleCopyDirection = async (dir: ParsedDirection) => {
    const text = `### Direction: ${dir.name}\n${dir.body}`;
    await navigator.clipboard.writeText(text);
    toast.success(`Copied "${dir.name}"`);
  };

  return (
    <Layout>
      <div className="p-8 max-w-7xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-mono font-bold text-foreground">Angle Lab</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Pre-brief brainstorming. Refine a rough Harry Potter video idea into a stronger angle
              before creating a Topic Brief. No titles. No script. Just angle strength, argument
              routes, and a clean handoff into the brief.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Inputs */}
          <div className="border border-border rounded-lg p-5 bg-card space-y-4 lg:col-span-1 h-fit">
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
              <Label className="text-xs text-muted-foreground">
                Possible topics / directions (optional)
              </Label>
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                One per line. The lab will judge each one.
              </p>
              <Textarea
                placeholder={
                  "- Marauder's Map and Peter Pettigrew\n- Hermione's Time Turner\n- The Trace\n- Fidelius Charm"
                }
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                rows={6}
                className="bg-secondary border-border resize-none text-sm"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                My notes / instinct (optional)
              </Label>
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
              Uses your Source Library: commentary transcripts and HP topic transcripts heavily for
              angle ideas, books and movie transcripts to sense-check canon support.
            </p>

            {/* History */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-mono text-xs font-semibold text-foreground">
                  Saved runs
                </h3>
              </div>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved runs yet.</p>
              ) : (
                <ul className="space-y-1.5 max-h-[400px] overflow-auto">
                  {history.map((run) => (
                    <li key={run.id}>
                      <button
                        onClick={() => openRun(run)}
                        className={`w-full text-left p-2 rounded-md border transition-colors group ${
                          activeRunId === run.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-secondary"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">
                              {run.working_idea}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(run.created_at).toLocaleString()}
                            </p>
                          </div>
                          <span
                            onClick={(e) => handleDelete(run.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 cursor-pointer"
                            role="button"
                            aria-label="Delete run"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right: Output */}
          <div className="lg:col-span-2 space-y-4">
            {!output ? (
              <div className="border border-border rounded-lg p-10 bg-card flex items-center justify-center min-h-[400px] text-sm text-muted-foreground">
                {running ? "Streaming analysis…" : "Run the lab or open a saved run to see the analysis here."}
              </div>
            ) : (
              <>
                {/* Per-direction cards */}
                {parsed.directions.length > 0 ? (
                  <div className="space-y-3">
                    {parsed.directions.map((dir, idx) => (
                      <div
                        key={`${dir.name}-${idx}`}
                        className="border border-border rounded-lg bg-card overflow-hidden"
                      >
                        <div className="p-4 border-b border-border bg-secondary/30 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                              <h3 className="font-mono text-sm font-semibold text-foreground truncate">
                                {dir.name}
                              </h3>
                            </div>
                            {dir.recommendationScore && (
                              <p className="text-[11px] text-muted-foreground mt-1 ml-6">
                                Score: {dir.recommendationScore}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopyDirection(dir)}
                              className="gap-1.5 h-7 text-xs"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUseDirectionForBrief(dir)}
                              className="gap-1.5 h-7 text-xs"
                            >
                              Use for Topic Brief
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground p-4">
                          {dir.body}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Fallback: show raw output while still streaming or if parsing fails
                  <div className="border border-border rounded-lg p-5 bg-card">
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground">
                      {output}
                    </pre>
                  </div>
                )}

                {/* Best recommended */}
                {parsed.bestRecommended && (
                  <div className="border border-primary/40 rounded-lg bg-primary/5 p-5">
                    <h3 className="font-mono text-sm font-semibold text-foreground mb-2">
                      Best Recommended Angle
                    </h3>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground">
                      {parsed.bestRecommended}
                    </pre>
                  </div>
                )}

                {/* Handoff */}
                {parsed.handoff && (
                  <div className="border border-border rounded-lg bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-mono text-sm font-semibold text-foreground">
                        Creative Brief Handoff Text
                      </h3>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCopyHandoff}
                          className="gap-1.5 h-7 text-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy handoff
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleUseBestForBrief}
                          className="gap-1.5 h-7 text-xs"
                        >
                          Use Best for Topic Brief
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground">
                      {parsed.handoff}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
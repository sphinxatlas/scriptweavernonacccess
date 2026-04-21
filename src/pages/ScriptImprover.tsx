import { useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { streamImproveScript, type ReferenceHit } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Upload, Copy, Download, ChevronDown, Loader2, BookOpen, Maximize2, MessageSquarePlus } from "lucide-react";

export default function ScriptImprover() {
  const [draft, setDraft] = useState("");
  const [toneNote, setToneNote] = useState("");
  const [targetMin, setTargetMin] = useState<string>("");
  const [targetMax, setTargetMax] = useState<string>("");
  const [output, setOutput] = useState("");
  const [refs, setRefs] = useState<ReferenceHit[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [revisionMode, setRevisionMode] = useState<"initial" | "lengthen" | "feedback" | null>(null);
  const [revisionCount, setRevisionCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      toast.error("Only .txt or .md files are supported");
      return;
    }
    const text = await file.text();
    setDraft(text);
    toast.success(`Loaded ${file.name}`);
  };

  const handleImprove = async () => {
    if (draft.trim().length < 50) {
      toast.error("Paste a draft of at least a few sentences first");
      return;
    }
    setOutput("");
    setRefs([]);
    setIsStreaming(true);
    setRevisionMode("initial");
    setRevisionCount(0);
    try {
      await streamImproveScript(
        {
          draftScript: draft,
          targetMinWords: targetMin ? parseInt(targetMin, 10) : undefined,
          targetMaxWords: targetMax ? parseInt(targetMax, 10) : undefined,
          toneNote: toneNote || undefined,
          mode: "initial",
        },
        (delta) => setOutput((prev) => prev + delta),
        () => {
          setIsStreaming(false);
          setRevisionMode(null);
        },
        (hits) => setRefs(hits),
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to improve script");
      setIsStreaming(false);
      setRevisionMode(null);
    }
  };

  const runRevision = async (mode: "lengthen" | "feedback") => {
    if (!output || output.trim().length < 50) {
      toast.error("Generate an improved script first");
      return;
    }
    if (mode === "feedback" && feedbackNote.trim().length < 3) {
      toast.error("Add some feedback notes first");
      return;
    }
    const previous = output;
    setOutput("");
    setRefs([]);
    setIsStreaming(true);
    setRevisionMode(mode);
    try {
      await streamImproveScript(
        {
          draftScript: draft,
          targetMinWords: targetMin ? parseInt(targetMin, 10) : undefined,
          targetMaxWords: targetMax ? parseInt(targetMax, 10) : undefined,
          toneNote: toneNote || undefined,
          mode,
          previousOutput: previous,
          feedbackNote: mode === "feedback" ? feedbackNote : undefined,
        },
        (delta) => setOutput((prev) => prev + delta),
        () => {
          setIsStreaming(false);
          setRevisionMode(null);
          setRevisionCount((n) => n + 1);
          if (mode === "feedback") setFeedbackNote("");
        },
        (hits) => setRefs(hits),
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to revise script");
      setOutput(previous);
      setIsStreaming(false);
      setRevisionMode(null);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `improved-script-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-mono font-bold text-foreground mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Script Improver
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Paste or upload a draft script. We rewrite it using your Script Writing Instructions as the highest-priority guide,
            apply the Anti-AI Language Guide, and insert editor reference tags from your indexed source library where claims match canon.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <Card className="p-5 space-y-4 bg-card border-border">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold text-foreground">Draft Script</h2>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload .txt / .md
                </Button>
              </div>
            </div>

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your draft script here…"
              className="min-h-[360px] font-mono text-sm bg-background"
              disabled={isStreaming}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="min-words" className="text-xs text-muted-foreground">Target min words (optional)</Label>
                <Input
                  id="min-words"
                  type="number"
                  value={targetMin}
                  onChange={(e) => setTargetMin(e.target.value)}
                  placeholder="e.g. 1400"
                  disabled={isStreaming}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="max-words" className="text-xs text-muted-foreground">Target max words (optional)</Label>
                <Input
                  id="max-words"
                  type="number"
                  value={targetMax}
                  onChange={(e) => setTargetMax(e.target.value)}
                  placeholder="e.g. 1600"
                  disabled={isStreaming}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tone" className="text-xs text-muted-foreground">Tone notes (optional)</Label>
              <Input
                id="tone"
                value={toneNote}
                onChange={(e) => setToneNote(e.target.value)}
                placeholder="e.g. punchier hook, more skeptical, less academic"
                disabled={isStreaming}
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleImprove}
              disabled={isStreaming || draft.trim().length < 50}
              className="w-full"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Improving…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Improve Script
                </>
              )}
            </Button>
          </Card>

          {/* Output panel */}
          <Card className="p-5 space-y-4 bg-card border-border">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold text-foreground">Improved Script</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!output || isStreaming}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!output || isStreaming}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download
                </Button>
              </div>
            </div>

            <div className="min-h-[480px] max-h-[640px] overflow-y-auto rounded-md border border-border bg-background p-4">
              {output ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">{output}</pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {isStreaming
                    ? revisionMode === "lengthen"
                      ? "Expanding script…"
                      : revisionMode === "feedback"
                        ? "Rewriting with your feedback…"
                        : "Streaming improved script…"
                    : "Your improved script will appear here."}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Refine controls — appear once we have an output */}
        {output && (
          <Card className="mt-6 p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-mono text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Refine this output
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Iterate without restarting from the original draft.
                  {revisionCount > 0 && (
                    <span className="ml-2 text-foreground">Revisions so far: {revisionCount}</span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runRevision("lengthen")}
                disabled={isStreaming}
              >
                {isStreaming && revisionMode === "lengthen" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Expanding…
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
                    Make it longer
                  </>
                )}
              </Button>
            </div>

            <div>
              <Label htmlFor="feedback" className="text-xs text-muted-foreground">
                Feedback for the next version
              </Label>
              <Textarea
                id="feedback"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder='e.g. "Punchier hook, drop the third paragraph, more skeptical tone, less academic phrasing."'
                className="mt-1 min-h-[100px] font-mono text-sm bg-background"
                disabled={isStreaming}
              />
              <Button
                onClick={() => runRevision("feedback")}
                disabled={isStreaming || feedbackNote.trim().length < 3}
                className="w-full mt-3"
              >
                {isStreaming && revisionMode === "feedback" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <MessageSquarePlus className="w-4 h-4 mr-2" />
                    Rewrite with feedback
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* References panel */}
        {refs.length > 0 && (
          <Card className="mt-6 p-5 bg-card border-border">
            <Collapsible open={refsOpen} onOpenChange={setRefsOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="font-mono text-sm font-semibold text-foreground">
                      Reference Hits ({refs.length})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Source chunks retrieved to support the rewrite
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${refsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-3">
                {refs.map((ref, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs uppercase">
                        {ref.file_type}
                      </Badge>
                      <span className="text-xs font-mono text-foreground">{ref.file_name}</span>
                      <span className="text-xs text-muted-foreground">
                        matched: <span className="italic">{ref.matched_query}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ref.excerpt}…</p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}
      </div>
    </Layout>
  );
}
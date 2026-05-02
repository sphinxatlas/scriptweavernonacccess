import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wand2, Copy, Download, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import {
  runClipQuoteFinder,
  getClipQuoteFinderRun,
  deleteClipQuoteFinderRun,
  type ClipQuoteFinderRun,
} from "@/lib/api";

interface Props {
  briefId: string;
  briefTitle?: string | null;
  initialScript?: string;
}

export function ClipQuoteFinderPanel({ briefId, briefTitle, initialScript }: Props) {
  const [pastedScript, setPastedScript] = useState("");
  const [editorNotes, setEditorNotes] = useState("");
  const [optFilm, setOptFilm] = useState(true);
  const [optBookQuotes, setOptBookQuotes] = useState(true);
  const [optBroll, setOptBroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<ClipQuoteFinderRun | null>(null);
  const [loadedSaved, setLoadedSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getClipQuoteFinderRun(briefId);
        if (cancelled) return;
        if (saved) {
          setRun(saved);
          setPastedScript(saved.pasted_script || "");
          setEditorNotes(saved.editor_notes || "");
          setOptFilm(saved.prioritize_exact_film_timestamps);
          setOptBookQuotes(saved.include_book_quote_inserts);
          setOptBroll(saved.include_contextual_broll_ideas);
        } else if (initialScript && !pastedScript) {
          setPastedScript(initialScript);
        }
      } catch (_e) {
        // ignore
      } finally {
        if (!cancelled) setLoadedSaved(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefId]);

  async function handleGenerate() {
    const text = pastedScript.trim();
    if (text.length < 100) {
      toast.error("Paste a working draft (at least 100 characters).");
      return;
    }
    setLoading(true);
    try {
      const result = await runClipQuoteFinder({
        briefId,
        pastedScript: text,
        editorNotes: editorNotes.trim() || undefined,
        prioritizeExactFilmTimestamps: optFilm,
        includeBookQuoteInserts: optBookQuotes,
        includeContextualBrollIdeas: optBroll,
      });
      const fresh = await getClipQuoteFinderRun(briefId);
      setRun(fresh);
      toast.success("Clip & Quote Finder complete.");
      // ensure result content shown even if reload was slow
      if (!fresh && result?.outputMarkdown) {
        setRun({
          id: result.id || "tmp",
          brief_id: briefId,
          pasted_script: text,
          editor_notes: editorNotes.trim() || null,
          prioritize_exact_film_timestamps: optFilm,
          include_book_quote_inserts: optBookQuotes,
          include_contextual_broll_ideas: optBroll,
          output_markdown: result.outputMarkdown,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not generate clip and quote recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!run?.output_markdown) return;
    navigator.clipboard.writeText(run.output_markdown);
    toast.success("Copied to clipboard");
  }

  function handleDownload() {
    if (!run?.output_markdown) return;
    const blob = new Blob([run.output_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${briefTitle || "brief"} - Clip & Quote Finder.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    if (!run?.id) return;
    if (!confirm("Delete the saved Clip & Quote Finder run for this brief?")) return;
    try {
      await deleteClipQuoteFinderRun(run.id);
      setRun(null);
      toast.success("Saved run deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          Clip & Quote Finder
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          Editor-only utility. Paste your final or near-final script and get clip, timestamp, quote, and B-roll recommendations grounded in this brief's pipeline context and uploaded sources. This does not modify your script, outline, evidence table, or any pipeline output.
        </p>
      </div>

      <div className="space-y-4 max-w-4xl">
        <div>
          <Label className="text-xs font-medium">Pasted script</Label>
          <Textarea
            value={pastedScript}
            onChange={(e) => setPastedScript(e.target.value)}
            placeholder="Paste your final or near-final script to generate clip, timestamp, quote, and B-roll recommendations for your editor."
            rows={14}
            className="bg-secondary border-border resize-y mt-1.5 font-mono text-xs leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            The pasted script does not have to match the generated Full Script exactly. Manually edited versions are supported.
          </p>
        </div>

        <div>
          <Label className="text-xs font-medium">Editor notes / preferred footage style (optional)</Label>
          <Input
            value={editorNotes}
            onChange={(e) => setEditorNotes(e.target.value)}
            placeholder="Prioritize PoA film scenes, avoid overusing talking-head style clips, include quote-card inserts for book-only evidence."
            className="bg-secondary border-border mt-1.5"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Options</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={optFilm} onCheckedChange={(v) => setOptFilm(!!v)} />
              Prioritize exact film timestamps when available
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={optBookQuotes} onCheckedChange={(v) => setOptBookQuotes(!!v)} />
              Include book quote inserts
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={optBroll} onCheckedChange={(v) => setOptBroll(!!v)} />
              Include contextual B-roll ideas
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={loading} className="gap-1.5">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Finding the best clips, quotes, timestamps, and B-roll ideas…
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                Find Clips & Quotes
              </>
            )}
          </Button>
          {run?.output_markdown && !loading && (
            <>
              <Button size="sm" variant="ghost" onClick={handleCopy} className="gap-1.5 text-xs">
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDownload} className="gap-1.5 text-xs">
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Delete saved run
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {loadedSaved && !run?.output_markdown && !loading && (
        <div className="text-xs text-muted-foreground max-w-3xl">
          Paste your final or near-final script to generate clip, timestamp, quote, and B-roll recommendations for your editor.
        </div>
      )}

      {run?.output_markdown && (
        <div className="max-w-5xl">
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-mono prose-headings:text-foreground prose-p:text-foreground/85 prose-strong:text-foreground prose-a:text-primary prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-th:text-foreground prose-td:text-foreground/80 prose-table:border-border">
            <ReactMarkdown>{run.output_markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
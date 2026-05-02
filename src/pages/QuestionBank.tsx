import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { HelpCircle, BookOpen, Film, ScrollText, Mic, Loader2, Trash2, Sparkles } from "lucide-react";
import {
  askQuestionBank,
  getQuestionBankEntries,
  getQuestionBankEntry,
  deleteQuestionBankEntry,
  type QuestionBankAnswer,
} from "@/lib/api";

const SOURCE_TYPE_META: Record<string, { label: string; icon: any }> = {
  book: { label: "Book", icon: BookOpen },
  transcript: { label: "Movie Transcript", icon: Film },
  lexicon: { label: "Lexicon", icon: ScrollText },
  competitor_analysis: { label: "Commentary", icon: Mic },
};

function ConfidenceBadge({ value }: { value: string }) {
  const variant = value === "High" ? "default" : value === "Medium" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{value}</Badge>;
}

function CanonBadge({ value }: { value: string }) {
  return <Badge variant="outline" className="font-normal">{value}</Badge>;
}

function CanonWeightBadge({ value }: { value: string }) {
  const tone =
    value === "Primary canon" ? "bg-primary/10 text-primary border-primary/20" :
    value === "Canon support" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
    "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{value}</span>;
}

function StrengthBadge({ value }: { value: string }) {
  const tone =
    value === "Strong" ? "bg-green-500/10 text-green-600 border-green-500/20" :
    value === "Medium" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
    "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{value}</span>;
}

function AnswerView({ data, question }: { data: QuestionBankAnswer; question: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xs text-muted-foreground font-mono">Question</div>
          <CardTitle className="text-lg leading-snug">{question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Direct Answer</div>
            <p className="text-sm leading-relaxed">{data.answer}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <ConfidenceBadge value={data.confidence} />
            <span className="text-xs text-muted-foreground ml-2">Canon Status:</span>
            <CanonBadge value={data.canonStatus} />
          </div>
          {data.scriptSafeTakeaway && (
            <div className="rounded-md border border-gold/30 bg-gold/5 p-3">
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-gold" /> Script-Safe Takeaway
              </div>
              <p className="text-sm">{data.scriptSafeTakeaway}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {data.explanation && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Explanation</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.explanation}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">Evidence Used ({data.evidence.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence rows. The uploaded sources did not provide direct support for this question.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Source Type</TableHead>
                    <TableHead className="w-[180px]">Source Name</TableHead>
                    <TableHead className="w-[140px]">Location</TableHead>
                    <TableHead>Exact Finding</TableHead>
                    <TableHead className="w-[200px]">What It Proves</TableHead>
                    <TableHead className="w-[90px]">Strength</TableHead>
                    <TableHead className="w-[110px]">Canon Weight</TableHead>
                    <TableHead className="w-[180px]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.evidence.map((e, i) => {
                    const meta = SOURCE_TYPE_META[e.sourceType] || { label: e.sourceType, icon: HelpCircle };
                    const Icon = meta.icon;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs break-words">{e.sourceName}</TableCell>
                        <TableCell className="text-xs break-words font-mono">{e.location}</TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap break-words leading-relaxed">
                          <span className="italic">"{e.exactFinding}"</span>
                        </TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap break-words">{e.whatItProves}</TableCell>
                        <TableCell><StrengthBadge value={e.evidenceStrength} /></TableCell>
                        <TableCell><CanonWeightBadge value={e.canonWeight} /></TableCell>
                        <TableCell className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{e.notes || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.caveats && data.caveats.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono">Caveats</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm list-disc pl-5">
              {data.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function QuestionBank() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [filters, setFilters] = useState({ books: true, transcripts: true, lexicon: true, commentary: true });
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<{ question: string; data: QuestionBankAnswer } | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["question-bank-entries"],
    queryFn: getQuestionBankEntries,
  });

  async function handleAsk() {
    const q = question.trim();
    if (q.length < 3) {
      toast.error("Please enter a question.");
      return;
    }
    setLoading(true);
    setCurrent(null);
    try {
      const data = await askQuestionBank(q, filters);
      setCurrent({ question: q, data });
      queryClient.invalidateQueries({ queryKey: ["question-bank-entries"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to check evidence");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(id: string) {
    setLoading(true);
    try {
      const full = await getQuestionBankEntry(id);
      setCurrent({ question: full.question, data: full });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to open question");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this saved question?")) return;
    try {
      await deleteQuestionBankEntry(id);
      if (current && (current.data.entryId === id)) setCurrent(null);
      queryClient.invalidateQueries({ queryKey: ["question-bank-entries"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  }

  return (
    <Layout>
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-mono font-bold text-foreground mb-2 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-gold" />
            Question Bank
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask canon, continuity, lore, adaptation, plot hole, or script fact-checking questions. Every answer is grounded in your uploaded sources and includes a mandatory evidence table.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a canon, continuity, lore, adaptation, or script fact checking question..."
              rows={3}
              className="resize-none"
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <span className="text-muted-foreground">Search in:</span>
              {([
                ["books", "Books"],
                ["transcripts", "Movie Transcripts"],
                ["lexicon", "Lexicon"],
                ["commentary", "Commentary"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={filters[k]}
                    onCheckedChange={(v) => setFilters((f) => ({ ...f, [k]: !!v }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAsk} disabled={loading}>
                {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking uploaded sources...</>) : "Check Evidence"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {current && <AnswerView data={current.data} question={current.question} />}

        <div className="mt-10">
          <h2 className="text-sm font-mono font-bold text-foreground mb-3">Saved Question History</h2>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved questions yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleOpen(h.id)}
                  className="w-full text-left rounded-md border border-border bg-card p-3 hover:border-gold/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground line-clamp-2">{h.question}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <ConfidenceBadge value={h.confidence} />
                        <CanonBadge value={h.canon_status} />
                        <span>{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(h.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                      aria-label="Delete saved question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
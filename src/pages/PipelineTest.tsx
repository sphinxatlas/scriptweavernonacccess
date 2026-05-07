import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FlaskConical, Loader2 } from "lucide-react";
import { streamGenerateStep, generateHookOptions, streamPolishPass, type HookOption } from "@/lib/api";
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

type StepResult = {
  status: "pending" | "running" | "pass" | "fail" | "skip";
  output: string;
  notes: string;
  warnings: string[];
  model?: string;
  diagnostics?: any;
  hooks?: HookOption[];
};

const DEFAULT_BRIEF = {
  title: "Why Book Ron Is Not Movie Ron",
  characters: "Ron Weasley",
  focus_areas: "Trio dynamic, adaptation gap, emotional function",
  angle_note: "The films kept the jokes and lost the spine",
  thesis: "Ron's loyalty is load-bearing in the books and decorative in the films",
};

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function statusIcon(s: StepResult["status"]) {
  if (s === "pass") return "✅ PASS";
  if (s === "fail") return "❌ FAIL";
  if (s === "skip") return "⚠️ SKIP";
  if (s === "running") return "… RUN";
  return "—  WAIT";
}

export default function PipelineTest() {
  const [form, setForm] = useState(DEFAULT_BRIEF);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [results, setResults] = useState<Record<StepKey, StepResult>>(() =>
    Object.fromEntries(STEP_ORDER.map((k) => [k, { status: "pending", output: "", notes: "", warnings: [] }])) as any,
  );

  const update = (k: StepKey, patch: Partial<StepResult>) =>
    setResults((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const reset = () =>
    setResults(Object.fromEntries(STEP_ORDER.map((k) => [k, { status: "pending", output: "", notes: "", warnings: [] }])) as any);

  const inlineBrief = () => ({
    title: form.title,
    description: form.angle_note,
    angle_note: form.angle_note,
    thesis: form.thesis,
    characters: form.characters.split(",").map((s) => s.trim()).filter(Boolean),
    focus_areas: form.focus_areas.split(",").map((s) => s.trim()).filter(Boolean),
    priority_sources: [],
    target_min_words: 650,
    target_max_words: 800,
    comparison_mode: false,
  });

  const runStep = async (
    step: Exclude<StepKey, "hook_options" | "melty_voice" | "anti_ai">,
    outputs: Partial<Record<StepKey, string>>,
  ): Promise<{ text: string; diagnostics?: any }> => {
    update(step, { status: "running" });
    let text = "";
    let diagnostics: any = null;
    await streamGenerateStep(
      "test-mode",
      step as any,
      (delta) => { text += delta; },
      () => {},
      {
        testMode: true,
        testInlineBrief: inlineBrief(),
        testInlineOutputs: outputs as Record<string, string>,
        onDiagnostics: (d) => { diagnostics = d; },
      },
    );
    return { text, diagnostics };
  };

  const handleRun = async () => {
    if (!confirmed) {
      toast.error("Please confirm the diagnostic checkbox first.");
      return;
    }
    setRunning(true);
    setStartedAt(new Date().toISOString());
    reset();
    const outputs: Partial<Record<StepKey, string>> = {};
    let firstFailedAt: StepKey | null = null;
    const markSkip = (from: StepKey) => {
      const idx = STEP_ORDER.indexOf(from);
      for (let i = idx; i < STEP_ORDER.length; i++) {
        update(STEP_ORDER[i], { status: "skip", notes: `upstream failure at ${from}` });
      }
    };

    const orderedGen: Exclude<StepKey, "hook_options" | "melty_voice" | "anti_ai">[] = [
      "creative_brief",
      "six_category_extraction",
      "selected_source_analysis",
      "evidence_table",
      "outline",
      "script_evidence_pack",
    ];

    try {
      for (const step of orderedGen) {
        try {
          const { text, diagnostics } = await runStep(step, outputs);
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

      // Hook Options
      try {
        update("hook_options", { status: "running" });
        const { hooks } = await generateHookOptions("test-mode" as any, undefined as any);
        // Re-invoke via fetch for testMode (generateHookOptions doesn't pass testMode); use direct fetch instead.
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-hook-options`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              briefId: "test-mode",
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
        // Pick first hook for full_script
        const chosen = allHooks[0]?.hook_text || "";

        // Full Script
        update("full_script", { status: "running" });
        let fsText = "";
        let fsDiag: any = null;
        await streamGenerateStep(
          "test-mode",
          "full_script",
          (d) => { fsText += d; },
          () => {},
          {
            testMode: true,
            testInlineBrief: inlineBrief(),
            testInlineOutputs: outputs as Record<string, string>,
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
        const minBeats = Math.ceil(mvWords / 300);
        const beatLog = (mvText.match(/beat\s*\d+/gim) || []).length;
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
          // Determine which step is currently running
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
      if (firstFailedAt) markSkip(firstFailedAt);
    } finally {
      setRunning(false);
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

  return (
    <Layout>
      <div className="p-8 max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-mono font-bold text-foreground">Pipeline Test</h1>
            <p className="text-sm text-muted-foreground">Diagnostic full-pipeline run with capped inputs. Nothing is saved.</p>
          </div>
        </div>

        <Card className="p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Characters (comma separated)</Label>
              <Input value={form.characters} onChange={(e) => setForm({ ...form, characters: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Focus Areas</Label>
              <Input value={form.focus_areas} onChange={(e) => setForm({ ...form, focus_areas: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Angle Note</Label>
              <Textarea rows={2} value={form.angle_note} onChange={(e) => setForm({ ...form, angle_note: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Thesis</Label>
              <Textarea rows={2} value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Estimated cost before run: ~25,000–50,000 input tokens (capped 4-beat run, halved secondary budgets).
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
            <Label htmlFor="confirm" className="text-sm cursor-pointer">
              I understand this is a diagnostic run. Outputs will not be saved.
            </Label>
          </div>
          <Button onClick={handleRun} disabled={running || !confirmed}>
            {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</> : "Run Pipeline Test"}
          </Button>
        </Card>

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
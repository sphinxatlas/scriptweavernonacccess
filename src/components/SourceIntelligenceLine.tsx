import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  analyzeSourceStrength,
  formatSourceMeta,
  type ScriptStrength,
  type SourceStrengthTable,
} from "@/lib/api";

interface Props {
  table: SourceStrengthTable;
  id: string;
  charCount: number | null | undefined;
  estimatedTokens: number | null | undefined;
  scriptStrength: ScriptStrength | null | undefined;
  onAnalyzed?: (label: ScriptStrength) => void;
  className?: string;
}

const STRENGTH_TONE: Record<ScriptStrength, string> = {
  strong: "text-success",
  useful: "text-foreground",
  limited: "text-muted-foreground",
};

export function SourceIntelligenceLine({
  table,
  id,
  charCount,
  estimatedTokens,
  scriptStrength,
  onAnalyzed,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const label = await analyzeSourceStrength(table, id);
      onAnalyzed?.(label);
      toast.success(`Script strength: ${label[0].toUpperCase()}${label.slice(1)}`);
    } catch (err: any) {
      toast.error(err?.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const meta = formatSourceMeta(charCount, estimatedTokens, scriptStrength);
  const actionLabel = scriptStrength ? "Re-analyze" : "Analyze";

  return (
    <div
      className={cn(
        "mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground font-mono",
        className,
      )}
    >
      <span>
        {meta.split(" · ").map((part, i, arr) => {
          const isStrength = i === arr.length - 1;
          if (isStrength && scriptStrength) {
            return (
              <span key={i}>
                {i > 0 && " · "}
                Script strength:{" "}
                <span className={STRENGTH_TONE[scriptStrength]}>
                  {part.replace("Script strength: ", "")}
                </span>
              </span>
            );
          }
          return (
            <span key={i}>
              {i > 0 && " · "}
              {part}
            </span>
          );
        })}
      </span>
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title={actionLabel + " script strength"}
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        <span className="underline-offset-2 hover:underline">{actionLabel}</span>
      </button>
    </div>
  );
}
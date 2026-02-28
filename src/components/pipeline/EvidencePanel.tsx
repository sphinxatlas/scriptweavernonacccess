import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEvidencePoints, toggleEvidenceStar, type EvidencePoint } from "@/lib/api";
import { Star, FileText, BookOpen, Film, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EvidencePanelProps {
  briefId: string;
}

const sourceIcon = (type: string) => {
  switch (type) {
    case "book": return <BookOpen className="w-3 h-3" />;
    case "transcript": return <Film className="w-3 h-3" />;
    case "lexicon": return <BookMarked className="w-3 h-3" />;
    default: return <FileText className="w-3 h-3" />;
  }
};

const confidenceColor = (c: string) => {
  switch (c) {
    case "high": return "text-green-500";
    case "medium": return "text-yellow-500";
    case "low": return "text-red-500";
    default: return "text-muted-foreground";
  }
};

export function EvidencePanel({ briefId }: EvidencePanelProps) {
  const queryClient = useQueryClient();
  const { data: points = [] } = useQuery({
    queryKey: ["evidence-points", briefId],
    queryFn: () => getEvidencePoints(briefId),
  });

  const handleToggleStar = async (point: EvidencePoint) => {
    try {
      await toggleEvidenceStar(point.id, !point.starred);
      queryClient.invalidateQueries({ queryKey: ["evidence-points", briefId] });
      toast.success(point.starred ? "Unstarred" : "Starred as approved");
    } catch {
      toast.error("Failed to update");
    }
  };

  if (points.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No evidence points parsed yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Generate the Evidence Table first, then evidence points will appear here.</p>
      </div>
    );
  }

  const starred = points.filter((p) => p.starred);
  const unstarred = points.filter((p) => !p.starred);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">
          {points.length} evidence points · {starred.length} starred
        </p>
      </div>

      {[...starred, ...unstarred].map((point) => (
        <div
          key={point.id}
          className={cn(
            "rounded-md border p-3 text-xs space-y-1.5",
            point.starred ? "border-primary/40 bg-primary/5" : "border-border bg-card"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-foreground leading-snug">{point.claim}</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => handleToggleStar(point)}
            >
              <Star className={cn("w-3.5 h-3.5", point.starred ? "fill-primary text-primary" : "text-muted-foreground")} />
            </Button>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              {sourceIcon(point.source_type)}
              {point.source_type}
            </span>
            {point.source_file && (
              <span className="truncate max-w-[200px]">{point.source_file}</span>
            )}
            <span className={cn("font-medium", confidenceColor(point.confidence))}>
              {point.confidence}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {point.evidence_type}
            </span>
          </div>

          {point.exact_quote && (
            <div className="border-l-2 border-primary/40 pl-2 text-foreground/80 italic">
              "{point.exact_quote}"
            </div>
          )}
          {point.paraphrase && !point.exact_quote && (
            <div className="border-l-2 border-muted pl-2 text-foreground/70">
              <span className="text-muted-foreground">[paraphrase]</span> {point.paraphrase}
            </div>
          )}
          {point.lexicon_support && (
            <div className="text-muted-foreground">
              <span className="text-[10px] px-1 py-0.5 rounded bg-muted mr-1">Lexicon</span>
              {point.lexicon_support}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

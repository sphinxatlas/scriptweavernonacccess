import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getTopicBriefs, createTopicBrief, deleteTopicBrief, type CreateBriefInput, TARGET_LENGTH_OPTIONS } from "@/lib/api";
import { Plus, Trash2, ArrowRight, FileText, GitCompare, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TopicBriefs() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateBriefInput>({
    title: "",
    description: "",
    thesis: "",
    focus_areas: [],
    characters: [],
    proof_goal: "",
    priority_sources: [],
    emotional_angle: "",
    tone: "",
    comparison_mode: false,
    target_minutes: 10,
    target_min_words: 1400,
    target_max_words: 1600,
    competitor_script_1: "",
    competitor_script_2: "",
    competitor_script_3: "",
    competitor_script_4: "",
    competitor_script_5: "",
  });
  const [creating, setCreating] = useState(false);

  const { data: briefs = [], refetch } = useQuery({
    queryKey: ["topic-briefs"],
    queryFn: getTopicBriefs,
  });

  const updateForm = (key: keyof CreateBriefInput, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleArrayInput = (key: "focus_areas" | "characters" | "priority_sources", value: string) =>
    updateForm(key, value.split(",").map((s) => s.trim()).filter(Boolean));

  const handleCreate = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setCreating(true);
    try {
      await createTopicBrief({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
      });
      toast.success("Topic brief created");
      setForm({
        title: "", description: "", thesis: "", focus_areas: [], characters: [],
        proof_goal: "", priority_sources: [], emotional_angle: "", tone: "", comparison_mode: false,
        target_minutes: 10, target_min_words: 1400, target_max_words: 1600,
        competitor_script_1: "", competitor_script_2: "", competitor_script_3: "", competitor_script_4: "", competitor_script_5: "",
      });
      setShowForm(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTopicBrief(id);
      toast.success("Brief deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-mono font-bold text-foreground mb-2">Topic Briefs</h1>
            <p className="text-sm text-muted-foreground">
              Define your video topics. Each brief drives a full research and script generation pipeline.
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-1.5" disabled={showForm}>
            <Plus className="w-4 h-4" />
            New Brief
          </Button>
        </div>

        {showForm && (
          <div className="border border-primary/30 rounded-lg p-5 mb-6 bg-card">
            <h3 className="font-mono text-sm font-semibold text-foreground mb-4">New Topic Brief</h3>
            <div className="space-y-3">
              {/* Required */}
              <Input
                placeholder="Title — e.g., Why Snape's Redemption Arc is Overrated"
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                className="bg-secondary border-border"
              />
              <Textarea
                placeholder="Description — angle, key arguments, evidence to explore..."
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                rows={3}
                className="bg-secondary border-border resize-none"
              />

              {/* Optional fields */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3 font-medium">Optional Research Fields</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Thesis</Label>
                    <Input
                      placeholder="The central argument..."
                      value={form.thesis || ""}
                      onChange={(e) => updateForm("thesis", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">What should this video prove?</Label>
                    <Input
                      placeholder="The key proof goal..."
                      value={form.proof_goal || ""}
                      onChange={(e) => updateForm("proof_goal", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Focus Areas (comma-separated)</Label>
                    <Input
                      placeholder="e.g., character arcs, plot holes, symbolism"
                      value={form.focus_areas?.join(", ") || ""}
                      onChange={(e) => handleArrayInput("focus_areas", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Key Characters (comma-separated)</Label>
                    <Input
                      placeholder="e.g., Snape, Dumbledore, Harry"
                      value={form.characters?.join(", ") || ""}
                      onChange={(e) => handleArrayInput("characters", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Emotional Angle</Label>
                    <Input
                      placeholder="e.g., bittersweet, provocative, nostalgic"
                      value={form.emotional_angle || ""}
                      onChange={(e) => updateForm("emotional_angle", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tone</Label>
                    <Input
                      placeholder="e.g., analytical, conversational, passionate"
                      value={form.tone || ""}
                      onChange={(e) => updateForm("tone", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Priority Sources — optional soft boost only</Label>
                    <Input
                      placeholder="Leave blank to search all uploaded primary sources. e.g., Half-Blood Prince"
                      value={form.priority_sources?.join(", ") || ""}
                      onChange={(e) => handleArrayInput("priority_sources", e.target.value)}
                      className="bg-secondary border-border mt-1"
                    />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Optional soft boost only. Leave blank to search all uploaded primary sources automatically.
                    </p>
                  </div>
                </div>
              </div>

              {/* Target Length */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Target Length (Voiceover)
                </Label>
                <Select
                  value={String(form.target_minutes || 10)}
                  onValueChange={(v) => {
                    const opt = TARGET_LENGTH_OPTIONS.find((o) => o.minutes === Number(v));
                    if (opt) {
                      updateForm("target_minutes", opt.minutes);
                      updateForm("target_min_words", opt.min);
                      updateForm("target_max_words", opt.max);
                    }
                  }}
                >
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_LENGTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.minutes} value={String(opt.minutes)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Competitor Scripts */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3 font-medium">Competitor Scripts (format reference only)</p>
                <p className="text-[10px] text-muted-foreground/60 mb-3">
                  Paste up to 5 competitor scripts with similar title format and hook style. Used for structure and retention analysis only — never quoted or used as factual sources.
                </p>
                <div className="space-y-3">
                  {([1, 2, 3, 4, 5] as const).map((num) => {
                    const key = `competitor_script_${num}` as keyof CreateBriefInput;
                    return (
                      <div key={num}>
                        <Label className="text-xs text-muted-foreground">Competitor Script {num}</Label>
                        <Textarea
                          placeholder={`Paste competitor script ${num} here (optional)...`}
                          value={(form[key] as string) || ""}
                          onChange={(e) => updateForm(key, e.target.value)}
                          rows={4}
                          className="bg-secondary border-border resize-none mt-1 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Comparison mode toggle */}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Switch
                  checked={form.comparison_mode}
                  onCheckedChange={(v) => updateForm("comparison_mode", v)}
                />
                <div>
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <GitCompare className="w-3.5 h-3.5 text-primary" />
                    Book vs Movie Comparison Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">Forces paired retrieval and contrast-based analysis</p>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create Brief"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {briefs.length === 0 && !showForm ? (
          <div className="border border-dashed border-border rounded-lg p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No topic briefs yet. Create one to start generating scripts.</p>
            <Button onClick={() => setShowForm(true)} variant="outline" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Create Your First Brief
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {briefs.map((brief) => (
              <div
                key={brief.id}
                className={cn(
                  "group flex items-start gap-4 p-4 rounded-lg border border-border bg-card",
                  "hover:border-primary/30 transition-colors cursor-pointer"
                )}
                onClick={() => navigate(`/briefs/${brief.id}`)}
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {(brief as any).comparison_mode ? (
                    <GitCompare className="w-4 h-4 text-primary" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-semibold text-foreground truncate">{brief.title}</h3>
                    {(brief as any).comparison_mode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
                        Comparison
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{brief.description}</p>
                  {(brief as any).thesis && (
                    <p className="text-xs text-muted-foreground/70 mt-1 italic line-clamp-1">Thesis: {(brief as any).thesis}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs text-muted-foreground/60">
                      {new Date(brief.created_at).toLocaleDateString()}
                    </p>
                    {(brief as any).target_minutes && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <Clock className="w-3 h-3" />
                        {(brief as any).target_minutes} min
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(brief.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

import { useEffect, useState } from "react";
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
import { MultiSelectChips, type MultiSelectOption } from "@/components/MultiSelectChips";
import {
  getTopicBriefs,
  createTopicBrief,
  deleteTopicBrief,
  duplicateTopicBrief,
  type CreateBriefInput,
  TARGET_LENGTH_OPTIONS,
  getFormatReferenceTranscripts,
  saveFormatReferenceTranscript,
  getBriefTopicTranscripts,
  saveBriefTopicTranscript,
  getAlternativeSources,
  linkFormatReferencesToBrief,
  linkTopicTranscriptsToBrief,
  linkAlternativeSourcesToBrief,
} from "@/lib/api";
import { Plus, Trash2, ArrowRight, FileText, GitCompare, Clock, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const blankForm = (): CreateBriefInput => ({
  title: "",
  angle_note: "",
  target_minutes: 10,
  target_min_words: 1400,
  target_max_words: 1600,
  comparison_mode: false,
  characters: [],
  focus_areas: [],
  priority_sources: [],
});

const BOOK_OPTIONS = [
  "Book 1: Philosopher's Stone",
  "Book 2: Chamber of Secrets",
  "Book 3: Prisoner of Azkaban",
  "Book 4: Goblet of Fire",
  "Book 5: Order of the Phoenix",
  "Book 6: Half-Blood Prince",
  "Book 7: Deathly Hallows",
];

const MOVIE_OPTIONS = [
  "Movie 1: Philosopher's Stone",
  "Movie 2: Chamber of Secrets",
  "Movie 3: Prisoner of Azkaban",
  "Movie 4: Goblet of Fire",
  "Movie 5: Order of the Phoenix",
  "Movie 6: Half-Blood Prince",
  "Movie 7.1: Deathly Hallows Part 1",
  "Movie 7.2: Deathly Hallows Part 2",
];

interface InlineTranscriptFormProps {
  label: string;
  onSave: (input: { channel_name: string; video_title: string; transcript: string }) => Promise<void>;
  onCancel: () => void;
}

function InlineTranscriptForm({ label, onSave, onCancel }: InlineTranscriptFormProps) {
  const [channel, setChannel] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!channel.trim() || !videoTitle.trim() || !transcript.trim()) {
      toast.error("All three fields are required");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        channel_name: channel.trim(),
        video_title: videoTitle.trim(),
        transcript: transcript.trim(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-primary/30 rounded-md p-3 mt-2 bg-card space-y-2">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <Input
        placeholder="Channel name"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        className="bg-secondary border-border"
      />
      <Input
        placeholder="Video title"
        value={videoTitle}
        onChange={(e) => setVideoTitle(e.target.value)}
        className="bg-secondary border-border"
      />
      <Textarea
        placeholder="Paste the full transcript here..."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={6}
        className="bg-secondary border-border resize-none text-xs font-mono"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={handle} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  );
}

export default function TopicBriefs() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateBriefInput>(blankForm());
  const [creating, setCreating] = useState(false);

  // Prefill from Angle Lab handoff (sessionStorage), if present.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("angleLabPrefill");
      if (!raw) return;
      sessionStorage.removeItem("angleLabPrefill");
      const parsed = JSON.parse(raw);
      setForm((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        angle_note: parsed.angle_note || prev.angle_note,
      }));
      setShowForm(true);
      toast.success("Angle Lab handoff loaded into new brief");
    } catch {
      /* ignore */
    }
  }, []);

  const [selectedFormatIds, setSelectedFormatIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedAltIds, setSelectedAltIds] = useState<string[]>([]);
  const [showFormatAdd, setShowFormatAdd] = useState(false);
  const [showTopicAdd, setShowTopicAdd] = useState(false);

  const { data: briefs = [], refetch } = useQuery({
    queryKey: ["topic-briefs"],
    queryFn: getTopicBriefs,
  });
  const { data: formatRefs = [], refetch: refetchFormatRefs } = useQuery({
    queryKey: ["format-references"],
    queryFn: getFormatReferenceTranscripts,
  });
  const { data: topicTranscripts = [], refetch: refetchTopicTranscripts } = useQuery({
    queryKey: ["topic-transcripts"],
    queryFn: getBriefTopicTranscripts,
  });
  const { data: alternativeSources = [] } = useQuery({
    queryKey: ["alternative-sources"],
    queryFn: getAlternativeSources,
  });

  const updateForm = (key: keyof CreateBriefInput, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(blankForm());
    setSelectedFormatIds([]);
    setSelectedTopicIds([]);
    setSelectedAltIds([]);
    setShowFormatAdd(false);
    setShowTopicAdd(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error("Video title is required");
      return;
    }
    if (!form.angle_note.trim()) {
      toast.error("Angle note is required");
      return;
    }
    if (selectedFormatIds.length === 0) {
      toast.error("At least one format reference video is required");
      return;
    }
    if (selectedFormatIds.length > 2) {
      toast.error("Maximum 2 format reference videos");
      return;
    }
    setCreating(true);
    try {
      const created = await createTopicBrief({
        ...form,
        title: form.title.trim(),
        angle_note: form.angle_note.trim(),
      });
      await linkFormatReferencesToBrief(created.id, selectedFormatIds);
      await linkTopicTranscriptsToBrief(created.id, selectedTopicIds);
      await linkAlternativeSourcesToBrief(created.id, selectedAltIds);
      toast.success("Brief created");
      resetForm();
      setShowForm(false);
      refetch();
      navigate(`/briefs/${created.id}`);
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

  const handleDuplicate = async (id: string) => {
    try {
      const created = await duplicateTopicBrief(id);
      toast.success("Brief duplicated");
      refetch();
      navigate(`/briefs/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate brief");
    }
  };

  const formatOptions: MultiSelectOption[] = formatRefs.map((r: any) => ({
    value: r.id,
    label: r.video_title,
    sublabel: r.channel_name,
  }));
  const topicOptions: MultiSelectOption[] = topicTranscripts.map((r: any) => ({
    value: r.id,
    label: r.video_title,
    sublabel: r.channel_name,
  }));
  const altOptions: MultiSelectOption[] = (alternativeSources as any[]).map((r: any) => ({
    value: r.id,
    label: r.title,
    sublabel: r.source_type || r.source_author || undefined,
  }));

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
            <div className="space-y-4">
              {/* Video Title */}
              <div>
                <Label className="text-xs text-muted-foreground">Video Title</Label>
                <Input
                  placeholder="e.g., Why Snape's Redemption Arc is Overrated"
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                  className="bg-secondary border-border mt-1"
                />
              </div>

              {/* Angle Note */}
              <div>
                <Label className="text-xs text-muted-foreground">Angle Note</Label>
                <p className="text-[11px] text-muted-foreground/70 mb-1">
                  Your angle or direction for this video. A few sentences. The system will develop this into a full thesis.
                </p>
                <Textarea
                  placeholder="e.g., Snape's redemption is built on a single act, but the books frame him as far more selfish than fans remember..."
                  value={form.angle_note}
                  onChange={(e) => updateForm("angle_note", e.target.value)}
                  rows={4}
                  className="bg-secondary border-border resize-none"
                />
              </div>

              {/* Target Length */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Target Length (Voiceover)
                </Label>
                <Select
                  value={String(form.target_minutes)}
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

              {/* Comparison Mode */}
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

              {/* Format Reference Videos */}
              <div className="pt-2 border-t border-border">
                <Label className="text-xs text-muted-foreground">
                  Format Reference Videos <span className="text-destructive">*</span>
                </Label>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  Non-HP format reference videos. Used for argument structure and positioning only — never for Harry Potter content. Min 1, max 2.
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <MultiSelectChips
                      options={formatOptions}
                      selected={selectedFormatIds}
                      onChange={(vals) => {
                        if (vals.length > 2) {
                          toast.error("Maximum 2 format references");
                          return;
                        }
                        setSelectedFormatIds(vals);
                      }}
                      placeholder={formatOptions.length === 0 ? "No format references available" : "Select format references…"}
                      emptyText="No format references available."
                      searchable
                      searchPlaceholder="Search format references..."
                      emptySearchMessage="No matching sources found."
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowFormatAdd((v) => !v)}
                  >
                    Add New
                  </Button>
                </div>
                {selectedFormatIds.length >= 2 && (
                  <p className="text-xs text-muted-foreground mt-1">Maximum 2 format references selected.</p>
                )}
                {showFormatAdd && (
                  <InlineTranscriptForm
                    label="New Format Reference"
                    onCancel={() => setShowFormatAdd(false)}
                    onSave={async (input) => {
                      const created = await saveFormatReferenceTranscript(input);
                      await refetchFormatRefs();
                      setSelectedFormatIds((prev) => prev.length < 2 ? [...prev, created.id] : prev);
                      setShowFormatAdd(false);
                      toast.success("Format reference added");
                    }}
                  />
                )}
              </div>

              {/* HP Topic Transcripts */}
              <div className="pt-2 border-t border-border">
                <Label className="text-xs text-muted-foreground">HP Topic Transcripts (optional)</Label>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  HP videos covering a similar topic to this video. Used as research leads. Optional, no maximum.
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <MultiSelectChips
                      options={topicOptions}
                      selected={selectedTopicIds}
                      onChange={setSelectedTopicIds}
                      placeholder={topicOptions.length === 0 ? "No HP topic transcripts available" : "Select HP topic transcripts…"}
                      emptyText="No HP topic transcripts available."
                      searchable
                      searchPlaceholder="Search HP topic transcripts..."
                      emptySearchMessage="No matching sources found."
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTopicAdd((v) => !v)}
                  >
                    Add New
                  </Button>
                </div>
                {showTopicAdd && (
                  <InlineTranscriptForm
                    label="New HP Topic Transcript"
                    onCancel={() => setShowTopicAdd(false)}
                    onSave={async (input) => {
                      const created = await saveBriefTopicTranscript(input);
                      await refetchTopicTranscripts();
                      setSelectedTopicIds((prev) => [...prev, created.id]);
                      setShowTopicAdd(false);
                      toast.success("HP topic transcript added");
                    }}
                  />
                )}
              </div>

              {/* Alternative Sources */}
              <div className="pt-2 border-t border-border">
                <Label className="text-xs text-muted-foreground">Alternative Sources (optional)</Label>
                <p className="text-[11px] text-muted-foreground/70 mb-2">
                  Optional pasted sources such as Reddit threads, fan comments, wiki extracts, blog posts, websites, or research notes. Used as secondary context and angle support. Not canon unless explicitly primary source material.
                </p>
                <MultiSelectChips
                  options={altOptions}
                  selected={selectedAltIds}
                  onChange={setSelectedAltIds}
                  placeholder={altOptions.length === 0 ? "No alternative sources available" : "Select alternative sources…"}
                  emptyText="No alternative sources yet. Add some in the Secondary Source Library."
                  searchable
                  searchPlaceholder="Search alternative sources..."
                  emptySearchMessage="No matching sources found."
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
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
            {briefs.map((brief: any) => (
              <div
                key={brief.id}
                className={cn(
                  "group flex items-start gap-4 p-4 rounded-lg border border-border bg-card",
                  "hover:border-primary/30 transition-colors cursor-pointer"
                )}
                onClick={() => navigate(`/briefs/${brief.id}`)}
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {brief.comparison_mode ? (
                    <GitCompare className="w-4 h-4 text-primary" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-semibold text-foreground truncate">{brief.title}</h3>
                    {brief.comparison_mode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
                        Comparison
                      </span>
                    )}
                  </div>
                  {brief.angle_note && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{brief.angle_note}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <p className="text-xs text-muted-foreground/60">
                      {new Date(brief.created_at).toLocaleDateString()}
                    </p>
                    {brief.target_minutes && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <Clock className="w-3 h-3" />
                        {brief.target_minutes} min
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Duplicate brief inputs"
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(brief.id); }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
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
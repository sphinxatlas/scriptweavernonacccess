import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getFormatReferenceTranscripts,
  saveFormatReferenceTranscript,
  deleteFormatReferenceTranscript,
  getBriefTopicTranscripts,
  saveBriefTopicTranscript,
  deleteBriefTopicTranscript,
  getAlternativeSources,
  saveAlternativeSource,
  deleteAlternativeSource,
} from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Section = "format" | "topic";

interface InlineFormProps {
  onSave: (input: { channel_name: string; video_title: string; transcript: string }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}

function InlineAddForm({ onSave, onCancel, busy }: InlineFormProps) {
  const [channel, setChannel] = useState("");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");

  const handleSave = async () => {
    if (!channel.trim() || !title.trim() || !transcript.trim()) {
      toast.error("All three fields are required");
      return;
    }
    await onSave({
      channel_name: channel.trim(),
      video_title: title.trim(),
      transcript: transcript.trim(),
    });
    setChannel("");
    setTitle("");
    setTranscript("");
  };

  return (
    <div className="border border-primary/30 rounded-lg p-4 mb-4 bg-card space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Channel Name</Label>
        <Input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="e.g., Nerdwriter1"
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Video Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Why This Movie Works"
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Transcript</Label>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste the full transcript here..."
          rows={10}
          className="bg-secondary border-border resize-none mt-1 text-xs font-mono"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy ? "Saving..." : "Save Transcript"}
        </Button>
      </div>
    </div>
  );
}

function TranscriptSection({ section }: { section: Section }) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const queryKey = section === "format" ? "format-references" : "topic-transcripts";
  const fetchFn = section === "format" ? getFormatReferenceTranscripts : getBriefTopicTranscripts;
  const saveFn = section === "format" ? saveFormatReferenceTranscript : saveBriefTopicTranscript;
  const deleteFn = section === "format" ? deleteFormatReferenceTranscript : deleteBriefTopicTranscript;

  const { data: items = [], refetch } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchFn,
  });

  const label =
    section === "format"
      ? "Non-HP videos used for argument structure and angle positioning only. Never used for Harry Potter content."
      : "HP videos covering similar topics to your videos. Used as research leads and supplementary knowledge per brief. Never cited directly in scripts.";

  const addLabel = section === "format" ? "Add Format Reference" : "Add HP Topic Transcript";

  const handleSave = async (input: { channel_name: string; video_title: string; transcript: string }) => {
    setBusy(true);
    try {
      await saveFn(input);
      toast.success("Transcript saved");
      setShowForm(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">{label}</p>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} size="sm" className="gap-1.5 mb-4">
          <Plus className="w-3.5 h-3.5" />
          {addLabel}
        </Button>
      )}

      {showForm && (
        <InlineAddForm onSave={handleSave} onCancel={() => setShowForm(false)} busy={busy} />
      )}

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No transcripts saved yet.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Video Title</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.channel_name}</TableCell>
                  <TableCell>{item.video_title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AlternativeSourcesSection() {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sourceAuthor, setSourceAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");

  const { data: items = [], refetch } = useQuery({
    queryKey: ["alternative-sources"],
    queryFn: getAlternativeSources,
  });

  const reset = () => {
    setTitle("");
    setSourceType("");
    setSourceAuthor("");
    setUrl("");
    setContent("");
    setNotes("");
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and pasted text are required");
      return;
    }
    setBusy(true);
    try {
      await saveAlternativeSource({
        title: title.trim(),
        content: content.trim(),
        source_type: sourceType.trim() || null,
        source_author: sourceAuthor.trim() || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Alternative source saved");
      reset();
      setShowForm(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAlternativeSource(id);
      toast.success("Deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Paste any non-canon source text here, such as Reddit threads, YouTube comments, blogs,
        forums, websites, meme research, or fan discussions. These sources help with audience
        insight, humor, fandom language, and angle inspiration. They are not treated as canon.
      </p>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} size="sm" className="gap-1.5 mb-4">
          <Plus className="w-3.5 h-3.5" />
          Add Alternative Source
        </Button>
      )}

      {showForm && (
        <div className="border border-primary/30 rounded-lg p-4 mb-4 bg-card space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Source title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., "r/HarryPotter — Snape redemption mega thread"'
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Source type (optional)</Label>
              <Input
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                placeholder="Reddit thread, YouTube comments, Blog post, Forum, Fan notes…"
                className="bg-secondary border-border mt-1"
                list="alt-source-types"
              />
              <datalist id="alt-source-types">
                <option value="Reddit thread" />
                <option value="YouTube comments" />
                <option value="Blog post" />
                <option value="Website" />
                <option value="Forum" />
                <option value="Fan notes" />
                <option value="Meme research" />
                <option value="Other" />
              </datalist>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Source / author / platform (optional)
              </Label>
              <Input
                value={sourceAuthor}
                onChange={(e) => setSourceAuthor(e.target.value)}
                placeholder="Reddit, MuggleNet, Tumblr, personal notes…"
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">URL (optional)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Pasted text content <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the thread, comments, post, or notes here…"
              rows={10}
              className="bg-secondary border-border resize-none mt-1 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes / use case (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='e.g., "Use for fandom humor and inside jokes, not canon evidence."'
              rows={2}
              className="bg-secondary border-border resize-none mt-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setShowForm(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : "Save Alternative Source"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No alternative sources saved yet.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.source_type || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.source_author || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function TranscriptLibrary() {
  return (
    <Layout>
      <div className="p-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-mono font-bold text-foreground mb-2">Secondary Source Library</h1>
          <p className="text-sm text-muted-foreground">
            Reusable secondary sources for angle research, creative transfer, and topic briefs.
            Canon still comes from the main Source Library.
          </p>
        </div>

        <Tabs defaultValue="format">
          <TabsList>
            <TabsTrigger value="format">Format References</TabsTrigger>
            <TabsTrigger value="topic">HP Topic Transcripts</TabsTrigger>
            <TabsTrigger value="alternative">Alternative Sources</TabsTrigger>
          </TabsList>
          <TabsContent value="format" className="mt-6">
            <TranscriptSection section="format" />
          </TabsContent>
          <TabsContent value="topic" className="mt-6">
            <TranscriptSection section="topic" />
          </TabsContent>
          <TabsContent value="alternative" className="mt-6">
            <AlternativeSourcesSection />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
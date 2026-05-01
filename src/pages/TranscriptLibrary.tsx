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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getTopicBriefs, createTopicBrief, deleteTopicBrief } from "@/lib/api";
import { Plus, Trash2, ArrowRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TopicBriefs() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: briefs = [], refetch } = useQuery({
    queryKey: ["topic-briefs"],
    queryFn: getTopicBriefs,
  });

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in both title and description");
      return;
    }
    setCreating(true);
    try {
      await createTopicBrief(title.trim(), description.trim());
      toast.success("Topic brief created");
      setTitle("");
      setDescription("");
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
              Define your video topics. Each brief drives a full script generation pipeline.
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-1.5" disabled={showForm}>
            <Plus className="w-4 h-4" />
            New Brief
          </Button>
        </div>

        {showForm && (
          <div className="border border-primary/30 rounded-lg p-5 mb-6 bg-card animate-slide-in glow-amber">
            <h3 className="font-mono text-sm font-semibold text-foreground mb-4">New Topic Brief</h3>
            <div className="space-y-3">
              <Input
                placeholder="e.g., Why Snape's Redemption Arc is Overrated"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-secondary border-border"
              />
              <Textarea
                placeholder="Describe the angle, key arguments, and what evidence you want to explore..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="bg-secondary border-border resize-none"
              />
              <div className="flex gap-2 justify-end">
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
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-mono text-sm font-semibold text-foreground truncate">{brief.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{brief.description}</p>
                  <p className="text-xs text-muted-foreground/60 mt-2">
                    {new Date(brief.created_at).toLocaleDateString()}
                  </p>
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

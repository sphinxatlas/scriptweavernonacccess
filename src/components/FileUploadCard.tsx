import { useCallback, useState } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadSourceFile, processFile, deleteSourceFile, type SourceFile } from "@/lib/api";
import { toast } from "sonner";

interface FileUploadCardProps {
  fileType: "book" | "transcript" | "instructions" | "lexicon" | "competitor_analysis" | "host_persona" | "anti_ai_guide";
  title: string;
  description: string;
  accept?: string;
  files: SourceFile[];
  onRefresh: () => void;
  badge?: string;
}

export function FileUploadCard({ fileType, title, description, accept = ".txt,.md,.pdf", files, onRefresh, badge }: FileUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const uploaded = await uploadSourceFile(file, fileType);
        toast.success(`Uploaded ${file.name}`);
        
        // Auto-process
        setProcessing(uploaded.id);
        await processFile(uploaded.id);
        toast.success(`Indexed ${file.name} (chunked for search)`);
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setProcessing(null);
    }
  }, [fileType, onRefresh]);

  const handleDelete = async (file: SourceFile) => {
    try {
      await deleteSourceFile(file.id, file.storage_path);
      toast.success(`Deleted ${file.name}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  const handleReprocess = async (file: SourceFile) => {
    setProcessing(file.id);
    try {
      await processFile(file.id);
      toast.success(`Re-indexed ${file.name}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Processing failed");
    } finally {
      setProcessing(null);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "indexed": return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
      case "processing": return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
      default: return <AlertCircle className="w-3.5 h-3.5 text-warning" />;
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-foreground">{title}</h3>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="relative">
          <input
            type="file"
            accept={accept}
            multiple={fileType !== "instructions"}
            onChange={handleUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploading}
          />
          <Button size="sm" variant="outline" disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload
          </Button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-6 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No files uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                "bg-secondary/50 border border-border"
              )}
            >
              {processing === file.id ? (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : (
                statusIcon(file.status)
              )}
              <span className="flex-1 truncate text-foreground text-xs font-mono">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {file.file_size ? `${(file.file_size / 1024).toFixed(0)}KB` : ""}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => handleReprocess(file)}
                disabled={processing === file.id}
                title="Re-index"
              >
                <Sparkles className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => handleDelete(file)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { FileUploadCard } from "@/components/FileUploadCard";
import { getSourceFiles } from "@/lib/api";
import { Database } from "lucide-react";

export default function SourceLibrary() {
  const { data: files = [], refetch } = useQuery({
    queryKey: ["source-files"],
    queryFn: getSourceFiles,
  });

  const books = files.filter((f) => f.file_type === "book");
  const transcripts = files.filter((f) => f.file_type === "transcript");
  const lexicon = files.filter((f) => f.file_type === "lexicon");
  const instructions = files.filter((f) => f.file_type === "instructions");

  const indexedCount = files.filter((f) => f.status === "indexed").length;

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-mono font-bold text-foreground mb-2">Source Library</h1>
          <p className="text-sm text-muted-foreground">
            Upload your source files to build the knowledge base for script generation.
          </p>
          {files.length > 0 && (
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <Database className="w-3.5 h-3.5 text-primary" />
              <span>{indexedCount} of {files.length} files indexed for retrieval</span>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <FileUploadCard
            fileType="book"
            title="📚 Harry Potter Books"
            description="Upload book text files (.txt, .md). Each book will be chunked and indexed for semantic search."
            files={books}
            onRefresh={refetch}
          />

          <FileUploadCard
            fileType="transcript"
            title="🎬 Movie Transcripts"
            description="Upload movie transcript files. These provide dialogue and scene descriptions for reference."
            files={transcripts}
            onRefresh={refetch}
          />

          <FileUploadCard
            fileType="lexicon"
            title="📖 Lexicon"
            description="Upload Lexicon reference files (.txt). These serve as secondary reference only — used for context, chronology, and discovery, never as primary canon."
            accept=".txt"
            files={lexicon}
            onRefresh={refetch}
            badge="Secondary Reference"
          />

          <FileUploadCard
            fileType="instructions"
            title="📝 Script Writing Instructions"
            description="Upload your script writing guidelines. This shapes the tone and style of generated scripts."
            accept=".txt,.md"
            files={instructions}
            onRefresh={refetch}
          />
        </div>
      </div>
    </Layout>
  );
}

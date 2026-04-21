import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SourceLibrary from "./pages/SourceLibrary";
import TopicBriefs from "./pages/TopicBriefs";
import PipelineView from "./pages/PipelineView";
import ScriptImprover from "./pages/ScriptImprover";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SourceLibrary />} />
          <Route path="/briefs" element={<TopicBriefs />} />
          <Route path="/briefs/:briefId" element={<PipelineView />} />
          <Route path="/improve" element={<ScriptImprover />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

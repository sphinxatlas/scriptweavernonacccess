import { BookOpen, FileText, Lightbulb, Sparkles, Upload, Wand2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Source Library", icon: Upload },
  { to: "/angle-lab", label: "Angle Lab", icon: Lightbulb },
  { to: "/briefs", label: "Topic Briefs", icon: FileText },
  { to: "/transcripts", label: "Transcript Library", icon: BookOpen },
  { to: "/improve", label: "Script Improver", icon: Wand2 },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold text-foreground tracking-tight">ScriptForge</h1>
            <p className="text-xs text-muted-foreground">Source-Grounded Scripts</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to || 
            (to === "/briefs" && location.pathname.startsWith("/briefs"));
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive && "text-primary")} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Harry Potter Universe</span>
        </div>
      </div>
    </aside>
  );
}

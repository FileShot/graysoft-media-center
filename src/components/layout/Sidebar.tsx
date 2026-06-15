import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  FolderPlus,
  Grid3x3,
  Image,
  Layers,
  PenLine,
  Settings,
  Video,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { ModelPicker } from "../ModelPicker";
import { ThemeToggle } from "../ui/ThemeToggle";
import type { ModelInfo } from "../../lib/types";

interface SidebarProps {
  onSelectModel: (model: ModelInfo) => void;
  onInstallPackages: () => void;
  installing: boolean;
}

function NavButton({
  active,
  expanded,
  label,
  onClick,
  children,
  badge,
}: {
  active?: boolean;
  expanded: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`sidebar-nav-btn ${active ? "sidebar-nav-btn-active" : ""}`}
    >
      <span className="relative shrink-0">{children}</span>
      {badge != null && badge > 0 && !expanded && (
        <span className="sidebar-badge-dot">{badge}</span>
      )}
      {expanded && (
        <span className="truncate text-[13px] font-medium">{label}</span>
      )}
      {expanded && badge != null && badge > 0 && (
        <span className="ml-auto rounded-full bg-[var(--color-accent-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ onSelectModel, onInstallPackages, installing }: SidebarProps) {
  const expanded = useAppStore((s) => s.sidebarExpanded);
  const setExpanded = useAppStore((s) => s.setSidebarExpanded);
  const sidebarPanel = useAppStore((s) => s.sidebarPanel);
  const setSidebarPanel = useAppStore((s) => s.setSidebarPanel);
  const mediaMode = useAppStore((s) => s.mediaMode);
  const setMediaMode = useAppStore((s) => s.setMediaMode);
  const setShowModelCatalog = useAppStore((s) => s.setShowModelCatalog);
  const setShowLoadModel = useAppStore((s) => s.setShowLoadModel);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const engineStatus = useAppStore((s) => s.engineStatus);
  const jobs = useAppStore((s) => s.jobs);

  const activeJobs = jobs.filter((j) => j.status === "pending" || j.status === "running").length;

  const openPanel = (panel: "models") => {
    if (sidebarPanel === panel && expanded) {
      setExpanded(false);
      return;
    }
    setSidebarPanel(panel);
    setExpanded(true);
  };

  const gpuOk = engineStatus?.cudaAvailable;
  const gpuLabel = gpuOk
    ? engineStatus?.deviceName?.split(" ").slice(0, 3).join(" ") || "GPU ready"
    : "No GPU";

  return (
    <div className="flex shrink-0">
      <aside
        className={`sidebar-rail flex flex-col border-r border-[var(--glass-border)] bg-[var(--bg-elevated)] transition-[width] duration-200 ${
          expanded ? "w-[248px]" : "w-[52px]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-2 py-2">
          {expanded && (
            <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Workspace
            </span>
          )}
          <button
            type="button"
            className="titlebar-btn ml-auto"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-2">
          <NavButton
            expanded={expanded}
            label="Create"
            active={activeView === "create"}
            onClick={() => setActiveView("create")}
          >
            <PenLine size={18} />
          </NavButton>
          <NavButton
            expanded={expanded}
            label="Browse"
            active={activeView === "browse"}
            onClick={() => setActiveView("browse")}
          >
            <Grid3x3 size={18} />
          </NavButton>
          <NavButton
            expanded={expanded}
            label="Models"
            active={activeView === "models"}
            onClick={() => setActiveView("models")}
          >
            <Layers size={18} />
          </NavButton>
          <NavButton
            expanded={expanded}
            label="Activity"
            active={activeView === "activity"}
            onClick={() => setActiveView("activity")}
            badge={activeJobs}
          >
            <Activity size={18} />
          </NavButton>

          <div className="my-1 border-t border-[var(--glass-border)]" />

          <NavButton
            expanded={expanded}
            label="Model list"
            active={sidebarPanel === "models" && expanded}
            onClick={() => openPanel("models")}
          >
            <Layers size={18} />
          </NavButton>

          <NavButton
            expanded={expanded}
            label="Get Models"
            onClick={() => setShowModelCatalog(true)}
          >
            <Download size={18} />
          </NavButton>

          <NavButton
            expanded={expanded}
            label="Load from disk"
            onClick={() => setShowLoadModel(true)}
          >
            <FolderPlus size={18} />
          </NavButton>

          <NavButton
            expanded={expanded}
            label="Image mode"
            active={mediaMode === "image"}
            onClick={() => setMediaMode("image")}
          >
            <Image size={18} />
          </NavButton>

          <NavButton
            expanded={expanded}
            label="Video mode"
            active={mediaMode === "video"}
            onClick={() => setMediaMode("video")}
          >
            <Video size={18} />
          </NavButton>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-[var(--glass-border)] p-2">
          {!engineStatus?.sitePackagesReady && (
            <button
              type="button"
              className="sidebar-nav-btn sidebar-nav-btn-accent"
              onClick={onInstallPackages}
              disabled={installing}
              title="Install packages"
            >
              <Download size={18} className="shrink-0" />
              {expanded && (
                <span className="truncate text-[12px] font-medium">
                  {installing ? "Installing…" : "Install packages"}
                </span>
              )}
            </button>
          )}

          <NavButton
            expanded={expanded}
            label="Settings"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={18} />
          </NavButton>

          <div className={`flex items-center gap-2 px-2 py-1.5 ${expanded ? "" : "justify-center"}`}>
            <ThemeToggle />
            {expanded && <span className="text-[11px] text-[var(--text-muted)]">Theme</span>}
          </div>

          <div
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-muted)] ${
              expanded ? "" : "justify-center"
            }`}
            title={engineStatus?.deviceName || gpuLabel}
          >
            <Cpu size={14} className={gpuOk ? "text-[var(--color-success)]" : "text-amber-400"} />
            {expanded && <span className="truncate">{gpuLabel}</span>}
          </div>
        </div>
      </aside>

      <AnimatePresence initial={false}>
        {expanded && sidebarPanel === "models" && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="sidebar-panel overflow-hidden border-r border-[var(--glass-border)] bg-[var(--glass-bg)]"
          >
            <div className="flex h-full w-[260px] flex-col">
              <div className="border-b border-[var(--glass-border)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">Your models</span>
                  {activeJobs > 0 && (
                    <span className="text-[11px] text-[var(--text-muted)]">{activeJobs} in queue</span>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ModelPicker onSelect={onSelectModel} embedded />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

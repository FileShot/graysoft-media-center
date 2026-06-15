import type { ReactNode } from "react";

interface WorkspacePanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function WorkspacePanel({ title, children, className = "" }: WorkspacePanelProps) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--glass-border)] bg-black/[0.03] dark:bg-white/[0.02] ${className}`}
    >
      <div className="shrink-0 border-b border-[var(--glass-border)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

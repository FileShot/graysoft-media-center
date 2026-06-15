import { useAppStore } from "../../store/appStore";

const PHASES = ["load", "encode", "denoise", "decode", "save"] as const;
const PHASE_LABELS: Record<string, string> = {
  load: "Load",
  encode: "Encode",
  denoise: "Denoise",
  decode: "Decode",
  save: "Save",
};

export function JobProgressPanel({ compact }: { compact?: boolean }) {
  const jobs = useAppStore((s) => s.jobs);
  const jobProgressHistory = useAppStore((s) => s.jobProgressHistory);
  const jobMessageHistory = useAppStore((s) => s.jobMessageHistory);

  const running = jobs.find((j) => j.status === "running");
  if (!running) return null;

  const points = jobProgressHistory[running.id] ?? [];
  const messages = (jobMessageHistory[running.id] ?? []).slice(-2);
  const latest = points[points.length - 1];
  const activePhase = latest?.phase ?? "load";
  const message = latest?.message ?? messages[messages.length - 1] ?? "Working…";

  if (compact) {
    return (
      <div className="shrink-0 rounded-lg border border-[var(--glass-border)] bg-black/[0.04] px-3 py-2 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${Math.max(4, Math.round(running.progress * 100))}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
            {Math.round(running.progress * 100)}%
            {latest?.step != null && latest?.totalSteps != null
              ? ` · ${latest.step}/${latest.totalSteps}`
              : ""}
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{message}</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-xl border border-[var(--glass-border)] bg-black/[0.04] p-2.5 dark:bg-white/[0.02]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Progress
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {Math.round(running.progress * 100)}%
          {latest?.step != null && latest?.totalSteps != null
            ? ` · step ${latest.step}/${latest.totalSteps}`
            : ""}
        </span>
      </div>
      <div className="mb-1.5 flex gap-0.5">
        {PHASES.map((phase) => {
          const idx = PHASES.indexOf(phase);
          const activeIdx = PHASES.indexOf(activePhase as (typeof PHASES)[number]);
          const done = idx < activeIdx;
          const active = phase === activePhase;
          return (
            <div key={phase} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
              <div
                className={`h-1 w-full rounded-full ${
                  active ? "bg-[var(--color-accent)]" : done ? "bg-emerald-500/70" : "bg-white/10"
                }`}
              />
              <span
                className={`truncate text-[8px] uppercase ${
                  active ? "text-[var(--color-accent)]" : "text-[var(--text-muted)]"
                }`}
              >
                {PHASE_LABELS[phase]}
              </span>
            </div>
          );
        })}
      </div>
      <p className="truncate text-[10px] text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

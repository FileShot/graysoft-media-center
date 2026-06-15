import { ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2, Trash2, XCircle } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { cancelJob, clearQueue, listJobs } from "../../lib/tauri";
import { showToast } from "../ui/Toast";
import type { JobRecord } from "../../lib/types";

function shortError(message: string | null): string | null {
  if (!message) return null;
  const cleaned = message.replace(/^RuntimeError:\s*/i, "").replace(/^Error:\s*/i, "");
  return cleaned.split("\n")[0]?.trim() || cleaned;
}

function modelLabel(job: JobRecord, models: { id: string; name: string }[]): string {
  return models.find((m) => m.id === job.modelId)?.name ?? "Unknown model";
}

export function CompactJobQueue() {
  const expanded = useAppStore((s) => s.queueExpanded);
  const setExpanded = useAppStore((s) => s.setQueueExpanded);
  const allJobs = useAppStore((s) => s.jobs);
  const models = useAppStore((s) => s.models);
  const jobMessages = useAppStore((s) => s.jobMessages);
  const gallery = useAppStore((s) => s.gallery);
  const setPreviewItem = useAppStore((s) => s.setPreviewItem);
  const setJobs = useAppStore((s) => s.setJobs);

  const jobs = [...allJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const active = jobs.filter((j) => j.status === "pending" || j.status === "running");
  const pendingCount = allJobs.filter((j) => j.status === "pending").length;
  const finishedCount = allJobs.filter((j) =>
    ["complete", "failed", "cancelled"].includes(j.status),
  ).length;
  const running = jobs.find((j) => j.status === "running");
  const canClear = pendingCount > 0 || finishedCount > 0;

  const refreshJobs = async () => {
    setJobs(await listJobs(50));
  };

  const handleClearQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const cleared = await clearQueue(true);
      await refreshJobs();
      setExpanded(false);
      showToast(
        cleared > 0 ? `Cleared ${cleared} job(s) from queue` : "Queue cleared",
        "success",
      );
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  if (jobs.length === 0) return null;

  return (
    <div className="shrink-0 rounded-xl border border-[var(--glass-border)] bg-black/[0.04] dark:bg-white/[0.02]">
      <div className="flex items-center gap-1 border-b border-[var(--glass-border)] px-2 py-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {running ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-[var(--color-accent)]" />
          ) : active.length > 0 ? (
            <Clock size={14} className="shrink-0 text-[var(--text-muted)]" />
          ) : (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
          )}
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">
            Queue
            {active.length > 0 ? ` · ${active.length} active` : ` · ${jobs.length} recent`}
          </span>
          {running && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {Math.round(running.progress * 100)}%
            </span>
          )}
          <span className="ml-auto text-[var(--text-muted)]">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {canClear && (
          <button
            type="button"
            className="btn-ghost flex shrink-0 items-center gap-1 px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            onClick={handleClearQueue}
            title="Cancel pending jobs and clear finished history"
          >
            <Trash2 size={12} />
            Clear queue
          </button>
        )}
      </div>

      {expanded && (
        <div className="max-h-[min(28vh,200px)] space-y-1 overflow-y-auto p-2">
          {jobs.map((job) => {
            const error = shortError(job.errorMessage);
            const progressMessage = jobMessages[job.id];
            const galleryItem = gallery.find((g) => g.jobId === job.id);

            return (
              <div
                key={job.id}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-left ${
                  job.status === "failed" ? "bg-[var(--color-danger)]/5" : "hover:bg-white/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-medium">{modelLabel(job, models)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {job.status}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{job.prompt}</p>
                  {job.status === "running" && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${Math.max(4, Math.round(job.progress * 100))}%` }}
                        />
                      </div>
                      {progressMessage && (
                        <span className="max-w-[140px] truncate text-[10px] text-[var(--text-muted)]">
                          {progressMessage}
                        </span>
                      )}
                    </div>
                  )}
                  {job.status === "failed" && error && (
                    <p className="mt-0.5 text-[10px] text-[var(--color-danger)]">{error}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {(job.status === "pending" || job.status === "running") && (
                    <button
                      type="button"
                      className="titlebar-btn h-6 w-6"
                      onClick={() => cancelJob(job.id)}
                      title="Cancel"
                    >
                      <XCircle size={12} />
                    </button>
                  )}
                  {galleryItem && job.status === "complete" && (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--color-accent)] hover:underline"
                      onClick={() => setPreviewItem(galleryItem)}
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

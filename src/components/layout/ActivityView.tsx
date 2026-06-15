import { Activity, Clock, ListOrdered } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { getLogPath } from "../../lib/tauri";

export function ActivityView() {
  const jobs = useAppStore((s) => s.jobs);
  const jobProgressHistory = useAppStore((s) => s.jobProgressHistory);
  const models = useAppStore((s) => s.models);

  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity size={16} /> Activity
        </h2>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            getLogPath().then((p) => window.open(`file:///${p.replace(/\\/g, "/")}`));
          }}
        >
          View log file
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {jobs.length === 0 && (
          <Card className="p-6 text-center text-sm text-[var(--text-muted)]">
            No jobs yet. Generate something in Create mode.
          </Card>
        )}
        {jobs.map((job) => {
          const history = jobProgressHistory[job.id] ?? [];
          const last = history[history.length - 1];
          const tone =
            job.status === "complete"
              ? "success"
              : job.status === "failed"
                ? "danger"
                : job.status === "cancelled"
                  ? "default"
                  : "accent";
          return (
            <Card key={job.id} className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={tone}>{job.status}</Badge>
                <span className="text-xs font-medium">{modelName(job.modelId)}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  <Clock size={10} className="mr-0.5 inline" />
                  {new Date(job.createdAt).toLocaleString()}
                </span>
                {job.status === "running" && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {Math.round(job.progress * 100)}%
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm">{job.prompt}</p>
              {last?.message && (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{last.message}</p>
              )}
              {job.errorMessage && job.status !== "cancelled" && (
                <p className="mt-1 text-[11px] text-[var(--color-danger)]">{job.errorMessage}</p>
              )}
              {history.length > 1 && (
                <details className="mt-2 text-[11px] text-[var(--text-muted)]">
                  <summary className="cursor-pointer">
                    <ListOrdered size={11} className="mr-1 inline" />
                    {history.length} progress events
                  </summary>
                  <ul className="mt-1 max-h-24 overflow-y-auto pl-3">
                    {history.slice(-8).map((p, i) => (
                      <li key={i}>
                        {Math.round(p.progress * 100)}% — {p.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

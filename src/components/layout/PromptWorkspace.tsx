import { ListPlus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { listJobs, submitGeneration } from "../../lib/tauri";
import { ParameterPanel } from "../controls/ParameterPanel";
import { CompactJobQueue } from "./CompactJobQueue";
import { JobProgressPanel } from "./JobProgressPanel";
import { ResizableSplit } from "../ui/ResizableSplit";
import { WorkspacePanel } from "../ui/WorkspacePanel";
import { showToast } from "../ui/Toast";

export function PromptWorkspace() {
  const engineStatus = useAppStore((s) => s.engineStatus);
  const models = useAppStore((s) => s.models);
  const jobs = useAppStore((s) => s.jobs);
  const queueExpanded = useAppStore((s) => s.queueExpanded);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const prompt = useAppStore((s) => s.prompt);
  const negativePrompt = useAppStore((s) => s.negativePrompt);
  const params = useAppStore((s) => s.params);
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const setNegativePrompt = useAppStore((s) => s.setNegativePrompt);
  const setJobs = useAppStore((s) => s.setJobs);
  const setQueueExpanded = useAppStore((s) => s.setQueueExpanded);

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const isRunning = jobs.some((j) => j.status === "running");

  const canGenerate =
    engineStatus?.cudaAvailable && selectedModel?.available && prompt.trim().length > 0;

  const handleGenerate = async () => {
    if (!selectedModelId || !canGenerate) return;
    try {
      await submitGeneration(selectedModelId, prompt, negativePrompt, params);
      setJobs(await listJobs(50));
      setQueueExpanded(true);
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleBatchQueue = async () => {
    if (!selectedModelId || !canGenerate) return;
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    try {
      for (const line of lines) {
        await submitGeneration(selectedModelId, line, negativePrompt, params);
      }
      setJobs(await listJobs(50));
      setQueueExpanded(true);
      setBatchOpen(false);
      setBatchText("");
      showToast(`Queued ${lines.length} prompt(s)`, "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const buttonLabel = isRunning
    ? pendingCount > 0
      ? `Queue (${pendingCount})`
      : "Queue"
    : "Generate";

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--glass-bg)]">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        <ResizableSplit
          axis="horizontal"
          size={layout.promptSplitPercent}
          onSizeChange={(promptSplitPercent) => setLayout({ promptSplitPercent })}
          minFirst={200}
          minSecond={220}
          className="min-h-[160px] flex-1"
          first={
            <WorkspacePanel title="Prompt">
              <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-2">
                <textarea
                  className="workspace-panel-input min-h-0 flex-1 resize-none px-3 py-2.5 text-[15px] leading-relaxed"
                  placeholder="Describe what you want to create…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="mt-2 shrink-0 border-t border-[var(--glass-border)] pt-2">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Negative prompt
                  </label>
                  <input
                    className="workspace-panel-input w-full px-3 py-1.5 text-sm"
                    placeholder="Optional — what to avoid"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                  />
                </div>
              </div>
            </WorkspacePanel>
          }
          second={
            <WorkspacePanel title="Parameters">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ParameterPanel compact disabled={isRunning} />
              </div>
            </WorkspacePanel>
          }
        />

        <div className="flex min-h-0 shrink-0 flex-col gap-2 overflow-y-auto">
          {isRunning && <JobProgressPanel compact={queueExpanded} />}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-2">
            <div className="min-w-0 text-xs text-[var(--text-muted)]">
              {selectedModel ? (
                <>
                  <span className="font-medium text-[var(--text-secondary)]">{selectedModel.name}</span>
                  {!selectedModel.available && selectedModel.missingRequirements[0] && (
                    <span className="mt-0.5 block text-[11px] text-amber-400">
                      {selectedModel.missingRequirements[0]}
                    </span>
                  )}
                  {engineStatus && engineStatus.vramGb <= 6 && selectedModel.schemaId === "wan-2.2-5b" && (
                    <span className="mt-0.5 block text-[11px]">
                      4GB GPU: ~8–15 min for Fast preset (33 frames)
                    </span>
                  )}
                </>
              ) : (
                "Select a model from the sidebar"
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn-ghost flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs"
                disabled={!canGenerate}
                onClick={() => setBatchOpen((v) => !v)}
                title="Queue multiple prompts (one per line)"
              >
                <ListPlus size={14} />
                Batch
              </button>
              <button
                type="button"
                data-generate-btn
                className="btn-primary flex shrink-0 items-center gap-2 px-5 py-2"
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                <Sparkles size={16} />
                {buttonLabel}
              </button>
            </div>
          </div>

          {batchOpen && (
            <div className="shrink-0 rounded-lg border border-[var(--glass-border)] p-2">
              <textarea
                className="glass-input mb-2 min-h-[72px] w-full resize-none px-2 py-1.5 text-sm"
                placeholder="One prompt per line…"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-xs"
                disabled={!canGenerate || !batchText.trim()}
                onClick={handleBatchQueue}
              >
                Queue all lines
              </button>
            </div>
          )}

          <CompactJobQueue />
        </div>
      </div>
    </section>
  );
}

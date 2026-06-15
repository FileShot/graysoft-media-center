import { useEffect, useState } from "react";
import { X, FolderOpen, FolderPlus, FileText } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../store/appStore";
import { getEngineStatus, getLogPath, saveSettings, unloadModel } from "../lib/tauri";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const models = useAppStore((s) => s.models);
  const setModels = useAppStore((s) => s.setModels);
  const setShowLoadModel = useAppStore((s) => s.setShowLoadModel);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const [logPath, setLogPath] = useState("");

  useEffect(() => {
    getLogPath().then(setLogPath).catch(() => setLogPath(""));
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<typeof settings>) => {
    setSettings({ ...settings, ...patch });
  };

  const save = async () => {
    await saveSettings(settings);
    const status = await getEngineStatus();
    setEngineStatus(status);
    onClose();
  };

  const pickOutputDir = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) update({ outputDirectory: selected as string });
  };

  const pickModelsDir = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) update({ modelsDirectory: selected as string });
  };

  const handleRemove = async (modelId: string) => {
    await unloadModel(modelId);
    const refreshed = useAppStore.getState().models.filter((m) => m.id !== modelId);
    setModels(refreshed);
    if (selectedModelId === modelId) {
      setSelectedModelId(refreshed[0]?.id ?? null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Output Directory</label>
            <div className="flex gap-2">
              <input
                className="glass-input flex-1 px-2.5 py-1.5 text-sm"
                value={settings.outputDirectory}
                onChange={(e) => update({ outputDirectory: e.target.value })}
              />
              <button type="button" className="btn-ghost flex items-center px-2" onClick={pickOutputDir}>
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">
              Default Models Directory
            </label>
            <div className="flex gap-2">
              <input
                className="glass-input flex-1 px-2.5 py-1.5 text-sm"
                value={settings.modelsDirectory}
                onChange={(e) => update({ modelsDirectory: e.target.value })}
              />
              <button type="button" className="btn-ghost flex items-center px-2" onClick={pickModelsDir}>
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-[var(--text-muted)]">Loaded models</label>
              <button
                type="button"
                className="btn-ghost flex items-center gap-1 px-2 py-0.5 text-[10px]"
                onClick={() => setShowLoadModel(true)}
              >
                <FolderPlus size={12} />
                Load
              </button>
            </div>
            {models.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-2 py-3 text-xs text-[var(--text-muted)]">
                No models loaded yet.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{model.name}</div>
                      <div className="truncate text-[10px] text-[var(--text-muted)]">{model.path}</div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2 py-0.5 text-[10px]"
                      onClick={() => handleRemove(model.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs text-[var(--text-muted)]">Diagnostic logs</label>
            <p className="mb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              App and inference errors are written to log files when generation fails.
            </p>
            <button
              type="button"
              className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-xs"
              disabled={!logPath}
              onClick={() => logPath && revealItemInDir(logPath)}
            >
              <FileText size={14} />
              Open log file
            </button>
            {logPath && (
              <p className="mt-1 truncate text-[10px] text-[var(--text-muted)]" title={logPath}>
                {logPath}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

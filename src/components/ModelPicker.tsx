import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FolderPlus, Trash2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import type { ModelInfo } from "../lib/types";
import { unloadModel } from "../lib/tauri";
import { showToast } from "./ui/Toast";

interface ModelPickerProps {
  onSelect: (model: ModelInfo) => void;
  embedded?: boolean;
}

export function ModelPicker({ onSelect, embedded = false }: ModelPickerProps) {
  const models = useAppStore((s) => s.models);
  const setModels = useAppStore((s) => s.setModels);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setShowLoadModel = useAppStore((s) => s.setShowLoadModel);
  const setShowModelCatalog = useAppStore((s) => s.setShowModelCatalog);
  const mediaMode = useAppStore((s) => s.mediaMode);
  const selectedModelId = useAppStore((s) => s.selectedModelId);

  const filtered = useMemo(() => {
    const byMode = models.filter((m) => mediaMode === "all" || m.mediaType === mediaMode);
    const seen = new Set<string>();
    return byMode.filter((m) => {
      const key = m.path.replace(/\\/g, "/").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [models, mediaMode]);

  const handleUnload = async (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    try {
      await unloadModel(modelId);
      const next = models.filter((m) => m.id !== modelId);
      setModels(next);
      if (selectedModelId === modelId) {
        setSelectedModelId(next[0]?.id ?? null);
      }
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  return (
    <>
      {!embedded && (
        <div className="border-b border-[var(--glass-border)] p-3">
          <button
            type="button"
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-[0.95rem]"
            onClick={() => setShowModelCatalog(true)}
          >
            <Download size={18} />
            Get Models
          </button>
          <button
            type="button"
            className="btn-ghost mt-2 flex w-full items-center justify-center gap-2 py-2 text-xs text-[var(--text-muted)]"
            onClick={() => setShowLoadModel(true)}
          >
            <FolderPlus size={14} />
            Load from disk
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 text-center ${embedded ? "px-4 py-8" : "px-5 py-12"}`}>
          <p className="text-sm text-[var(--text-secondary)]">No models yet</p>
          <p className="max-w-[200px] text-xs leading-relaxed text-[var(--text-muted)]">
            Use Get Models in the sidebar for one-click install.
          </p>
          {embedded && (
            <button
              type="button"
              className="btn-primary mt-2 px-4 py-2 text-xs"
              onClick={() => setShowModelCatalog(true)}
            >
              Get Models
            </button>
          )}
        </div>
      ) : (
        <div className={`flex flex-col gap-1.5 ${embedded ? "p-2" : "gap-2 p-3"}`}>
          <AnimatePresence initial={false}>
            {filtered.map((model, index) => (
              <motion.button
                key={model.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
                type="button"
                onClick={() => onSelect(model)}
                className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  selectedModelId === model.id
                    ? "bg-[var(--color-accent-muted)] ring-1 ring-[rgba(201,169,98,0.35)] shadow-lg"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[0.95rem] font-semibold">{model.name}</div>
                  <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]" title={model.path}>
                    {model.path}
                  </div>
                  {!model.available && model.missingRequirements.length > 0 && (
                    <div className="mt-1 text-xs text-amber-400/90">
                      {model.missingRequirements[0]}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost shrink-0 p-2 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Remove model"
                  onClick={(e) => handleUnload(e, model.id)}
                >
                  <Trash2 size={14} />
                </button>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

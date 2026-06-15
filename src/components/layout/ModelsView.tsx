import { Download, FolderPlus } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { ModelPicker } from "../ModelPicker";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import type { ModelInfo } from "../../lib/types";

interface ModelsViewProps {
  onSelectModel: (model: ModelInfo) => void;
}

export function ModelsView({ onSelectModel }: ModelsViewProps) {
  const setShowModelCatalog = useAppStore((s) => s.setShowModelCatalog);
  const setShowLoadModel = useAppStore((s) => s.setShowLoadModel);
  const engineStatus = useAppStore((s) => s.engineStatus);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="text-xs" onClick={() => setShowModelCatalog(true)}>
          <Download size={14} className="mr-1.5 inline" />
          Browse catalog
        </Button>
        <Button variant="ghost" className="text-xs" onClick={() => setShowLoadModel(true)}>
          <FolderPlus size={14} className="mr-1.5 inline" />
          Load from disk
        </Button>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div className="border-b border-[var(--glass-border)] px-3 py-2 text-sm font-semibold">
          Installed models
        </div>
        <div className="min-h-0 overflow-y-auto">
          <ModelPicker onSelect={onSelectModel} embedded />
        </div>
      </Card>

      {engineStatus && (
        <p className="text-xs text-[var(--text-muted)]">
          GPU: {engineStatus.cudaAvailable ? engineStatus.deviceName : "Not available"} ·{" "}
          {engineStatus.vramGb > 0 ? `${engineStatus.vramGb.toFixed(1)} GB VRAM` : ""}
        </p>
      )}
    </div>
  );
}

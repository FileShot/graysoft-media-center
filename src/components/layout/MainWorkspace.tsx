import { useAppStore } from "../../store/appStore";
import { GalleryStrip } from "./GalleryStrip";
import { PromptWorkspace } from "./PromptWorkspace";
import { BrowseView } from "./BrowseView";
import { ModelsView } from "./ModelsView";
import { ActivityView } from "./ActivityView";
import { ResizableSplit } from "../ui/ResizableSplit";
import type { ModelInfo } from "../../lib/types";

interface MainWorkspaceProps {
  onSelectModel: (model: ModelInfo) => void;
}

export function MainWorkspace({ onSelectModel }: MainWorkspaceProps) {
  const activeView = useAppStore((s) => s.activeView);
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);

  if (activeView === "browse") {
    return <BrowseView />;
  }
  if (activeView === "models") {
    return <ModelsView onSelectModel={onSelectModel} />;
  }
  if (activeView === "activity") {
    return <ActivityView />;
  }

  return (
    <ResizableSplit
      axis="vertical"
      size={layout.galleryHeight}
      onSizeChange={(galleryHeight) => setLayout({ galleryHeight })}
      minFirst={120}
      minSecond={200}
      className="flex-1"
      first={
        <GalleryStrip className="border-b border-[var(--glass-border)]" />
      }
      second={<PromptWorkspace />}
    />
  );
}

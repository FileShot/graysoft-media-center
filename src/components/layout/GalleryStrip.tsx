import { useEffect } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import {
  deleteGalleryItem,
  exportGalleryItem,
  listGallery,
} from "../../lib/tauri";
import type { GalleryItem } from "../../lib/types";
import { GalleryPreview } from "../GalleryPreview";
import { GalleryTile } from "../GalleryTile";
import { save } from "@tauri-apps/plugin-dialog";

interface GalleryStripProps {
  className?: string;
}

export function GalleryStrip({ className = "" }: GalleryStripProps) {
  const gallery = useAppStore((s) => s.gallery);
  const galleryFilters = useAppStore((s) => s.galleryFilters);
  const previewItem = useAppStore((s) => s.previewItem);
  const setGallery = useAppStore((s) => s.setGallery);
  const setGalleryFilters = useAppStore((s) => s.setGalleryFilters);
  const setPreviewItem = useAppStore((s) => s.setPreviewItem);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const setParams = useAppStore((s) => s.setParams);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const setNegativePrompt = useAppStore((s) => s.setNegativePrompt);
  const mediaMode = useAppStore((s) => s.mediaMode);

  const refresh = async () => {
    const items = await listGallery({
      mediaType: mediaMode,
      search: galleryFilters.search || undefined,
      limit: 60,
    });
    setGallery(items);
  };

  useEffect(() => {
    refresh();
  }, [mediaMode, galleryFilters.search]);

  const filtered = gallery.filter((g) => g.mediaType === mediaMode);

  const handleDelete = async (id: string) => {
    await deleteGalleryItem(id);
    setPreviewItem(null);
    await refresh();
  };

  const handleExport = async (item: GalleryItem) => {
    const ext = item.mediaType === "video" ? "mp4" : "png";
    const path = await save({
      defaultPath: `graysoft-export.${ext}`,
      filters: [{ name: item.mediaType === "video" ? "Video" : "Image", extensions: [ext] }],
    });
    if (path) await exportGalleryItem(item.id, path);
  };

  const handleRegenerate = (item: GalleryItem) => {
    setSelectedModelId(item.modelId);
    setParams(item.paramsJson);
    setPrompt(item.prompt);
    setNegativePrompt(item.negativePrompt);
    setPreviewItem(null);
  };

  return (
    <section className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--glass-border)] px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold">Gallery</h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Recent {mediaMode === "video" ? "videos" : "images"}
          </p>
        </div>
        <div className="relative w-full max-w-[220px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search…"
            className="glass-input w-full py-1.5 pl-8 pr-2 text-xs"
            value={galleryFilters.search}
            onChange={(e) => setGalleryFilters({ search: e.target.value })}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[80px] items-center justify-center text-sm text-[var(--text-muted)]">
            Nothing here yet — generate your first {mediaMode === "video" ? "video" : "image"} below.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {filtered.map((item) => (
              <GalleryTile key={item.id} item={item} onClick={() => setPreviewItem(item)} />
            ))}
          </div>
        )}
      </div>

      {previewItem && (
        <GalleryPreview
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDelete={() => handleDelete(previewItem.id)}
          onExport={() => handleExport(previewItem)}
          onRegenerate={() => handleRegenerate(previewItem)}
        />
      )}
    </section>
  );
}

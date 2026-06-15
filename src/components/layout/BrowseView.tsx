import { Columns2, FolderPlus, Search } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import {
  createCollection,
  deleteGalleryItem,
  exportGalleryItem,
  listCollections,
  listGallery,
  setGalleryCollection,
} from "../../lib/tauri";
import type { Collection, GalleryItem } from "../../lib/types";
import { GalleryPreview } from "../GalleryPreview";
import { GalleryTile } from "../GalleryTile";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { save } from "@tauri-apps/plugin-dialog";
import { showToast } from "../ui/Toast";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function BrowseView() {
  const gallery = useAppStore((s) => s.gallery);
  const galleryFilters = useAppStore((s) => s.galleryFilters);
  const setGallery = useAppStore((s) => s.setGallery);
  const setGalleryFilters = useAppStore((s) => s.setGalleryFilters);
  const setPreviewItem = useAppStore((s) => s.setPreviewItem);
  const previewItem = useAppStore((s) => s.previewItem);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const refresh = async () => {
    setGallery(await listGallery({ ...galleryFilters, limit: 120 }));
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, [galleryFilters]);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compareItems = compareIds
    .map((id) => gallery.find((g) => g.id === id))
    .filter(Boolean) as GalleryItem[];

  const handleRegenerate = (item: GalleryItem) => {
    const store = useAppStore.getState();
    store.setPrompt(item.prompt);
    store.setNegativePrompt(item.negativePrompt);
    store.setParams(item.paramsJson);
    store.setActiveView("create");
    store.setPreviewItem(null);
    showToast("Parameters loaded — tweak and generate", "info");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className="glass-input w-full py-1.5 pl-8 pr-3 text-sm"
            placeholder="Search prompts…"
            value={galleryFilters.search}
            onChange={(e) => setGalleryFilters({ search: e.target.value })}
          />
        </div>
        <select
          className="glass-input px-2 py-1.5 text-sm"
          value={galleryFilters.collectionId ?? "all"}
          onChange={(e) => setGalleryFilters({ collectionId: e.target.value })}
        >
          <option value="all">All collections</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            className="glass-input w-32 px-2 py-1.5 text-sm"
            placeholder="New collection"
            value={newCollection}
            onChange={(e) => setNewCollection(e.target.value)}
          />
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={async () => {
              if (!newCollection.trim()) return;
              const c = await createCollection(newCollection.trim());
              setCollections((prev) => [c, ...prev]);
              setNewCollection("");
            }}
          >
            <FolderPlus size={14} />
          </Button>
        </div>
        {compareItems.length === 2 && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Columns2 size={14} /> Compare mode
          </span>
        )}
      </div>

      {compareItems.length === 2 && (
        <Card className="grid shrink-0 grid-cols-2 gap-2 p-2">
          {compareItems.map((item) => (
            <div key={item.id} className="space-y-1">
              <img
                src={convertFileSrc(item.thumbPath ?? item.filePath)}
                alt=""
                className="max-h-48 w-full rounded-lg object-contain bg-black/20"
              />
              <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">{item.prompt}</p>
            </div>
          ))}
        </Card>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {gallery.map((item) => (
            <div key={item.id} className="relative">
              <GalleryTile item={item} onClick={() => setPreviewItem(item)} />
              <button
                type="button"
                onClick={() => toggleCompare(item.id)}
                className={`absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  compareIds.includes(item.id)
                    ? "bg-[var(--color-accent)] text-black"
                    : "bg-black/50 text-white"
                }`}
              >
                {compareIds.includes(item.id) ? "Selected" : "Compare"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {previewItem && (
        <GalleryPreview
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDelete={async () => {
            await deleteGalleryItem(previewItem.id);
            setPreviewItem(null);
            await refresh();
          }}
          onExport={async () => {
            const dest = await save({ defaultPath: previewItem.filePath.split(/[/\\]/).pop() });
            if (dest) await exportGalleryItem(previewItem.id, dest);
          }}
          onRegenerate={() => handleRegenerate(previewItem)}
          collections={collections}
          onMoveToCollection={async (collectionId) => {
            await setGalleryCollection(previewItem.id, collectionId);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

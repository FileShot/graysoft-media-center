import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X, Trash2, Download, RotateCcw } from "lucide-react";
import type { Collection, GalleryItem } from "../lib/types";
import { Button } from "./ui/Button";

interface GalleryPreviewProps {
  item: GalleryItem;
  onClose: () => void;
  onDelete: () => void;
  onExport: () => void;
  onRegenerate: () => void;
  collections?: Collection[];
  onMoveToCollection?: (collectionId: string | null) => void;
}

export function GalleryPreview({
  item,
  onClose,
  onDelete,
  onExport,
  onRegenerate,
  collections = [],
  onMoveToCollection,
}: GalleryPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const path = item.filePath;
    if (!path) {
      setSrc(null);
      return;
    }
    try {
      setSrc(convertFileSrc(path));
    } catch {
      setSrc(null);
    }
  }, [item.filePath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
          <div>
            <div className="text-sm font-medium">{item.modelId}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {new Date(item.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="primary" className="px-2 py-1 text-xs" onClick={onRegenerate}>
              <RotateCcw size={13} className="mr-1 inline" />
              Re-generate with tweaks
            </Button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onExport}>
              <Download size={13} className="mr-1 inline" />
              Export
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDelete}>
              <Trash2 size={13} className="mr-1 inline" />
              Delete
            </button>
            <button
              type="button"
              className="btn-ghost flex h-8 w-8 items-center justify-center p-0"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row">
          <div className="flex flex-1 items-center justify-center rounded-lg bg-black/20">
            {src && item.mediaType === "image" && (
              <img src={src} alt={item.prompt} className="max-h-[50vh] max-w-full object-contain" />
            )}
            {src && item.mediaType === "video" && (
              <video src={src} controls className="max-h-[50vh] max-w-full" />
            )}
          </div>
          <div className="w-full shrink-0 space-y-3 md:w-72">
            <div>
              <div className="mb-1 text-[11px] uppercase text-[var(--text-muted)]">Prompt</div>
              <p className="text-sm">{item.prompt || "—"}</p>
            </div>
            {item.negativePrompt && (
              <div>
                <div className="mb-1 text-[11px] uppercase text-[var(--text-muted)]">
                  Negative
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{item.negativePrompt}</p>
              </div>
            )}
            {onMoveToCollection && collections.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase text-[var(--text-muted)]">Collection</div>
                <select
                  className="glass-input w-full px-2 py-1.5 text-sm"
                  value={item.collectionId ?? ""}
                  onChange={(e) => onMoveToCollection(e.target.value || null)}
                >
                  <option value="">None</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {item.width && item.height && (
                <div>
                  <span className="text-[var(--text-muted)]">Size</span>
                  <div>
                    {item.width}x{item.height}
                  </div>
                </div>
              )}
              {item.seed != null && (
                <div>
                  <span className="text-[var(--text-muted)]">Seed</span>
                  <div>{item.seed}</div>
                </div>
              )}
              {item.duration != null && (
                <div>
                  <span className="text-[var(--text-muted)]">Duration</span>
                  <div>{item.duration}s</div>
                </div>
              )}
              {item.jobId && (
                <div className="col-span-2">
                  <span className="text-[var(--text-muted)]">Job</span>
                  <div className="truncate font-mono text-[10px]">{item.jobId}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

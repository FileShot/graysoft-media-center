import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ensureGalleryThumb } from "../lib/tauri";
import type { GalleryItem } from "../lib/types";

export function useGalleryMedia(item: GalleryItem, visible: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);
    setSrc(null);

    const tryAsset = (path: string) => {
      try {
        return convertFileSrc(path);
      } catch {
        return null;
      }
    };

    const loadThumb = async () => {
      if (item.thumbPath) {
        const asset = tryAsset(item.thumbPath);
        if (asset) {
          if (!cancelled) {
            setSrc(asset);
            setLoading(false);
          }
          return;
        }
      }

      if (item.mediaType === "image") {
        const direct = tryAsset(item.filePath);
        if (direct && !cancelled) {
          setSrc(direct);
          setLoading(false);
          return;
        }
      }

      try {
        const uri = await ensureGalleryThumb(item.id);
        if (!cancelled) {
          setSrc(uri);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSrc(null);
          setLoading(false);
        }
      }
    };

    loadThumb();
    return () => {
      cancelled = true;
    };
  }, [visible, item.id, item.thumbPath, item.filePath, item.mediaType]);

  const onImgError = async () => {
    try {
      const uri = await ensureGalleryThumb(item.id);
      setSrc(uri);
    } catch {
      setSrc(null);
    }
  };

  return { src, loading, onImgError };
}

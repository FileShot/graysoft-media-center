import { useEffect, useRef, useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import type { GalleryItem } from "../lib/types";
import { useGalleryMedia } from "../hooks/useGalleryMedia";

interface GalleryTileProps {
  item: GalleryItem;
  onClick: () => void;
}

export function GalleryTile({ item, onClick }: GalleryTileProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const { src, loading, onImgError } = useGalleryMedia(item, visible);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isVideo = item.mediaType === "video";
  const showThumb = src && !loading;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-black/10 ring-1 ring-[var(--glass-border)] transition-transform hover:scale-[1.02]"
    >
      {loading && (
        <div className="absolute inset-0 animate-pulse bg-white/5" />
      )}
      {showThumb && !isVideo && (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={onImgError}
        />
      )}
      {showThumb && isVideo && (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={onImgError}
        />
      )}
      {!showThumb && !loading && (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
          {isVideo ? <Film size={20} /> : <ImageIcon size={20} />}
          <span className="text-[9px] uppercase tracking-wide">{item.mediaType}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-[10px] text-white/90">{item.prompt}</p>
      </div>
    </button>
  );
}

"""Extract gallery thumbnails without requiring ffmpeg on PATH."""

from __future__ import annotations

import logging
from pathlib import Path

import bootstrap  # noqa: F401

logger = logging.getLogger("graysoft.thumb")


def _save_frame(frame, out: Path) -> bool:
    import numpy as np
    from PIL import Image

    if frame is None:
        return False
    img = Image.fromarray(np.asarray(frame))
    if img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    max_dim = 320
    if w > max_dim or h > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="JPEG", quality=85)
    return out.is_file() and out.stat().st_size > 0


def extract_video_thumbnail(source: str, dest: str) -> bool:
    """Write a JPEG thumbnail for a video file. Returns True on success."""
    src = Path(source)
    out = Path(dest)
    if not src.is_file():
        logger.warning("Video thumbnail: source missing %s", source)
        return False

    # 1) imageio + bundled ffmpeg (most reliable on Windows)
    try:
        import imageio.v3 as iio

        for plugin in ("ffmpeg", "pyav", None):
            try:
                kwargs: dict = {"index": 0}
                if plugin:
                    kwargs["plugin"] = plugin
                frame = iio.imread(str(src), **kwargs)
                if _save_frame(frame, out):
                    return True
            except Exception as exc:
                logger.debug("thumb plugin %s failed for %s: %s", plugin, source, exc)
    except Exception as exc:
        logger.debug("imageio.v3 failed: %s", exc)

    # 2) legacy imageio reader
    try:
        import imageio

        reader = imageio.get_reader(str(src))
        try:
            frame = reader.get_data(0)
            if _save_frame(frame, out):
                return True
        finally:
            reader.close()
    except Exception as exc:
        logger.debug("imageio legacy failed: %s", exc)

    logger.warning("Video thumbnail failed for %s", source)
    return False

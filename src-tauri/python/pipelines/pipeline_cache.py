"""In-process pipeline cache keyed by model path."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from .cuda_memory import log_vram, purge_cuda_memory, release_pipeline

logger = logging.getLogger("graysoft.cache")

_cache: dict[str, Any] = {}


def _normalize_key(model_dir: str) -> str:
    return str(Path(model_dir).resolve())


def get_cached(model_dir: str) -> Any | None:
    key = _normalize_key(model_dir)
    pipe = _cache.get(key)
    if pipe is not None:
        logger.info("Pipeline cache hit: %s", key)
    return pipe


def set_cached(model_dir: str, pipe: Any) -> None:
    key = _normalize_key(model_dir)
    for existing_key, existing_pipe in list(_cache.items()):
        if existing_key != key:
            logger.info("Releasing cached pipeline for different model: %s", existing_key)
            release_pipeline(existing_pipe)
            del _cache[existing_key]
    _cache[key] = pipe
    logger.info("Pipeline cached: %s", key)
    log_vram(f"after_cache_set:{Path(key).name}")


def release_cache(model_dir: str | None = None) -> None:
    if model_dir is None:
        keys = list(_cache.keys())
        for key in keys:
            logger.info("Releasing cached pipeline: %s", key)
            release_pipeline(_cache.pop(key))
        log_vram("after_release_all")
        return

    key = _normalize_key(model_dir)
    pipe = _cache.pop(key, None)
    if pipe is not None:
        logger.info("Releasing cached pipeline: %s", key)
        release_pipeline(pipe)
        log_vram(f"after_release:{Path(key).name}")

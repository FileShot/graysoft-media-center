"""Cache HuggingFace pipeline components (VAE, text encoder, configs) locally."""

from __future__ import annotations

import bootstrap  # noqa: F401

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger("graysoft.inference")


def model_cache_dir() -> Path:
    for key in ("GRAYSOFT_CACHE_DIR", "GRAYSOFT_MODELS_DIR"):
        raw = os.environ.get(key)
        if raw:
            base = Path(raw)
            if key == "GRAYSOFT_MODELS_DIR":
                base = base / ".graysoft-cache"
            base.mkdir(parents=True, exist_ok=True)
            return base

    appdata = os.environ.get("APPDATA")
    base = (
        Path(appdata) / "GraysoftMediaCenter" / "model-cache"
        if appdata
        else Path.home() / "GraysoftMediaCenter" / "model-cache"
    )
    base.mkdir(parents=True, exist_ok=True)
    return base


def repo_cache_path(repo_id: str) -> Path:
    safe = repo_id.replace("/", "--")
    return model_cache_dir() / safe


def _has_cached_layout(cache: Path) -> bool:
    return (cache / "model_index.json").exists() or (cache / "vae" / "config.json").exists()


def ensure_hf_repo(
    repo_id: str,
    *,
    allow_patterns: list[str] | None = None,
) -> Path:
    """Download and cache non-transformer pipeline components if missing."""
    cache = repo_cache_path(repo_id)
    if _has_cached_layout(cache):
        logger.info("Using cached HF components at %s", cache)
        return cache

    from huggingface_hub import snapshot_download

    patterns = allow_patterns or [
        "model_index.json",
        "vae/**",
        "text_encoder/**",
        "tokenizer/**",
        "scheduler/**",
        "*.json",
        "*.txt",
    ]

    logger.info("Caching HF components for %s (first run only)", repo_id)
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(cache),
        allow_patterns=patterns,
        local_dir_use_symlinks=False,
    )
    return cache


def ensure_gguf_file(repo_id: str, filename: str) -> Path:
    """Download a single GGUF weight file into the app cache."""
    cache = model_cache_dir() / "gguf" / repo_id.replace("/", "--")
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / Path(filename).name
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    from huggingface_hub import hf_hub_download

    logger.info("Fetching companion GGUF %s/%s", repo_id, filename)
    path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        local_dir=str(cache),
    )
    return Path(path)


def extract_quant_tag(name: str) -> str:
    match = re.search(r"(Q\d+(?:_K)?|BF16)", name, re.IGNORECASE)
    return match.group(1).upper() if match else "Q4_K"

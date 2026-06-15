"""One-time default video model download and layout."""

from __future__ import annotations

import bootstrap  # noqa: F401

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger("graysoft.setup")

DEFAULT_MODEL_DIR = "wan-22-5b-video"
DEFAULT_GGUF_REPO = "QuantStack/Wan2.2-TI2V-5B-GGUF"
DEFAULT_GGUF_FILE = "Wan2.2-TI2V-5B-Q4_K_S.gguf"
DEFAULT_HF_REPO = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
DEFAULT_SCHEMA_ID = "wan-2.2-5b"
DEFAULT_DISPLAY_NAME = "WAN 2.2 Video"


def default_model_root(models_dir: str) -> Path:
    return Path(models_dir) / DEFAULT_MODEL_DIR


def default_gguf_path(models_dir: str) -> Path:
    return default_model_root(models_dir) / DEFAULT_GGUF_FILE


def is_default_model_ready(models_dir: str) -> bool:
    path = default_gguf_path(models_dir)
    return path.is_file() and path.stat().st_size > 0


def setup_default_video_model(models_dir: str) -> dict[str, Any]:
    from catalog_downloader import install_catalog_model

    return install_catalog_model("wan-22-5b-video", models_dir)

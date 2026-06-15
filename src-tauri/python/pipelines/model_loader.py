"""Shared model loading — local paths only, never downloads from HuggingFace."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Type

import torch

logger = logging.getLogger("graysoft.inference")

WEIGHT_EXTENSIONS = {".gguf", ".safetensors", ".ckpt", ".pt", ".bin", ".pth"}


def is_weight_file(path: str | Path) -> bool:
    p = Path(path)
    return p.is_file() and p.suffix.lower() in WEIGHT_EXTENSIONS


def has_local_weights(path: str | Path) -> bool:
    p = Path(path)
    if p.is_file():
        return p.exists() and p.stat().st_size > 0
    if not p.is_dir():
        return False
    if (p / "model_index.json").exists():
        return True
    for child in p.iterdir():
        if child.is_file() and child.suffix.lower() in WEIGHT_EXTENSIONS:
            return True
        if child.is_dir() and (child / "config.json").exists():
            return True
    return False


def load_diffusion_pipeline(
    model_path: str,
    hf_repo: str,
    pipeline_cls: Type[Any],
    torch_dtype: torch.dtype = torch.bfloat16,
):
    path = Path(model_path)
    logger.info("Loading pipeline %s from %s", pipeline_cls.__name__, model_path)

    if not has_local_weights(path):
        raise RuntimeError(
            f"No local weights found at: {model_path}. "
            "Graysoft only loads models from your disk — it does not download from HuggingFace. "
            "Point to a diffusers folder (with model_index.json) or a weight file (.gguf, .safetensors, .ckpt)."
        )

    if path.is_file():
        ext = path.suffix.lower()
        if ext == ".gguf":
            from .gguf_loader import load_gguf_pipeline

            return load_gguf_pipeline(str(path), pipeline_cls, torch_dtype, hf_repo)
        if ext in {".safetensors", ".ckpt", ".pt", ".pth", ".bin"}:
            if hasattr(pipeline_cls, "from_single_file"):
                return pipeline_cls.from_single_file(str(path), torch_dtype=torch_dtype)
            raise RuntimeError(
                f"{pipeline_cls.__name__} does not support single-file weights ({ext}). "
                "Use a full diffusers model folder instead."
            )
        raise RuntimeError(f"Unsupported weight file type: {ext}")

    try:
        return pipeline_cls.from_pretrained(
            str(path),
            torch_dtype=torch_dtype,
            local_files_only=True,
        )
    except Exception as exc:
        logger.exception("Failed to load local model from %s", model_path)
        raise RuntimeError(
            f"Could not load model from {model_path}: {exc}. "
            "Ensure the folder is a complete diffusers layout (model_index.json and component folders)."
        ) from exc

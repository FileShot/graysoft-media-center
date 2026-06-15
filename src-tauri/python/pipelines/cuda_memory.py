"""CUDA memory helpers for persistent embedded Python runtime."""

from __future__ import annotations

import gc
import logging
import os
from typing import Any

logger = logging.getLogger("graysoft.cuda")

_PIPELINE_COMPONENTS = (
    "text_encoder",
    "text_encoder_2",
    "vae",
    "transformer",
    "transformer_2",
    "unet",
    "image_encoder",
)


def configure_cuda_allocator() -> None:
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


def log_vram(tag: str) -> None:
    try:
        import torch
    except ImportError:
        return
    if not torch.cuda.is_available():
        logger.info("VRAM [%s]: CUDA not available", tag)
        return
    free, total = torch.cuda.mem_get_info()
    allocated = torch.cuda.memory_allocated()
    reserved = torch.cuda.memory_reserved()
    logger.info(
        "VRAM [%s]: free=%.0fMB total=%.0fMB allocated=%.0fMB reserved=%.0fMB",
        tag,
        free / (1024**2),
        total / (1024**2),
        allocated / (1024**2),
        reserved / (1024**2),
    )


def _move_module_to_cpu(module: Any) -> None:
    if module is None:
        return
    try:
        if hasattr(module, "to"):
            module.to("cpu")
    except Exception as exc:
        logger.warning("Failed to move module to CPU: %s", exc)


def release_pipeline(pipe: Any) -> None:
    if pipe is None:
        return
    for name in _PIPELINE_COMPONENTS:
        module = getattr(pipe, name, None)
        _move_module_to_cpu(module)
        try:
            setattr(pipe, name, None)
        except Exception:
            pass
    try:
        if hasattr(pipe, "maybe_free_model_hooks"):
            pipe.maybe_free_model_hooks()
    except Exception:
        pass
    del pipe
    for _ in range(2):
        gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except ImportError:
        pass


def purge_cuda_memory() -> None:
    """Aggressive cleanup when a load fails or VRAM is exhausted."""
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except ImportError:
        pass


def prepare_cuda_job() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass

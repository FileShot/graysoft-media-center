"""Pipeline dispatch — delegates to registry-based dynamic import."""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from .registry_dispatch import dispatch as _dispatch


def dispatch(
    model_id: str,
    hf_repo: str,
    model_dir: str,
    output_dir: str,
    params: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None],
    cancel_check: Callable[[], bool],
) -> dict[str, Any]:
    return _dispatch(
        model_id, hf_repo, model_dir, output_dir, params, progress_callback, cancel_check
    )


def make_output_path(output_dir: str, model_id: str, ext: str) -> Path:
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    name = f"{stamp}_{model_id}_{uuid.uuid4().hex[:8]}.{ext}"
    path = Path(output_dir) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def resolve_seed(params: dict[str, Any]) -> int:
    seed = int(params.get("seed", -1))
    if seed < 0:
        import random

        return random.randint(0, 2**31 - 1)
    return seed


__all__ = ["dispatch", "make_output_path", "resolve_seed"]

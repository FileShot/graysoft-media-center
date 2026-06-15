"""Load model registry and dispatch pipelines dynamically."""

from __future__ import annotations

import importlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable


@lru_cache(maxsize=1)
def load_registry() -> dict[str, dict[str, Any]]:
    path = Path(__file__).resolve().parent.parent / "model_registry.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {entry["id"]: entry for entry in data.get("models", [])}


def min_vram_gb(model_id: str) -> float:
    entry = load_registry().get(model_id, {})
    return float(entry.get("minVramGb", 8))


def dispatch(
    model_id: str,
    hf_repo: str,
    model_dir: str,
    output_dir: str,
    params: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None],
    cancel_check: Callable[[], bool],
) -> dict[str, Any]:
    entry = load_registry().get(model_id)
    if not entry:
        raise ValueError(f"Unknown model_id: {model_id}")
    module_name = entry.get("pipelineModule", model_id.replace("-", "_"))
    module = importlib.import_module(f"pipelines.{module_name}")
    generate = getattr(module, "generate")
    return generate(hf_repo, model_dir, output_dir, params, progress_callback, cancel_check)

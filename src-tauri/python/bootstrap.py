"""Fix embedded-Python stdio and shared helpers."""

from __future__ import annotations

import io
import os
import sys
from pathlib import Path


def ensure_stdio() -> None:
    """Tauri embeds Python without stdout/stderr — pip and HF crash without this."""
    if sys.stdout is not None and sys.stderr is not None:
        return

    appdata = os.environ.get("APPDATA")
    base = (
        Path(appdata) / "GraysoftMediaCenter" / "logs"
        if appdata
        else Path.home() / "GraysoftMediaCenter" / "logs"
    )
    base.mkdir(parents=True, exist_ok=True)

    if sys.stdout is None:
        sys.stdout = open(base / "python-stdout.log", "a", encoding="utf-8", buffering=1)
    if sys.stderr is None:
        sys.stderr = open(base / "python-stderr.log", "a", encoding="utf-8", buffering=1)
    if sys.stdin is None:
        sys.stdin = io.StringIO("")


ensure_stdio()


def configure_cuda_allocator() -> None:
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


configure_cuda_allocator()

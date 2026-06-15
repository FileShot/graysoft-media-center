"""Shared progress and cancel helpers for all pipelines."""

from __future__ import annotations

from typing import Any, Callable


def make_step_callback(
    progress_callback: Callable[[dict[str, Any]], None],
    cancel_check: Callable[[], bool],
    *,
    phase: str = "denoise",
    start: float = 0.45,
    span: float = 0.43,
    total_steps: int,
):
    def step_progress(_pipe, step: int, _timestep, callback_kwargs):
        if cancel_check():
            raise RuntimeError("Cancelled")
        current = step + 1
        progress_callback(
            {
                "progress": start + (current / max(total_steps, 1)) * span,
                "message": f"Denoising step {current}/{total_steps}",
                "phase": phase,
                "step": current,
                "total_steps": total_steps,
            }
        )
        return callback_kwargs

    return step_progress


def check_cancel(cancel_check: Callable[[], bool]) -> None:
    if cancel_check():
        raise RuntimeError("Cancelled")

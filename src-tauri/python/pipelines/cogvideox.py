from __future__ import annotations

from typing import Any, Callable

from . import make_output_path, resolve_seed
from .ltx_video_2 import export_video
from .model_loader import load_diffusion_pipeline
from .pipeline_helpers import check_cancel, make_step_callback


def generate(
    hf_repo: str,
    model_dir: str,
    output_dir: str,
    params: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None],
    cancel_check: Callable[[], bool],
) -> dict[str, Any]:
    import torch

    check_cancel(cancel_check)
    progress_callback({"progress": 0.2, "message": "Loading CogVideoX pipeline", "phase": "load"})
    try:
        from diffusers import CogVideoXPipeline
    except ImportError as exc:
        raise RuntimeError(
            "CogVideoX requires a recent diffusers build with CogVideoXPipeline support"
        ) from exc

    pipe = load_diffusion_pipeline(model_dir, hf_repo, CogVideoXPipeline, torch.bfloat16)
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")

    width = int(params.get("width", 720))
    height = int(params.get("height", 480))
    steps = int(params.get("steps", 50))
    cfg = float(params.get("cfg", 6.0))
    fps = int(params.get("fps", 8))
    num_frames = int(params.get("num_frames", params.get("frame_count", 49)))
    seed = resolve_seed(params)
    generator = torch.Generator(device="cuda").manual_seed(seed)

    progress_callback(
        {"progress": 0.45, "message": "Generating video frames", "phase": "denoise", "step": 0, "total_steps": steps}
    )
    result = pipe(
        prompt=params.get("prompt", ""),
        negative_prompt=params.get("negative_prompt", ""),
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=steps,
        guidance_scale=cfg,
        generator=generator,
        callback_on_step_end=make_step_callback(
            progress_callback, cancel_check, total_steps=steps
        ),
    )

    progress_callback({"progress": 0.92, "message": "Saving video", "phase": "save"})
    out = make_output_path(output_dir, "cogvideox", "mp4")
    export_video(result.frames[0], out, fps=fps)
    duration = round(num_frames / max(fps, 1), 2)

    return {
        "file_path": str(out),
        "media_type": "video",
        "width": width,
        "height": height,
        "duration": duration,
        "seed": seed,
    }

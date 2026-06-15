from __future__ import annotations

from typing import Any, Callable

from . import make_output_path, resolve_seed
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
    progress_callback({"progress": 0.2, "message": "Loading LTX-Video pipeline", "phase": "load"})
    try:
        from diffusers import LTXPipeline
    except ImportError as exc:
        raise RuntimeError(
            "LTX pipeline requires a recent diffusers build with LTXPipeline support"
        ) from exc

    pipe = load_diffusion_pipeline(model_dir, hf_repo, LTXPipeline, torch.bfloat16)
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")

    width = int(params.get("width", 768))
    height = int(params.get("height", 512))
    steps = int(params.get("steps", 30))
    cfg = float(params.get("cfg", 3.0))
    fps = int(params.get("fps", 24))
    num_frames = int(params.get("num_frames", params.get("frame_count", 121)))
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
    out = make_output_path(output_dir, "ltx-video-2", "mp4")
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


def export_video(frames, output_path, fps: int) -> None:
    import imageio.v3 as iio
    import numpy as np

    video_frames = []
    for frame in frames:
        if hasattr(frame, "convert"):
            frame = frame.convert("RGB")
            video_frames.append(np.array(frame))
        else:
            video_frames.append(frame)
    iio.imwrite(output_path, video_frames, fps=fps, codec="libx264")

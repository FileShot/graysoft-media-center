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
    from PIL import Image

    check_cancel(cancel_check)
    source = params.get("reference_image") or params.get("init_image")
    if not source:
        raise RuntimeError("Stable Video Diffusion requires a source image (reference_image)")

    progress_callback({"progress": 0.2, "message": "Loading Stable Video Diffusion", "phase": "load"})
    try:
        from diffusers import StableVideoDiffusionPipeline
    except ImportError as exc:
        raise RuntimeError(
            "Stable Video Diffusion requires diffusers with StableVideoDiffusionPipeline support"
        ) from exc

    pipe = load_diffusion_pipeline(
        model_dir, hf_repo, StableVideoDiffusionPipeline, torch.float16
    )
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")

    image = Image.open(source).convert("RGB")
    width = int(params.get("width", 1024))
    height = int(params.get("height", 576))
    image = image.resize((width, height))
    steps = int(params.get("steps", 25))
    fps = int(params.get("fps", 7))
    num_frames = int(params.get("num_frames", params.get("frame_count", 25)))
    motion_bucket_id = int(params.get("motion_bucket_id", 127))
    noise_aug_strength = float(params.get("noise_aug_strength", 0.02))
    seed = resolve_seed(params)
    generator = torch.Generator(device="cuda").manual_seed(seed)

    progress_callback(
        {"progress": 0.45, "message": "Generating video from image", "phase": "denoise", "step": 0, "total_steps": steps}
    )
    result = pipe(
        image=image,
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=steps,
        motion_bucket_id=motion_bucket_id,
        noise_aug_strength=noise_aug_strength,
        decode_chunk_size=4,
        generator=generator,
        callback_on_step_end=make_step_callback(
            progress_callback, cancel_check, total_steps=steps
        ),
    )

    progress_callback({"progress": 0.92, "message": "Saving video", "phase": "save"})
    out = make_output_path(output_dir, "stable-video-diffusion", "mp4")
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

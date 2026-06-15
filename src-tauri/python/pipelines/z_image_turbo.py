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
    from diffusers import AutoPipelineForText2Image

    check_cancel(cancel_check)
    progress_callback({"progress": 0.2, "message": "Loading turbo pipeline", "phase": "load"})
    pipe = load_diffusion_pipeline(
        model_dir, hf_repo, AutoPipelineForText2Image, torch.float16
    )
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")

    width = int(params.get("width", 512))
    height = int(params.get("height", 512))
    steps = int(params.get("steps", 4))
    cfg = float(params.get("cfg", 0.0))
    seed = resolve_seed(params)
    generator = torch.Generator(device="cuda").manual_seed(seed)

    progress_callback(
        {"progress": 0.45, "message": "Generating image", "phase": "denoise", "step": 0, "total_steps": steps}
    )
    result = pipe(
        prompt=params.get("prompt", ""),
        width=width,
        height=height,
        num_inference_steps=steps,
        generator=generator,
        guidance_scale=cfg,
        callback_on_step_end=make_step_callback(
            progress_callback, cancel_check, total_steps=steps
        ),
    )
    progress_callback({"progress": 0.92, "message": "Saving image", "phase": "save"})
    image = result.images[0]
    out = make_output_path(output_dir, "z-image-turbo", "png")
    image.save(out)
    return {
        "file_path": str(out),
        "media_type": "image",
        "width": width,
        "height": height,
        "duration": None,
        "seed": seed,
    }

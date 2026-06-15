from __future__ import annotations

from typing import Any, Callable

from . import make_output_path, resolve_seed
from .cuda_memory import log_vram, prepare_cuda_job, purge_cuda_memory
from .pipeline_cache import get_cached, release_cache, set_cached


def generate(
    hf_repo: str,
    model_dir: str,
    output_dir: str,
    params: dict[str, Any],
    progress_callback: Callable[[dict[str, Any]], None],
    cancel_check: Callable[[], bool],
) -> dict[str, Any]:
    import os

    import torch

    if cancel_check():
        raise RuntimeError("Cancelled")

    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    prepare_cuda_job()
    log_vram("job_start")

    progress_callback({"progress": 0.2, "message": "Loading WAN video pipeline", "phase": "load"})
    try:
        pipe = _get_or_load_wan_pipeline(model_dir, hf_repo, progress_callback)
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
            pipe.vae.enable_tiling()
        lora_path = params.get("lora_path")
        if lora_path and hasattr(pipe, "load_lora_weights"):
            progress_callback({"progress": 0.28, "message": "Loading LoRA adapter", "phase": "load"})
            pipe.load_lora_weights(lora_path)
        log_vram("pipeline_ready")

        width = int(params.get("width", 832))
        height = int(params.get("height", 480))
        steps = int(params.get("steps", 30))
        cfg = float(params.get("cfg", 6.0))
        fps = int(params.get("fps", 16))
        frame_count = _wan_frame_count(int(params.get("frame_count", 81)))
        seed = resolve_seed(params)
        generator = torch.Generator(device="cuda").manual_seed(seed)

        progress_callback({"progress": 0.35, "message": "Encoding prompt on CPU", "phase": "encode"})
        prompt_embeds, negative_prompt_embeds = _encode_wan_prompts(
            pipe,
            params.get("prompt", ""),
            params.get("negative_prompt", ""),
            cfg,
        )
        log_vram("after_prompt_encode")

        def step_progress(_pipe, step: int, _timestep, callback_kwargs):
            if cancel_check():
                raise RuntimeError("Cancelled")
            current = step + 1
            progress_callback(
                {
                    "progress": 0.45 + (current / max(steps, 1)) * 0.43,
                    "message": f"Denoising step {current}/{steps}",
                    "phase": "denoise",
                    "step": current,
                    "total_steps": steps,
                }
            )
            return callback_kwargs

        progress_callback(
            {"progress": 0.45, "message": "Generating video frames", "phase": "denoise", "step": 0, "total_steps": steps}
        )
        pipe_kwargs: dict[str, Any] = {
            "prompt": None,
            "negative_prompt": None,
            "prompt_embeds": prompt_embeds,
            "negative_prompt_embeds": negative_prompt_embeds,
            "width": width,
            "height": height,
            "num_frames": frame_count,
            "num_inference_steps": steps,
            "guidance_scale": cfg,
            "generator": generator,
            "output_type": "latent",
            "callback_on_step_end": step_progress,
            "callback_on_step_end_tensor_inputs": ["latents"],
        }
        reference_image = params.get("reference_image")
        if reference_image:
            from PIL import Image

            pipe_kwargs["image"] = Image.open(reference_image).convert("RGB")
        latent_out = pipe(**pipe_kwargs)
        log_vram("after_denoise")

        del prompt_embeds, negative_prompt_embeds, generator
        purge_cuda_memory()

        progress_callback({"progress": 0.9, "message": "Decoding video on CPU", "phase": "decode"})
        frames = _decode_wan_latents(pipe, latent_out.frames)
        del latent_out
        purge_cuda_memory()

        out = make_output_path(output_dir, "wan", "mp4")
        export_video(frames[0], out, fps=fps)
        duration = round(frame_count / max(fps, 1), 2)

        return {
            "file_path": str(out),
            "media_type": "video",
            "width": width,
            "height": height,
            "duration": duration,
            "seed": seed,
        }
    except Exception:
        release_cache(model_dir)
        purge_cuda_memory()
        raise
    finally:
        log_vram("job_end")


def _encode_wan_prompts(
    pipe,
    prompt: str,
    negative_prompt: str,
    guidance_scale: float,
):
    import torch

    with torch.inference_mode():
        prompt_embeds, negative_prompt_embeds = pipe.encode_prompt(
            prompt=prompt,
            negative_prompt=negative_prompt,
            do_classifier_free_guidance=guidance_scale > 1.0,
            device=torch.device("cpu"),
        )
    exec_device = pipe._execution_device
    prompt_embeds = prompt_embeds.to(exec_device)
    if negative_prompt_embeds is not None:
        negative_prompt_embeds = negative_prompt_embeds.to(exec_device)
    return prompt_embeds, negative_prompt_embeds


def _decode_wan_latents(pipe, latents):
    import torch

    latents = latents.to(pipe.vae.dtype)
    latents_mean = (
        torch.tensor(pipe.vae.config.latents_mean)
        .view(1, pipe.vae.config.z_dim, 1, 1, 1)
        .to(latents.device, latents.dtype)
    )
    latents_std = 1.0 / torch.tensor(pipe.vae.config.latents_std).view(
        1, pipe.vae.config.z_dim, 1, 1, 1
    ).to(latents.device, latents.dtype)
    latents = latents / latents_std + latents_mean
    latents = latents.cpu()
    with torch.inference_mode():
        video = pipe.vae.decode(latents, return_dict=False)[0]
    return pipe.video_processor.postprocess_video(video, output_type="np")


def _get_or_load_wan_pipeline(
    model_dir: str,
    hf_repo: str,
    progress_callback: Callable[[dict[str, Any]], None],
):
    cached = get_cached(model_dir)
    if cached is not None:
        progress_callback({"progress": 0.35, "message": "Reusing loaded WAN pipeline", "phase": "load"})
        return cached

    release_cache(None)
    purge_cuda_memory()
    log_vram("before_load")

    pipe = _load_wan_pipeline(model_dir, hf_repo, progress_callback)
    _enable_wan_vae_tiling(pipe)
    set_cached(model_dir, pipe)
    return pipe


def _enable_wan_vae_tiling(pipe) -> None:
    if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
        pipe.vae.enable_tiling()
    elif hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()


def _load_wan_pipeline(
    model_dir: str,
    hf_repo: str,
    progress_callback: Callable[[dict[str, Any]], None],
):
    from pathlib import Path

    import torch

    from .gguf_loader import detect_gguf_profile, load_gguf_pipeline
    from .model_loader import has_local_weights, load_diffusion_pipeline

    path = Path(model_dir)
    if path.is_file() and path.suffix.lower() == ".gguf":
        progress_callback({"progress": 0.25, "message": "Loading GGUF weights"})
        return load_gguf_pipeline(
            str(path),
            pipeline_cls=None,
            torch_dtype=torch.bfloat16,
            hf_repo=hf_repo,
            progress_callback=progress_callback,
        )

    if path.is_file():
        model_dir = str(path.parent)

    profile = detect_gguf_profile(model_dir, hf_repo)
    if profile.family.startswith("wan"):
        ggufs = list(Path(model_dir).rglob("*.gguf"))
        if ggufs:
            progress_callback({"progress": 0.25, "message": "Loading WAN GGUF weights"})
            return load_gguf_pipeline(
                str(ggufs[0]),
                pipeline_cls=None,
                torch_dtype=torch.bfloat16,
                hf_repo=hf_repo,
                progress_callback=progress_callback,
            )

    if not has_local_weights(model_dir):
        raise RuntimeError(f"No WAN weights found at {model_dir}")

    progress_callback({"progress": 0.25, "message": "Loading WAN diffusers folder"})
    try:
        from diffusers import WanPipeline
    except ImportError as exc:
        raise RuntimeError(
            "WAN requires a recent diffusers build. Click Install Packages in the header."
        ) from exc

    pipe = load_diffusion_pipeline(model_dir, hf_repo, WanPipeline, torch.bfloat16)
    if hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")
    return pipe


def _wan_frame_count(frame_count: int) -> int:
    """WAN requires num_frames - 1 divisible by 4."""
    frame_count = max(5, frame_count)
    remainder = (frame_count - 1) % 4
    if remainder:
        frame_count += 4 - remainder
    return frame_count


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

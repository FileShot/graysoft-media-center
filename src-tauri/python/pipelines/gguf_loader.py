"""Load diffusion pipelines from GGUF weight files."""

from __future__ import annotations

import logging
import re
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Type

import torch

from .hf_cache import ensure_hf_repo

logger = logging.getLogger("graysoft.inference")


@dataclass
class GgufProfile:
    family: str
    variant: str
    hf_repo: str
    gguf_repo: str | None
    is_t2v: bool
    is_i2v: bool
    is_moe: bool


def detect_gguf_profile(gguf_path: str, hf_repo: str = "") -> GgufProfile:
    name = Path(gguf_path).name.lower()
    repo = hf_repo.lower()

    if "wan" in name or "wan" in repo:
        is_t2v = "t2v" in name or "t2v" in repo
        is_i2v = "i2v" in name or "i2v" in repo
        is_a14b = "a14b" in name or "14b" in name or "highnoise" in name or "lownoise" in name
        is_5b = "5b" in name or "ti2v" in name or "ti2v" in repo

        if ("2.2" in name or "wan2.2" in name or "wan22" in name) and is_5b and not is_a14b:
            return GgufProfile(
                family="wan22_5b",
                variant="ti2v-5b",
                hf_repo="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
                gguf_repo=None,
                is_t2v=True,
                is_i2v=True,
                is_moe=False,
            )

        if ("2.2" in name or "wan2.2" in name or "wan22" in name) and is_a14b:
            if is_i2v or (not is_t2v and "i2v" in repo):
                return GgufProfile(
                    family="wan22",
                    variant="i2v-a14b",
                    hf_repo="Wan-AI/Wan2.2-I2V-A14B-Diffusers",
                    gguf_repo="QuantStack/Wan2.2-I2V-A14B-GGUF",
                    is_t2v=False,
                    is_i2v=True,
                    is_moe=True,
                )
            return GgufProfile(
                family="wan22",
                variant="t2v-a14b",
                hf_repo="Wan-AI/Wan2.2-T2V-A14B-Diffusers",
                gguf_repo="QuantStack/Wan2.2-T2V-A14B-GGUF",
                is_t2v=True,
                is_i2v=False,
                is_moe=True,
            )
        if "1.3b" in name or "1.3b" in repo:
            return GgufProfile(
                family="wan21",
                variant="t2v-1.3b",
                hf_repo="Wan-AI/Wan2.1-T2V-1.3B",
                gguf_repo=None,
                is_t2v=True,
                is_i2v=False,
                is_moe=False,
            )
        return GgufProfile(
            family="wan21",
            variant="t2v",
            hf_repo=hf_repo or "Wan-AI/Wan2.1-T2V-1.3B",
            gguf_repo=None,
            is_t2v=True,
            is_i2v=False,
            is_moe=False,
        )

    if "flux" in name or "flux" in repo:
        repo_id = hf_repo or (
            "black-forest-labs/FLUX.1-schnell"
            if "schnell" in name
            else "black-forest-labs/FLUX.1-dev"
        )
        return GgufProfile(
            family="flux",
            variant="schnell" if "schnell" in name else "dev",
            hf_repo=repo_id,
            gguf_repo=None,
            is_t2v=False,
            is_i2v=False,
            is_moe=False,
        )

    if "sdxl" in name or "xl" in name or "stable" in name:
        return GgufProfile(
            family="sdxl",
            variant="base",
            hf_repo=hf_repo or "stabilityai/stable-diffusion-xl-base-1.0",
            gguf_repo=None,
            is_t2v=False,
            is_i2v=False,
            is_moe=False,
        )

    return GgufProfile(
        family="generic",
        variant="unknown",
        hf_repo=hf_repo or "",
        gguf_repo=None,
        is_t2v=False,
        is_i2v=False,
        is_moe=False,
    )


def _scan_gguf_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in root.rglob("*.gguf") if p.is_file() and p.stat().st_size > 0]


def _classify_wan_gguf(path: Path) -> str:
    name = path.name.lower()
    if "highnoise" in name or "high_noise" in name or "high-noise" in name:
        return "high"
    if "lownoise" in name or "low_noise" in name or "low-noise" in name:
        return "low"
    return "unknown"


def _find_wan_gguf_pair(gguf_path: Path) -> tuple[Path | None, Path | None]:
    roots = {gguf_path.parent, gguf_path.parent.parent}
    highs: list[Path] = []
    lows: list[Path] = []
    for root in roots:
        for candidate in _scan_gguf_files(root):
            role = _classify_wan_gguf(candidate)
            if role == "high":
                highs.append(candidate)
            elif role == "low":
                lows.append(candidate)

    role = _classify_wan_gguf(gguf_path)
    if role == "low":
        return highs[0] if highs else None, gguf_path
    if role == "high":
        return gguf_path, lows[0] if lows else None
    return highs[0] if highs else None, lows[0] if lows else gguf_path


def _resolve_missing_wan_gguf(
    profile: GgufProfile,
    role: str,
    reference: Path,
) -> Path:
    raise RuntimeError(
        f"WAN 2.2 A14B needs two GGUF files (HighNoise + LowNoise). "
        f"You only have {reference.name}. "
        f"This app does not download extra weight files for you. "
        f"Use Wan 2.2 TI2V 5B instead — one GGUF file, under 4 GB: "
        f"QuantStack/Wan2.2-TI2V-5B-GGUF (pick Q4_K_S or Q3_K_S)."
    )


def _load_wan_transformer(
    path: Path,
    profile: GgufProfile,
    subfolder: str,
    torch_dtype: torch.dtype,
):
    from diffusers import GGUFQuantizationConfig, WanTransformer3DModel

    quant = GGUFQuantizationConfig(compute_dtype=torch_dtype)
    kwargs: dict[str, Any] = {
        "quantization_config": quant,
        "config": profile.hf_repo,
        "subfolder": subfolder,
        "torch_dtype": torch_dtype,
        "offload_device": "cpu",
        "device": torch.device("cuda"),
    }
    logger.info("Loading WAN transformer (%s) from %s", subfolder, path)
    return WanTransformer3DModel.from_single_file(str(path), **kwargs)


def _find_local_vae(model_root: Path):
    import torch
    from diffusers import AutoencoderKLWan

    candidates = [
        model_root / "VAE",
        model_root / "vae",
        model_root.parent / "VAE",
        model_root.parent / "vae",
    ]
    for folder in candidates:
        if not folder.is_dir():
            continue
        for weight in folder.glob("*.safetensors"):
            logger.info("Loading local VAE from %s", weight)
            return AutoencoderKLWan.from_single_file(str(weight), torch_dtype=torch.bfloat16)
    return None


def _apply_pipeline_offload(pipe, *, gguf: bool = False) -> None:
    if gguf:
        logger.info(
            "GGUF low-VRAM: text_encoder + VAE stay on CPU; "
            "only transformer uses CUDA during denoising"
        )
        for name in ("text_encoder", "vae"):
            module = getattr(pipe, name, None)
            if module is not None:
                module.to("cpu")
        return

    try:
        if hasattr(pipe, "enable_sequential_cpu_offload"):
            pipe.enable_sequential_cpu_offload()
        elif hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
        else:
            pipe.to("cuda")
    except Exception as exc:
        logger.warning("CPU offload failed (%s), falling back to cuda", exc)
        pipe.to("cuda")


def _build_wan_pipeline_from_parts(
    base: Path,
    transformer,
    vae,
    torch_dtype: torch.dtype,
    *,
    transformer_2=None,
    boundary_ratio: float | None = None,
):
    """Build WanPipeline without from_pretrained — model_index null entries crash diffusers."""
    from diffusers import UniPCMultistepScheduler, WanPipeline
    from transformers import T5TokenizerFast, UMT5EncoderModel

    text_encoder = UMT5EncoderModel.from_pretrained(
        str(base),
        subfolder="text_encoder",
        torch_dtype=torch_dtype,
        local_files_only=True,
    )
    tokenizer = T5TokenizerFast.from_pretrained(
        str(base),
        subfolder="tokenizer",
        local_files_only=True,
    )
    scheduler = UniPCMultistepScheduler.from_pretrained(
        str(base),
        subfolder="scheduler",
        local_files_only=True,
    )

    kwargs: dict[str, Any] = {
        "transformer": transformer,
        "vae": vae,
        "text_encoder": text_encoder,
        "tokenizer": tokenizer,
        "scheduler": scheduler,
    }
    if transformer_2 is not None:
        kwargs["transformer_2"] = transformer_2
    if boundary_ratio is not None:
        kwargs["boundary_ratio"] = boundary_ratio

    return WanPipeline(**kwargs)


def _load_wan22_5b_gguf(gguf_path: str, profile: GgufProfile, torch_dtype: torch.dtype):
    from diffusers import AutoencoderKLWan, WanTransformer3DModel, GGUFQuantizationConfig

    path = Path(gguf_path)
    model_root = path.parent

    logger.info("Loading single-file WAN 2.2 5B GGUF: %s", path.name)

    base = ensure_hf_repo(
        profile.hf_repo,
        allow_patterns=[
            "model_index.json",
            "vae/**",
            "text_encoder/**",
            "tokenizer/**",
            "scheduler/**",
            "*.json",
        ],
    )
    quant = GGUFQuantizationConfig(compute_dtype=torch_dtype)
    transformer = None
    pipe = None
    try:
        transformer = WanTransformer3DModel.from_single_file(
            str(path),
            quantization_config=quant,
            config=profile.hf_repo,
            subfolder="transformer",
            torch_dtype=torch_dtype,
            offload_device="cpu",
            device=torch.device("cuda"),
        )

        vae = _find_local_vae(model_root)
        if vae is None:
            vae = AutoencoderKLWan.from_pretrained(
                str(base),
                subfolder="vae",
                torch_dtype=torch_dtype,
                local_files_only=True,
            )

        pipe = _build_wan_pipeline_from_parts(base, transformer, vae, torch_dtype)
        _apply_pipeline_offload(pipe, gguf=True)
        return pipe
    except Exception:
        from .cuda_memory import purge_cuda_memory, release_pipeline

        if pipe is not None:
            release_pipeline(pipe)
        elif transformer is not None:
            release_pipeline(transformer)
        purge_cuda_memory()
        raise


def _load_wan22_gguf(gguf_path: str, profile: GgufProfile, torch_dtype: torch.dtype):
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline, WanPipeline

    path = Path(gguf_path)
    high_path, low_path = _find_wan_gguf_pair(path)

    if profile.is_moe:
        if high_path is None:
            high_path = _resolve_missing_wan_gguf(profile, "high", low_path or path)
        if low_path is None:
            low_path = _resolve_missing_wan_gguf(profile, "low", high_path or path)

    base = ensure_hf_repo(profile.hf_repo)

    if profile.is_moe:
        transformer = _load_wan_transformer(high_path, profile, "transformer", torch_dtype)
        transformer_2 = _load_wan_transformer(low_path, profile, "transformer_2", torch_dtype)
        vae = AutoencoderKLWan.from_pretrained(
            str(base),
            subfolder="vae",
            torch_dtype=torch_dtype,
            local_files_only=True,
        )
        boundary = 0.9 if profile.is_i2v else None
        try:
            if profile.is_i2v:
                pipe = WanImageToVideoPipeline.from_pretrained(
                    str(base),
                    transformer=transformer,
                    transformer_2=transformer_2,
                    vae=vae,
                    torch_dtype=torch_dtype,
                    boundary_ratio=boundary,
                    local_files_only=True,
                )
            else:
                pipe = WanPipeline.from_pretrained(
                    str(base),
                    transformer=transformer,
                    transformer_2=transformer_2,
                    vae=vae,
                    torch_dtype=torch_dtype,
                    local_files_only=True,
                )
        except (KeyError, TypeError) as exc:
            if getattr(exc, "args", (None,))[0] is not None:
                raise
            logger.info("Building WAN MoE pipeline from explicit components")
            core = _build_wan_pipeline_from_parts(
                base,
                transformer,
                vae,
                torch_dtype,
                transformer_2=transformer_2,
            )
            if profile.is_i2v:
                pipe = WanImageToVideoPipeline(
                    transformer=transformer,
                    transformer_2=transformer_2,
                    vae=vae,
                    text_encoder=core.text_encoder,
                    tokenizer=core.tokenizer,
                    scheduler=core.scheduler,
                    boundary_ratio=boundary,
                )
            else:
                pipe = core
    else:
        transformer = _load_wan_transformer(path, profile, "transformer", torch_dtype)
        try:
            pipe = WanPipeline.from_pretrained(
                str(base),
                transformer=transformer,
                torch_dtype=torch_dtype,
                local_files_only=True,
            )
        except (KeyError, TypeError) as exc:
            if getattr(exc, "args", (None,))[0] is not None:
                raise
            vae = AutoencoderKLWan.from_pretrained(
                str(base),
                subfolder="vae",
                torch_dtype=torch_dtype,
                local_files_only=True,
            )
            pipe = _build_wan_pipeline_from_parts(base, transformer, vae, torch_dtype)

    _apply_pipeline_offload(pipe, gguf=True)
    return pipe


def _load_flux_gguf(gguf_path: str, profile: GgufProfile, torch_dtype: torch.dtype):
    from diffusers import FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig

    base = ensure_hf_repo(
        profile.hf_repo,
        allow_patterns=[
            "model_index.json",
            "text_encoder/**",
            "text_encoder_2/**",
            "tokenizer/**",
            "tokenizer_2/**",
            "vae/**",
            "scheduler/**",
            "*.json",
        ],
    )
    transformer = FluxTransformer2DModel.from_single_file(
        gguf_path,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch_dtype),
        config=profile.hf_repo,
        subfolder="transformer",
        torch_dtype=torch_dtype,
    )
    pipe = FluxPipeline.from_pretrained(
        str(base),
        transformer=transformer,
        torch_dtype=torch_dtype,
        local_files_only=True,
    )
    _apply_pipeline_offload(pipe, gguf=True)
    return pipe


def _load_sdxl_gguf(gguf_path: str, profile: GgufProfile, torch_dtype: torch.dtype):
    from diffusers import GGUFQuantizationConfig, StableDiffusionXLPipeline, UNet2DConditionModel

    base = ensure_hf_repo(profile.hf_repo)
    unet = UNet2DConditionModel.from_single_file(
        gguf_path,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch_dtype),
        config=profile.hf_repo,
        subfolder="unet",
        torch_dtype=torch_dtype,
    )
    pipe = StableDiffusionXLPipeline.from_pretrained(
        str(base),
        unet=unet,
        torch_dtype=torch_dtype,
        local_files_only=True,
    )
    _apply_pipeline_offload(pipe, gguf=True)
    return pipe


def load_gguf_pipeline(
    gguf_path: str,
    pipeline_cls: Type[Any] | None,
    torch_dtype: torch.dtype = torch.bfloat16,
    hf_repo: str = "",
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
):
    try:
        import gguf  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "GGUF support requires the gguf package. Click Install Packages in the header."
        ) from exc

    profile = detect_gguf_profile(gguf_path, hf_repo)
    logger.info("GGUF profile: %s %s for %s", profile.family, profile.variant, gguf_path)

    if progress_callback:
        progress_callback({"progress": 0.15, "message": "Preparing model components"})

    if profile.family == "wan22_5b":
        return _load_wan22_5b_gguf(gguf_path, profile, torch_dtype)

    if profile.family in {"wan22", "wan21"}:
        return _load_wan22_gguf(gguf_path, profile, torch_dtype)

    if profile.family == "flux":
        return _load_flux_gguf(gguf_path, profile, torch_dtype)

    if profile.family == "sdxl":
        return _load_sdxl_gguf(gguf_path, profile, torch_dtype)

    if hasattr(pipeline_cls, "from_single_file") and pipeline_cls is not None:
        from diffusers import GGUFQuantizationConfig

        logger.info("Loading GGUF via %s.from_single_file", pipeline_cls.__name__)
        return pipeline_cls.from_single_file(
            gguf_path,
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch_dtype),
            torch_dtype=torch_dtype,
        )

    raise RuntimeError(f"Unsupported GGUF model: {Path(gguf_path).name}")

"""Graysoft Media Center embedded inference engine."""

from __future__ import annotations

import bootstrap  # noqa: F401 — fix embedded stdio before anything else

import json
import logging
import os
from pathlib import Path
from typing import Any, Callable


def _setup_logging() -> None:
    appdata = os.environ.get("APPDATA")
    base = (
        Path(appdata) / "GraysoftMediaCenter"
        if appdata
        else Path.home() / "GraysoftMediaCenter"
    )
    log_dir = base / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_dir / "inference.log", encoding="utf-8")
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root = logging.getLogger("graysoft")
    root.setLevel(logging.INFO)
    if not root.handlers:
        root.addHandler(handler)


_setup_logging()
logger = logging.getLogger("graysoft.engine")


def get_engine_status() -> dict[str, Any]:
    from runtime_deps import check_runtime_packages

    packages_ok, missing = check_runtime_packages()
    if not packages_ok:
        return {
            "cuda_available": False,
            "device_name": "",
            "vram_gb": 0.0,
            "torch_ready": "torch" not in missing,
            "packages_ready": False,
            "message": f"Missing Python packages: {', '.join(missing)}. Click Install Packages in the header.",
        }

    try:
        import torch

        cuda = torch.cuda.is_available()
        device_name = torch.cuda.get_device_name(0) if cuda else ""
        vram_gb = 0.0
        if cuda:
            props = torch.cuda.get_device_properties(0)
            vram_gb = round(props.total_memory / (1024**3), 2)
        return {
            "cuda_available": cuda,
            "device_name": device_name,
            "vram_gb": vram_gb,
            "torch_ready": True,
            "packages_ready": True,
            "message": "CUDA ready" if cuda else "CUDA not available — NVIDIA GPU required",
        }
    except ImportError as exc:
        missing = str(exc).split("'")[-2] if "'" in str(exc) else "torch"
        return {
            "cuda_available": False,
            "device_name": "",
            "vram_gb": 0.0,
            "torch_ready": False,
            "packages_ready": False,
            "message": f"Missing Python package: {missing}. Click Install Packages in the header.",
        }


def install_packages() -> str:
    from runtime_deps import ensure_runtime_packages, pip_install, site_packages_dir

    site_packages = site_packages_dir()
    site_packages.mkdir(parents=True, exist_ok=True)
    pip_install([], extra_args=["--upgrade", "pip"])
    pip_install(
        [
            "torch",
            "torchvision",
            "--index-url",
            "https://download.pytorch.org/whl/cu124",
        ]
    )
    pip_install(
        [
            "git+https://github.com/huggingface/diffusers",
            "transformers",
            "accelerate",
            "huggingface_hub",
            "safetensors",
            "imageio",
            "imageio-ffmpeg",
            "gguf",
            "numpy",
            "sentencepiece",
            "protobuf",
            "ftfy",
            "regex",
            "Pillow",
            "einops",
        ]
    )
    ensure_runtime_packages(auto_install=False)
    return "Python packages installed"


def download_model(model_id: str, hf_repo: str, dest_dir: str) -> str:
    from huggingface_hub import snapshot_download

    path = Path(dest_dir)
    path.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=hf_repo,
        local_dir=str(path),
        local_dir_use_symlinks=False,
    )
    return f"Downloaded {model_id} to {dest_dir}"


def release_inference_memory(model_dir: str | None = None) -> None:
    from pipelines.pipeline_cache import release_cache

    release_cache(model_dir)


def generate(
    model_id: str,
    hf_repo: str,
    model_dir: str,
    models_root: str,
    output_dir: str,
    prompt: str,
    negative_prompt: str,
    params_json: str,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    from runtime_deps import ensure_runtime_packages

    ensure_runtime_packages(auto_install=True)
    logger.info("generate model_id=%s path=%s", model_id, model_dir)
    model_path = Path(model_dir)
    cache_base = model_path.parent if model_path.is_file() else model_path
    os.environ["GRAYSOFT_CACHE_DIR"] = str(cache_base / ".graysoft-cache")
    params = json.loads(params_json)
    params["prompt"] = prompt
    params["negative_prompt"] = negative_prompt

    def _progress(payload: dict[str, Any]) -> None:
        logger.info(
            "progress %.0f%% — %s",
            float(payload.get("progress", 0)) * 100,
            payload.get("message", ""),
        )
        if progress_callback is not None:
            progress_callback(payload)

    def _cancel() -> bool:
        if cancel_check is not None:
            return cancel_check()
        return False

    from pipelines import dispatch

    try:
        return dispatch(
            model_id=model_id,
            hf_repo=hf_repo,
            model_dir=model_dir,
            output_dir=output_dir,
            params=params,
            progress_callback=_progress,
            cancel_check=_cancel,
        )
    except Exception as exc:
        import traceback

        tb = traceback.format_exc()
        logger.error("Generation failed for %s:\n%s", model_id, tb)
        msg = str(exc).strip() or exc.__class__.__name__
        if "KeyError" in tb or "Traceback" in tb:
            raise RuntimeError(f"{msg}\n\n{tb[-2500:]}") from exc
        raise

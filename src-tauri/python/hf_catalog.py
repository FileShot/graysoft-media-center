"""Browse and install GGUF models from HuggingFace."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable

import bootstrap  # noqa: F401

logger = logging.getLogger("graysoft.hf_catalog")

CATALOG_PATH = Path(__file__).resolve().parent / "model_catalog.json"

# Verified repos for Browse HF tab — synced from model catalog GGUF sources.
ALLOWLIST = [
    "QuantStack/Wan2.2-TI2V-5B-GGUF",
    "QuantStack/Wan2.2-T2V-A14B-GGUF",
    "QuantStack/Wan2.2-I2V-A14B-GGUF",
    "QuantStack/Wan2.2-S2V-14B-GGUF",
    "QuantStack/Wan2.2-VACE-Fun-A14B-GGUF",
    "QuantStack/Wan2.2-Animate-14B-GGUF",
    "city96/Wan2.1-T2V-14B-gguf",
    "city96/Wan2.1-I2V-14B-480P-gguf",
    "city96/Wan2.1-I2V-14B-720P-gguf",
    "city96/Wan2.1-FLF2V-14B-720P-gguf",
    "city96/Wan2.1-Fun-14B-InP-gguf",
    "city96/Wan2.1-Fun-14B-Control-gguf",
    "pollockjj/ltx-video-2b-v0.9.1-gguf",
    "city96/FLUX.1-schnell-gguf",
    "city96/FLUX.1-dev-gguf",
    "unsloth/FLUX.1-schnell-GGUF",
    "unsloth/FLUX.2-klein-4B-GGUF",
    "unsloth/FLUX.2-klein-9B-GGUF",
    "YarvixPA/FLUX.1-Fill-dev-GGUF",
    "HyperX-Sentience/SDXL-GGUF",
    "mzwing/SDXL-Lightning-GGUF",
    "OlegSkutte/sdxl-turbo-GGUF",
    "silveroxides/sdxl-gguf",
]

SCHEMA_HINTS: list[tuple[str, str, str]] = [
    ("wan2.2", "wan-2.2-5b", "video"),
    ("ti2v", "wan-2.2-5b", "video"),
    ("wan2.1", "wan-2.1", "video"),
    ("wan21", "wan-2.1", "video"),
    ("highnoise", "wan-2.2", "video"),
    ("lownoise", "wan-2.2", "video"),
    ("ltx-video", "ltx-video-2", "video"),
    ("ltx_video", "ltx-video-2", "video"),
    ("flux1-schnell", "flux-schnell", "image"),
    ("flux1-dev", "flux-dev", "image"),
    ("flux-2-klein", "flux-schnell", "image"),
    ("flux1-fill", "flux-dev", "image"),
    ("sdxl_base", "sdxl-base", "image"),
    ("sd_xl_base", "sdxl-base", "image"),
    ("sdxl_lightning", "sdxl-base", "image"),
    ("sd_xl_turbo", "z-image-turbo", "image"),
]


def _load_catalog_gguf_repos() -> list[str]:
    if not CATALOG_PATH.is_file():
        return []
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    repos: set[str] = set(ALLOWLIST)
    for entry in data.get("entries", []):
        if entry.get("downloadType") in ("gguf_bundle", "gguf_bundle_dual"):
            repo = entry.get("ggufRepo")
            if repo:
                repos.add(repo)
    return sorted(repos)


def _repo_allowed(repo_id: str) -> bool:
    return repo_id in _load_catalog_gguf_repos()


def search_gguf_repos(query: str, limit: int = 48) -> list[dict[str, Any]]:
    q = query.strip().lower()
    results: list[dict[str, Any]] = []
    for repo_id in _load_catalog_gguf_repos():
        if q and q not in repo_id.lower() and q not in repo_id.split("/")[-1].lower():
            continue
        results.append(
            {
                "id": repo_id,
                "name": repo_id.split("/")[-1],
                "tags": ["gguf", "verified"],
            }
        )
    return results[:limit]


def list_repo_gguf_files(repo_id: str) -> list[dict[str, Any]]:
    if not _repo_allowed(repo_id):
        raise RuntimeError(f"Repository not in verified list: {repo_id}")

    from huggingface_hub import list_repo_files
    from pipelines.hf_cache import extract_quant_tag

    files = list_repo_files(repo_id)
    out: list[dict[str, Any]] = []
    for filename in files:
        if not filename.lower().endswith(".gguf"):
            continue
        out.append(
            {
                "filename": filename,
                "quant": extract_quant_tag(filename),
            }
        )
    out.sort(key=lambda item: item["filename"])
    return out


def guess_schema(filename: str) -> tuple[str, str]:
    lowered = filename.lower()
    for needle, schema_id, media_type in SCHEMA_HINTS:
        if needle in lowered:
            return schema_id, media_type
    return "sdxl-base", "image"


ProgressFn = Callable[[str, float], None]


def install_hf_gguf(
    repo_id: str,
    filename: str,
    schema_id: str,
    name: str,
    models_dir: str,
    progress: ProgressFn | None = None,
) -> dict[str, Any]:
    if not _repo_allowed(repo_id):
        raise RuntimeError(f"Repository not in verified list: {repo_id}")

    from huggingface_hub import hf_hub_download

    folder = repo_id.replace("/", "-")
    root = Path(models_dir) / folder
    root.mkdir(parents=True, exist_ok=True)

    if progress:
        progress(f"Downloading {filename}…", 0.25)

    hf_hub_download(repo_id=repo_id, filename=filename, local_dir=str(root))
    path = root / Path(filename).name
    if not path.is_file():
        raise RuntimeError(f"Download failed: {filename}")

    schema_id, media_type = guess_schema(filename) if schema_id == "auto" else (schema_id, "video" if "wan" in schema_id or "ltx" in schema_id else "image")

    if progress:
        progress("Registering model…", 0.9)

    return {
        "path": str(path),
        "schema_id": schema_id,
        "name": name or path.stem,
        "media_type": media_type,
        "catalog_id": f"hf-{repo_id.replace('/', '-')}",
    }

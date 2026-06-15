"""Browse and install GGUF models from HuggingFace."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Callable

import bootstrap  # noqa: F401

logger = logging.getLogger("graysoft.hf_catalog")

# Verified repos only — broken/deleted repos removed.
ALLOWLIST = [
    "QuantStack/Wan2.2-TI2V-5B-GGUF",
    "city96/FLUX.1-schnell-gguf",
    "city96/FLUX.1-dev-gguf",
    "HyperX-Sentience/SDXL-GGUF",
]

SCHEMA_HINTS: list[tuple[str, str, str]] = [
    ("wan2.2", "wan-2.2-5b", "video"),
    ("wan2.1", "wan-2.1", "video"),
    ("flux1-schnell", "flux-schnell", "image"),
    ("flux1-dev", "flux-dev", "image"),
    ("sdxl_base", "sdxl-base", "image"),
    ("sd_xl_base", "sdxl-base", "image"),
    ("ltx", "ltx-video-2", "video"),
]


def _repo_allowed(repo_id: str) -> bool:
    return repo_id in ALLOWLIST


def search_gguf_repos(query: str, limit: int = 24) -> list[dict[str, Any]]:
    q = query.strip().lower()
    results: list[dict[str, Any]] = []
    for repo_id in ALLOWLIST:
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


def install_hf_gguf(
    repo_id: str,
    filename: str,
    schema_id: str,
    name: str,
    models_dir: str,
    progress: Callable[[str, float], None] | None = None,
) -> dict[str, Any]:
    if not _repo_allowed(repo_id):
        raise RuntimeError(f"Repository not in verified list: {repo_id}")

    from huggingface_hub import hf_hub_download

    folder = Path(models_dir) / "hf" / repo_id.replace("/", "-")
    folder.mkdir(parents=True, exist_ok=True)
    os.environ["GRAYSOFT_CACHE_DIR"] = str(folder / ".graysoft-cache")

    if progress:
        progress(f"Downloading {filename}…", 0.2)
    logger.info("Downloading %s/%s", repo_id, filename)
    hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        local_dir=str(folder),
    )
    if progress:
        progress("Download complete", 0.85)
    gguf_path = folder / Path(filename).name
    if not gguf_path.is_file():
        raise RuntimeError(f"Download failed: {filename}")

    resolved_schema, media_type = guess_schema(filename)
    if schema_id:
        resolved_schema = schema_id
    if resolved_schema.startswith("wan") or resolved_schema.startswith("ltx"):
        media_type = "video"
    elif resolved_schema.startswith("flux") or resolved_schema.startswith("sd"):
        media_type = "image"

    return {
        "path": str(gguf_path),
        "schema_id": resolved_schema,
        "name": name or gguf_path.stem,
        "media_type": media_type,
        "catalog_id": f"hf-{repo_id.replace('/', '-')}",
    }

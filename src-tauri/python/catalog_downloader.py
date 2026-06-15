"""One-click catalog model installs with all required files."""



from __future__ import annotations



import json

import logging

import os

from pathlib import Path

from typing import Any, Callable



import bootstrap  # noqa: F401 — ensure stdio



logger = logging.getLogger("graysoft.catalog")



ProgressFn = Callable[[str, float], None]



CATALOG_PATH = Path(__file__).resolve().parent / "model_catalog.json"





def load_catalog() -> list[dict[str, Any]]:

    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    return list(data.get("entries", []))





def get_catalog_entry(entry_id: str) -> dict[str, Any]:

    for entry in load_catalog():

        if entry["id"] == entry_id:

            return entry

    raise RuntimeError(f"Unknown catalog model: {entry_id}")





def _resolve_gguf_file(entry: dict[str, Any], quant_id: str | None) -> tuple[str, float, int]:

    variants = entry.get("quantVariants") or []

    if quant_id and variants:

        for variant in variants:

            if variant.get("id") == quant_id:

                return (

                    variant["ggufFile"],

                    float(variant.get("sizeGb", entry.get("sizeGb", 0))),

                    int(variant.get("vramGb", entry.get("vramGb", 8))),

                )

        raise RuntimeError(f"Unknown quant variant: {quant_id}")

    return (

        entry["ggufFile"],

        float(entry.get("sizeGb", 0)),

        int(entry.get("vramGb", 8)),

    )





def _emit(progress: ProgressFn | None, message: str, fraction: float) -> None:

    logger.info("%s (%.0f%%)", message, fraction * 100)

    if progress:

        progress(message, fraction)





def install_catalog_model(

    entry_id: str,

    models_dir: str,

    quant_id: str | None = None,

    progress: ProgressFn | None = None,

) -> dict[str, Any]:

    entry = get_catalog_entry(entry_id)

    folder_name = entry_id.replace("/", "-")

    root = Path(models_dir) / folder_name

    root.mkdir(parents=True, exist_ok=True)

    os.environ["GRAYSOFT_CACHE_DIR"] = str(root / ".graysoft-cache")

    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

    os.environ.setdefault("TQDM_DISABLE", "1")



    download_type = entry.get("downloadType", "diffusers")

    _emit(progress, f"Preparing {entry['name']}…", 0.05)



    if download_type == "gguf_bundle":

        gguf_file, _, _ = _resolve_gguf_file(entry, quant_id)

        install_entry = {**entry, "ggufFile": gguf_file}

        path = _install_gguf_bundle(install_entry, root, progress)

    elif download_type == "diffusers":

        path = _install_diffusers(entry, root, progress)

    else:

        raise RuntimeError(f"Unsupported download type: {download_type}")



    _emit(progress, f"{entry['name']} ready", 1.0)

    return {

        "path": str(path),

        "schema_id": entry["schemaId"],

        "name": entry["name"],

        "media_type": entry["mediaType"],

        "catalog_id": entry_id,

    }





def _install_gguf_bundle(

    entry: dict[str, Any],

    root: Path,

    progress: ProgressFn | None,

) -> Path:

    from huggingface_hub import hf_hub_download



    gguf_repo = entry["ggufRepo"]

    gguf_file = entry["ggufFile"]

    gguf_path = root / Path(gguf_file).name



    if not gguf_path.is_file() or gguf_path.stat().st_size == 0:

        _emit(progress, f"Downloading {gguf_file}…", 0.2)

        hf_hub_download(

            repo_id=gguf_repo,

            filename=gguf_file,

            local_dir=str(root),

        )



    if not gguf_path.is_file():

        raise RuntimeError(f"Download failed: {gguf_file}")



    components_repo = entry.get("componentsRepo")

    if components_repo:

        _emit(progress, "Downloading encoder and VAE (one time)…", 0.55)

        from pipelines.hf_cache import ensure_hf_repo



        ensure_hf_repo(components_repo)



    return gguf_path





def _install_diffusers(

    entry: dict[str, Any],

    root: Path,

    progress: ProgressFn | None,

) -> Path:

    from huggingface_hub import snapshot_download



    hf_repo = entry["hfRepo"]

    if (root / "model_index.json").exists():

        _emit(progress, "Model already on disk", 0.9)

        return root



    _emit(progress, f"Downloading {entry['name']}…", 0.25)

    snapshot_download(

        repo_id=hf_repo,

        local_dir=str(root),

        local_dir_use_symlinks=False,

    )



    if not (root / "model_index.json").exists() and not any(root.rglob("*.safetensors")):

        raise RuntimeError(f"Download failed for {hf_repo}")



    return root


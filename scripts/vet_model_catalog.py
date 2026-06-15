#!/usr/bin/env python3
"""Validate every model_catalog.json entry against Hugging Face."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from huggingface_hub import list_repo_files, model_info

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src-tauri" / "schemas" / "model_catalog.json"


def verify_entry(entry: dict) -> list[str]:
    errors: list[str] = []
    entry_id = entry.get("id", "?")
    download_type = entry.get("downloadType", "diffusers")

    try:
        if download_type in ("gguf_bundle", "gguf_bundle_dual"):
            repo = entry.get("ggufRepo")
            if not repo:
                errors.append(f"{entry_id}: missing ggufRepo")
                return errors
            model_info(repo)
            files = set(list_repo_files(repo))
            variants = entry.get("quantVariants") or [{"id": "default", **entry}]
            for variant in variants:
                if download_type == "gguf_bundle_dual":
                    for fname in variant.get("ggufFiles", entry.get("ggufFiles", [])):
                        if fname not in files:
                            errors.append(f"{entry_id}: missing {fname} in {repo}")
                else:
                    fname = variant.get("ggufFile", entry.get("ggufFile"))
                    if fname and fname not in files:
                        errors.append(f"{entry_id}: missing {fname} in {repo}")
            components = entry.get("componentsRepo")
            if components:
                model_info(components)
        elif download_type == "diffusers":
            repo = entry.get("hfRepo")
            if not repo:
                errors.append(f"{entry_id}: missing hfRepo")
                return errors
            model_info(repo)
        else:
            errors.append(f"{entry_id}: unknown downloadType {download_type}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{entry_id}: {exc}")
    return errors


def main() -> int:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    all_errors: list[str] = []
    video = sum(1 for e in entries if e.get("mediaType") == "video")
    image = sum(1 for e in entries if e.get("mediaType") == "image")
    print(f"Catalog: {len(entries)} entries ({video} video, {image} image)")
    for entry in entries:
        all_errors.extend(verify_entry(entry))
    if all_errors:
        print("FAILURES:")
        for err in all_errors:
            print(" ", err)
        return 1
    print("All entries verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

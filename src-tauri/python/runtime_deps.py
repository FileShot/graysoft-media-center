"""Runtime Python dependencies for diffusers / WAN inference."""

from __future__ import annotations

import importlib
import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger("graysoft.deps")

LOCK_FILE = Path(__file__).resolve().parent / "requirements-lock.txt"

# pip package name -> import module(s) to verify
RUNTIME_PACKAGES: dict[str, tuple[str, ...]] = {
    "torch": ("torch",),
    "diffusers": ("diffusers",),
    "transformers": ("transformers",),
    "accelerate": ("accelerate",),
    "huggingface_hub": ("huggingface_hub",),
    "safetensors": ("safetensors",),
    "imageio": ("imageio",),
    "imageio-ffmpeg": ("imageio_ffmpeg",),
    "gguf": ("gguf",),
    "numpy": ("numpy",),
    "sentencepiece": ("sentencepiece",),
    "protobuf": ("google.protobuf",),
    "ftfy": ("ftfy",),
    "regex": ("regex",),
    "Pillow": ("PIL",),
    "einops": ("einops",),
}


def pinned_requirements() -> list[str]:
    if not LOCK_FILE.is_file():
        return []
    lines: list[str] = []
    for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            lines.append(line)
    return lines


def site_packages_dir() -> Path:
    import os

    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "GraysoftMediaCenter" / "python-env" / "Lib" / "site-packages"
    return Path.home() / "GraysoftMediaCenter" / "python-env" / "Lib" / "site-packages"


def _importable(module: str) -> bool:
    try:
        importlib.import_module(module)
        return True
    except ImportError:
        return False


def missing_packages() -> list[str]:
    missing: list[str] = []
    for pip_name, modules in RUNTIME_PACKAGES.items():
        if pip_name == "torch":
            continue
        if not any(_importable(mod) for mod in modules):
            missing.append(pip_name)
    return missing


def check_runtime_packages() -> tuple[bool, list[str]]:
    missing = missing_packages()
    if not _importable("torch"):
        missing.insert(0, "torch")
    return (len(missing) == 0, missing)


def pip_install(packages: list[str], *, extra_args: list[str] | None = None) -> None:
    if not packages and not extra_args:
        return
    site_packages = site_packages_dir()
    site_packages.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, "-m", "pip", "install"]
    if extra_args:
        cmd.extend(extra_args)
    cmd.extend(packages)
    cmd.extend(["--target", str(site_packages)])
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        tail = (proc.stdout or "")[-4000:]
        raise RuntimeError(tail or f"pip install failed: {', '.join(packages)}")


def ensure_runtime_packages(*, auto_install: bool = True) -> None:
    ok, missing = check_runtime_packages()
    if ok:
        return
    if not auto_install:
        raise RuntimeError(f"Missing Python packages: {', '.join(missing)}")
    logger.info("Installing missing runtime packages: %s", ", ".join(missing))
    torch_missing = "torch" in missing
    rest = [p for p in missing if p != "torch"]
    if torch_missing:
        pip_install(
            [
                "torch",
                "torchvision",
                "--index-url",
                "https://download.pytorch.org/whl/cu124",
            ]
        )
    if rest:
        if "diffusers" in rest:
            pip_install(["git+https://github.com/huggingface/diffusers"])
            rest = [p for p in rest if p != "diffusers"]
        pinned = pinned_requirements()
        if pinned:
            pip_install(pinned)
            rest = [p for p in rest if p not in {r.split(">")[0].split("=")[0].split("<")[0].strip() for r in pinned}]
        if rest:
            pip_install(rest)
    still_missing = missing_packages()
    if not _importable("torch"):
        still_missing.insert(0, "torch")
    if still_missing:
        raise RuntimeError(f"Could not install: {', '.join(still_missing)}")

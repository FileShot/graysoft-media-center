"""CI smoke test — verify Python engine and registry load without GPU generation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src-tauri" / "python"
sys.path.insert(0, str(ROOT))


def main() -> int:
    registry_path = ROOT / "model_registry.json"
    if not registry_path.is_file():
        print("FAIL: model_registry.json missing", file=sys.stderr)
        return 1

    data = json.loads(registry_path.read_text(encoding="utf-8"))
    models = data.get("models", [])
    if not models:
        print("FAIL: registry has no models", file=sys.stderr)
        return 1

    from pipelines.registry_dispatch import load_registry, min_vram_gb

    reg = load_registry()
    assert len(reg) == len(models), "registry dispatch count mismatch"

    for entry in models:
        mid = entry["id"]
        assert mid in reg, f"missing registry entry: {mid}"
        assert min_vram_gb(mid) >= 0

    print(f"OK: {len(models)} models in registry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

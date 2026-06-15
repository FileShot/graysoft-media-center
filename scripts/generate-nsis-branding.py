"""Generate dark NSIS header/sidebar BMPs (MUI header titles render in white)."""

from __future__ import annotations

import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"

BG = (22, 22, 26)
GOLD = (212, 175, 55)
GOLD_DIM = (120, 98, 32)


def write_bmp(path: Path, width: int, height: int, pixel) -> None:
    row_size = ((width * 3 + 3) // 4) * 4
    pixel_data_size = row_size * height
    file_size = 54 + pixel_data_size
    with path.open("wb") as f:
        f.write(b"BM")
        f.write(struct.pack("<I", file_size))
        f.write(struct.pack("<HH", 0, 0))
        f.write(struct.pack("<I", 54))
        f.write(struct.pack("<I", 40))
        f.write(struct.pack("<i", width))
        f.write(struct.pack("<i", height))
        f.write(struct.pack("<HH", 1, 24))
        f.write(struct.pack("<I", 0))
        f.write(struct.pack("<I", pixel_data_size))
        f.write(b"\x00" * 28)
        for y in range(height - 1, -1, -1):
            row = bytearray()
            for x in range(width):
                r, g, b = pixel(x, y, width, height)
                row.extend([b, g, r])
            row.extend(b"\x00" * (row_size - len(row)))
            f.write(row)


def header_pixel(x: int, y: int, w: int, h: int) -> tuple[int, int, int]:
    if y >= h - 4:
        t = x / max(w - 1, 1)
        return (
            int(GOLD_DIM[0] + (GOLD[0] - GOLD_DIM[0]) * t),
            int(GOLD_DIM[1] + (GOLD[1] - GOLD_DIM[1]) * t),
            int(GOLD_DIM[2] + (GOLD[2] - GOLD_DIM[2]) * t),
        )
    if x < 6:
        return GOLD_DIM
    return BG


def sidebar_pixel(x: int, y: int, w: int, h: int) -> tuple[int, int, int]:
    if x < 8:
        return GOLD_DIM if y % 48 < 24 else GOLD
    if x < 12:
        return GOLD
    return BG


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_bmp(OUT / "nsis-header.bmp", 150, 57, header_pixel)
    write_bmp(OUT / "nsis-sidebar.bmp", 164, 314, sidebar_pixel)
    print(f"Wrote {OUT / 'nsis-header.bmp'}")
    print(f"Wrote {OUT / 'nsis-sidebar.bmp'}")


if __name__ == "__main__":
    main()

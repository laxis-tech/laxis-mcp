#!/usr/bin/env python3
"""Generate mcpb/icon.png (512x512) — placeholder Laxis mark.

Pure-stdlib PNG writer so CI and contributors need no image tooling: a dark
rounded square (#333333) with the Laxis gold (#F9B934) "L", supersampled and
box-downsampled for smooth edges. Replace with an official design export any
time — keep it a 512x512 PNG named icon.png (Claude Desktop's recommended size).
"""
import struct
import zlib
from pathlib import Path

SIZE = 512
SS = 2  # supersampling factor
BIG = SIZE * SS

DARK = (0x33, 0x33, 0x33)
GOLD = (0xF9, 0xB9, 0x34)

# Geometry is authored in 256-space and scaled to the render size.
SCALE = BIG // 256
RADIUS = 58 * SCALE

# "L" glyph as two overlapping bars, centered in 256-space.
VBAR = (84, 64, 124, 192)  # x0, y0, x1, y1
HBAR = (84, 152, 172, 192)


def inside_rounded_square(x, y):
    r = RADIUS
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x >= BIG - r and y < r:
        return (x - (BIG - r - 1)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y >= BIG - r:
        return (x - r) ** 2 + (y - (BIG - r - 1)) ** 2 <= r * r
    if x >= BIG - r and y >= BIG - r:
        return (x - (BIG - r - 1)) ** 2 + (y - (BIG - r - 1)) ** 2 <= r * r
    return True


def inside_bar(x, y, bar):
    x0, y0, x1, y1 = (v * SCALE for v in bar)
    return x0 <= x < x1 and y0 <= y < y1


def render():
    big = bytearray(BIG * BIG * 4)
    for y in range(BIG):
        row = y * BIG * 4
        for x in range(BIG):
            i = row + x * 4
            if not inside_rounded_square(x, y):
                continue  # transparent
            color = GOLD if (inside_bar(x, y, VBAR) or inside_bar(x, y, HBAR)) else DARK
            big[i : i + 3] = bytes(color)
            big[i + 3] = 255
    return big


def downsample(big):
    out = bytearray(SIZE * SIZE * 4)
    n = SS * SS
    for y in range(SIZE):
        for x in range(SIZE):
            acc = [0, 0, 0, 0]
            for dy in range(SS):
                src = ((y * SS + dy) * BIG + x * SS) * 4
                for dx in range(SS):
                    for c in range(4):
                        acc[c] += big[src + dx * 4 + c]
            i = (y * SIZE + x) * 4
            out[i : i + 4] = bytes(v // n for v in acc)
    return out


def write_png(path, pixels):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

    raw = b"".join(b"\x00" + bytes(pixels[y * SIZE * 4 : (y + 1) * SIZE * 4]) for y in range(SIZE))
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    Path(path).write_bytes(png)


if __name__ == "__main__":
    target = Path(__file__).resolve().parent.parent / "icon.png"
    write_png(target, downsample(render()))
    print(f"wrote {target}")

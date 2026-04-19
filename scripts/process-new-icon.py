#!/usr/bin/env python3
"""
Process icons/icon-new.png for macOS / Windows / Linux app icon usage.

Same pipeline as OpenGit (see that repo). Additionally syncs in-app assets:
  public/logo.png     ← icon-1024x1024.png
  public/logo-64.png  ← icon-64x64.png

Steps:
  1. Read icons/icon-new.png (ideally 1024x1024; other sizes are scaled).
  2. Zoom center graphic slightly, crop to inner tile, composite onto opaque white so
     flood-fill can run from corners, then flood-fill outer white/gray with a fixed
     bright blue (OpenGit #007acc family). Keeps your artwork colors (no blanket white).
  3. Center on 1024x1024 transparent canvas (100px margin).
  4. Apply Apple-style rounded-rect mask on the inner body.
  5. Generate icon-{size}x{size}.png for 16/32/48/64/128/256/512/1024.
  6. iconutil → icon.icns (macOS).
  7. icon.ico (Windows).
  8. Copy branding PNGs into public/ (OpenUltron UI / favicon).
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from collections import deque

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"
SRC = ICONS_DIR / "icon-new.png"

CANVAS = 1024
INNER = 824
OFFSET = (CANVAS - INNER) // 2
RADIUS = round(INNER * 0.2237)
SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

# Very light sky blue tile; is_strong_blue below is relaxed so pastel blues still “block” flood.
BRAND_BG_BLUE: tuple[int, int, int] = (182, 240, 255)
# Slightly overscale source before center-crop to INNER so the mark reads larger.
CONTENT_ZOOM = 1.22


def _opaque_on_white(inner: Image.Image) -> Image.Image:
    """Transparent edges break corner flood-fill (alpha < 128 is not fillable)."""
    base = Image.new("RGBA", inner.size, (255, 255, 255, 255))
    base.alpha_composite(inner)
    return base


def _inner_from_source_square(src: Image.Image, inner: int, zoom: float) -> Image.Image:
    """Square source → upscale by zoom, center-crop to inner×inner so logo is larger."""
    src = src.convert("RGBA")
    w, h = src.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(src, ((side - w) // 2, (side - h) // 2))
    scaled_side = max(int(round(side * zoom)), inner)
    scaled = sq.resize((scaled_side, scaled_side), Image.LANCZOS)
    left = (scaled.width - inner) // 2
    top = (scaled.height - inner) // 2
    return scaled.crop((left, top, left + inner, top + inner))


def _flood_fill_outer_white_with_blue(img: Image.Image, blue: tuple[int, int, int]) -> Image.Image:
    w, h = img.size
    px = img.load()

    def is_strong_blue(r: int, g: int, b: int) -> bool:
        # High-G “ice” blues still count as plate so flood does not eat the center.
        return b >= r + 20 and b >= g + 15 and b > 72

    def is_fillable(r: int, g: int, b: int, a: int) -> bool:
        if a < 128:
            return False
        if is_strong_blue(r, g, b):
            return False
        return max(r, g, b) > 165

    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        q.append((sx, sy))

    br, bg, bb = blue
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if not is_fillable(r, g, b, a):
            continue
        px[x, y] = (br, bg, bb, 255)
        if x > 0:
            q.append((x - 1, y))
        if x + 1 < w:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y + 1 < h:
            q.append((x, y + 1))
    return img


def build_master() -> Image.Image:
    """Return a 1024x1024 RGBA master with transparent corners."""
    src = Image.open(SRC).convert("RGBA")
    if src.size != (CANVAS, CANVAS):
        src = src.resize((CANVAS, CANVAS), Image.LANCZOS)

    inner = _inner_from_source_square(src, INNER, CONTENT_ZOOM)
    inner = _opaque_on_white(inner)
    blue = BRAND_BG_BLUE
    inner = _flood_fill_outer_white_with_blue(inner, blue)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(inner, (OFFSET, OFFSET))

    scale = 4
    big = Image.new("L", (CANVAS * scale, CANVAS * scale), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        [OFFSET * scale, OFFSET * scale,
         (OFFSET + INNER) * scale, (OFFSET + INNER) * scale],
        radius=RADIUS * scale,
        fill=255,
    )
    mask = big.resize((CANVAS, CANVAS), Image.LANCZOS)

    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    return out


def write_png_sizes(master: Image.Image) -> None:
    for size in SIZES:
        target = ICONS_DIR / f"icon-{size}x{size}.png"
        img = master.resize((size, size), Image.LANCZOS)
        img.save(target, "PNG", optimize=True)
        print(f"  wrote {target.relative_to(ROOT)}")


def build_icns(master: Image.Image) -> None:
    iconset = ICONS_DIR / "icon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()

    pairs = [
        (16,  "icon_16x16.png"),
        (32,  "icon_16x16@2x.png"),
        (32,  "icon_32x32.png"),
        (64,  "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
    for size, name in pairs:
        master.resize((size, size), Image.LANCZOS).save(iconset / name, "PNG")

    out_icns = ICONS_DIR / "icon.icns"
    if out_icns.exists():
        out_icns.unlink()
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(out_icns)],
        check=True,
    )
    shutil.rmtree(iconset)
    print(f"  wrote {out_icns.relative_to(ROOT)}")


def build_ico(master: Image.Image) -> None:
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    out_ico = ICONS_DIR / "icon.ico"
    master.save(out_ico, format="ICO", sizes=ico_sizes)
    print(f"  wrote {out_ico.relative_to(ROOT)}")


def sync_public_brand_pngs() -> None:
    """Match scripts/convert-logo-node.js outputs used by useLogoUrl / index.html."""
    public = ROOT / "public"
    public.mkdir(parents=True, exist_ok=True)
    hi = ICONS_DIR / "icon-1024x1024.png"
    lo = ICONS_DIR / "icon-64x64.png"
    if hi.exists():
        shutil.copyfile(hi, public / "logo.png")
        print(f"  wrote {public.relative_to(ROOT)}/logo.png")
    if lo.exists():
        shutil.copyfile(lo, public / "logo-64.png")
        print(f"  wrote {public.relative_to(ROOT)}/logo-64.png")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing source: {SRC}")

    print(f"== processing {SRC.relative_to(ROOT)} ==")
    print(
        f"   canvas={CANVAS}, body={INNER}, offset={OFFSET}, radius={RADIUS}, "
        f"zoom={CONTENT_ZOOM}, brand_blue={BRAND_BG_BLUE}"
    )

    master = build_master()

    print("-- writing PNG sizes --")
    write_png_sizes(master)

    print("-- building macOS icon.icns --")
    build_icns(master)

    print("-- building Windows icon.ico --")
    build_ico(master)

    print("-- syncing public/logo*.png --")
    sync_public_brand_pngs()

    print("done")


if __name__ == "__main__":
    main()

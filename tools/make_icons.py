#!/usr/bin/env python3
"""Generuje ikony PWA (wymaga Pillow)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
RED, DARK, BLUE, DEEP = (200, 16, 46), (143, 11, 32), (63, 169, 245), (26, 79, 122)


def icon(size, maskable=False, rounded=True):
    s = size * 4  # supersampling
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable or not rounded:
        d.rectangle([0, 0, s, s], fill=RED)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=RED)
    scale = 0.62 if maskable else 0.8
    c = s / 2
    # dolna "klapka" Pokédexu
    d.rectangle([0, int(s * 0.70), s, s], fill=DARK) if not maskable else None
    r = s * 0.34 * scale / 0.8
    cy = c - s * 0.04
    d.ellipse([c - r, cy - r, c + r, cy + r], fill=(255, 255, 255))
    r2 = r * 0.78
    d.ellipse([c - r2, cy - r2, c + r2, cy + r2], fill=DEEP)
    r3 = r2 * 0.86
    d.ellipse([c - r3, cy - r3, c + r3, cy + r3], fill=BLUE)
    r4 = r3 * 0.32
    hx, hy = c - r3 * 0.35, cy - r3 * 0.38
    d.ellipse([hx - r4, hy - r4, hx + r4, hy + r4], fill=(191, 230, 255))
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, "icon-192.png"))
icon(512).save(os.path.join(OUT, "icon-512.png"))
icon(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
icon(180, rounded=False).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
print("ok")

"""Convert generated section renders into optimised WebP assets.

Reads PNGs from "image generation/generated images" and writes
src/assets/sections/<name>.webp (resized, alpha kept). Components pick the
files up automatically by name; missing renders fall back to a placeholder.

Usage:  python scripts/convert-renders.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'image generation' / 'generated images'
OUT = ROOT / 'src' / 'assets' / 'sections'

# name -> max edge in px (about 2x the largest display size)
RENDERS = {
    'process-brief': 640, 'process-draft': 640, 'process-build': 640, 'process-launch': 640,
    'included-responsive': 360, 'included-seo': 360, 'included-analytics': 360,
    'included-deploy': 360, 'included-hosting': 360, 'included-cms': 360,
    'pricing-website': 480, 'pricing-commerce': 520,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in RENDERS.items():
        src = SRC / f'{name}.png'
        if not src.exists():
            print(f'  missing  {name}')
            continue
        im = Image.open(src).convert('RGBA')
        bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if bbox:  # trim empty margins so every render sits at the same visual scale
            pad = int(max(im.size) * 0.04)
            im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                          min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
        im.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new('RGBA', (max(im.size),) * 2, (0, 0, 0, 0))
        canvas.paste(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2))
        dest = OUT / f'{name}.webp'
        canvas.save(dest, quality=86, method=6)
        print(f'  wrote    {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()

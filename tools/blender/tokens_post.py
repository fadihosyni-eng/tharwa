# Post-process the token renders from tharwa_tokens.py (system Python + Pillow):
#   python tools/blender/tokens_post.py <raw_dir> [--write] [--sheet out.png]
# --write : 512 px renders -> public/tharwa/img/piece-<key>-256.png / -128.png (premultiplied-alpha resize, so no dark or
#           light fringe on the board), optimised PNG.
# --sheet : contact sheet on the board navy (256 / 128 / 40 / 28 px rows) plus a light strip to show the alpha is clean.
import os, sys
from PIL import Image, ImageChops, ImageFilter, ImageDraw

KEYS = ["car", "plane", "ship", "crown", "rocket", "diamond", "star", "hat"]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IMG = os.path.join(ROOT, "public", "tharwa", "img")


def premul_resize(im, size, sharpen=0):
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    pm = Image.merge("RGBA", (ImageChops.multiply(r, a), ImageChops.multiply(g, a), ImageChops.multiply(b, a), a))
    pm = pm.resize((size, size), Image.LANCZOS)
    if sharpen:
        pm = pm.filter(ImageFilter.UnsharpMask(radius=0.6, percent=sharpen, threshold=1))
    return _unpremul(pm)


def _unpremul(pm):
    px = pm.load()
    w, h = pm.size
    out = Image.new("RGBA", pm.size)
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                po[x, y] = (0, 0, 0, 0)
            else:
                po[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
    return out


def add_glow(im, color=(40, 175, 255), radius=9, strength=0.55):
    """Soft cyan glow hugging the silhouette (from the solid part of the alpha, not the soft shadow), drawn behind it."""
    a = im.getchannel("A")
    solid = a.point(lambda v: 255 if v > 215 else 0).filter(ImageFilter.MaxFilter(5))
    halo = solid.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: int(v * strength))
    glow = Image.new("RGBA", im.size, (*color, 0)); glow.putalpha(halo)
    glow.alpha_composite(im)
    return glow


def check_alpha(im, key):
    a = im.getchannel("A")
    w, h = im.size
    edge = max(max(a.getpixel((x, 0)), a.getpixel((x, h - 1))) for x in range(w))
    edge = max(edge, max(max(a.getpixel((0, y)), a.getpixel((w - 1, y))) for y in range(h)))
    bbox = a.point(lambda v: 255 if v > 8 else 0).getbbox()
    print(f"{key}: edge alpha max {edge}, opaque bbox {bbox}")


def sheet(raw, out):
    tiles = {k: add_glow(Image.open(os.path.join(raw, f"piece-{k}-512.png")).convert("RGBA")) for k in KEYS
             if os.path.exists(os.path.join(raw, f"piece-{k}-512.png"))}
    keys = [k for k in KEYS if k in tiles]
    W = 8 * 256 + 9 * 16
    H = 16 + 256 + 16 + 128 + 24 + 48 + 24 + 256 + 16
    bg = Image.new("RGBA", (W, H), (3, 8, 22, 255))
    d = ImageDraw.Draw(bg)
    for y in range(H):  # subtle board vignette
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(3 + 6 * (1 - t)), int(8 + 14 * (1 - t)), int(22 + 30 * (1 - t)), 255))
    for i, k in enumerate(keys):
        x = 16 + i * (256 + 16)
        big = premul_resize(tiles[k], 256)
        bg.alpha_composite(big, (x, 16))
        mid = premul_resize(tiles[k], 128, 60)
        bg.alpha_composite(mid, (x + 64, 16 + 256 + 16))
        y3 = 16 + 256 + 16 + 128 + 24
        for j, s in enumerate((40, 28)):
            sm = premul_resize(tiles[k], s, 80)
            bg.alpha_composite(sm, (x + 80 + j * 56, y3 + (48 - s)))
    # light strip: same tokens on a light grey, to prove there is no box/halo in the alpha
    y4 = 16 + 256 + 16 + 128 + 24 + 48 + 24
    d.rectangle([0, y4, W, y4 + 256], fill=(214, 222, 234, 255))
    for i, k in enumerate(keys):
        bg.alpha_composite(premul_resize(tiles[k], 256), (16 + i * (256 + 16), y4))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bg.convert("RGB").save(out, optimize=True)
    print("sheet", out)


def main():
    raw = sys.argv[1]
    if "--write" in sys.argv:
        total = 0
        for k in KEYS:
            src = os.path.join(raw, f"piece-{k}-512.png")
            im = add_glow(Image.open(src).convert("RGBA"))
            check_alpha(im, k)
            for s, sh in ((256, 25), (128, 60)):
                p = os.path.join(IMG, f"piece-{k}-{s}.png")
                premul_resize(im, s, sh).save(p, optimize=True)
                total += os.path.getsize(p)
        print("total KB", round(total / 1024, 1))
    if "--sheet" in sys.argv:
        sheet(raw, sys.argv[sys.argv.index("--sheet") + 1])


if __name__ == "__main__":
    main()

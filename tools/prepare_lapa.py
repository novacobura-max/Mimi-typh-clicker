"""Prepare transparent art for the second character (Lapa) + square avatars."""
import os
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.dirname(ROOT)
A = os.path.join(ROOT, "assets")
os.makedirs(A, exist_ok=True)


def cutout(path, out, target_h=None, erase=(), bg_tol=246, pad=8):
    im = Image.open(path).convert("RGB")
    for (x1, y1, x2, y2) in erase:
        for y in range(y1, y2):
            for x in range(x1, x2):
                im.putpixel((x, y), (255, 255, 255))

    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            if r >= bg_tol and g >= bg_tol and b >= bg_tol and max(r, g, b) - min(r, g, b) <= 10:
                bg[row + x] = 1

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if bg[i] and not seen[i]:
                seen[i] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if bg[i] and not seen[i]:
                seen[i] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                ni = ny * w + nx
                if bg[ni] and not seen[ni]:
                    seen[ni] = 1
                    q.append((nx, ny))

    alpha = Image.frombytes("L", (w, h), bytes(0 if v else 255 for v in seen))
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    alpha = alpha.point(lambda v: 255 if v >= 250 else v)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)

    d = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = d[x, y]
            if 0 < a < 255:
                f = a / 255.0
                d[x, y] = (
                    max(0, min(255, int((r - 255 * (1 - f)) / f))),
                    max(0, min(255, int((g - 255 * (1 - f)) / f))),
                    max(0, min(255, int((b - 255 * (1 - f)) / f))),
                    a,
                )

    bbox = rgba.getbbox()
    if bbox:
        l, t, rr, bb = bbox
        rgba = rgba.crop((max(0, l - pad), max(0, t - pad), min(w, rr + pad), min(h, bb + pad)))
    if target_h and rgba.height > target_h:
        ratio = target_h / rgba.height
        rgba = rgba.resize((round(rgba.width * ratio), target_h), Image.LANCZOS)
    rgba.save(out, "WEBP", quality=92, method=6)
    print(os.path.basename(out), rgba.size, round(os.path.getsize(out) / 1024, 1), "KB")
    return rgba


# hero: erase the "bruh" caption (original 735x949 coordinates)
hero = cutout(os.path.join(SRC, "Без названия (1).jpg"), os.path.join(A, "lapa-hero.webp"),
              target_h=1000, erase=[(35, 180, 175, 290)], bg_tol=230)

# shop tip art: erase the "He" caption (736x736)
chibi = cutout(os.path.join(SRC, "Без названия.jpg"), os.path.join(A, "lapa-chibi.webp"),
               target_h=460, erase=[(90, 120, 220, 230)])

# bust, then a square face avatar
bust = cutout(os.path.join(SRC, "Пес.jpg"), os.path.join(A, "lapa-bust.webp"), target_h=420)


def square_face(img, box, out, size=320):
    face = img.crop(box)
    side = max(face.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(face, ((side - face.width) // 2, (side - face.height) // 2))
    canvas = canvas.resize((size, size), Image.LANCZOS)
    canvas.save(out, "WEBP", quality=92, method=6)
    print(os.path.basename(out), canvas.size, round(os.path.getsize(out) / 1024, 1), "KB")
    return canvas


# coordinates are relative to the cropped bust image; find the head in the source and crop
face = square_face(bust, (5, 5, 235, 235), os.path.join(A, "lapa-face.webp"))

mimi_bust = Image.open(os.path.join(A, "mimi-bust.webp")).convert("RGBA")
mimi_face = square_face(mimi_bust, (78, 20, 268, 210), os.path.join(A, "mimi-face.webp"))

face.resize((128, 128), Image.LANCZOS).save(os.path.join(A, "lapa-favicon.png"), "PNG")
print("lapa-favicon.png ok")

# previews composited on dark background to inspect edges
for name in ("lapa-hero", "lapa-face", "lapa-chibi", "mimi-face"):
    img = Image.open(os.path.join(A, name + ".webp")).convert("RGBA")
    scale = 520 / max(img.size)
    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", (img.width + 40, img.height + 40), (24, 20, 20))
    canvas.paste(img, (20, 20), img)
    canvas.save(os.path.join(ROOT, "_grid", "check-" + name + ".png"))
print("previews written")

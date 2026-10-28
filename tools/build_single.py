"""Build a single self-contained HTML file from the source folder."""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Mimi_Clicker_standalone.html")

MIME = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2"}


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        payload = base64.b64encode(f.read()).decode("ascii")
    return f"data:{MIME[ext]};base64,{payload}"


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


fonts_css = read(os.path.join(ROOT, "fonts.css"))


def font_repl(match):
    name = match.group(1)
    return f"url('{data_uri(os.path.join(ROOT, 'fonts', name))}') format('woff2')"


fonts_css = re.sub(r"url\('fonts/([^']+)'\) format\('woff2'\)", font_repl, fonts_css)

style_css = read(os.path.join(ROOT, "style.css"))
game_js = read(os.path.join(ROOT, "game.js"))

html = read(os.path.join(ROOT, "index.html"))

html = html.replace('<link rel="preload" as="image" href="assets/mimi-hero.webp">\n', "")
html = re.sub(
    r'<link rel="icon"[^>]*>',
    f'<link rel="icon" id="favicon" href="{data_uri(os.path.join(ROOT, "assets", "favicon.png"))}" type="image/png">',
    html,
    count=1,
)
html = html.replace('<link rel="stylesheet" href="fonts.css">', "<style>\n" + fonts_css + "\n</style>")
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + style_css + "\n</style>")


def img_repl(match):
    return 'src="' + data_uri(os.path.join(ROOT, match.group(1))) + '"'


html = re.sub(r'src="(assets/[^"]+)"', img_repl, html)


# character art paths live in JS as string literals — inline them too
def js_asset_repl(match):
    quote, path = match.group(1), match.group(2)
    return quote + data_uri(os.path.join(ROOT, path)) + quote


game_js = re.sub(r"(['\"])(assets/[^'\"]+)\1", js_asset_repl, game_js)

html = html.replace(
    '<script src="game.js"></script>',
    "<script>\n" + game_js.replace("</script>", "<\\/script>") + "\n</script>",
)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"written: {OUT} ({os.path.getsize(OUT) / 1024 / 1024:.2f} MB)")

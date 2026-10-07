"""Inline the font and Ollie's picture into docs/spec-template.html → docs/ollie-island-spec.html (one offline file)."""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "game" / "assets" / "fonts"
TEMPLATE = ROOT / "docs" / "spec-template.html"
OUT = ROOT / "docs" / "ollie-island-spec.html"
OLLIE = Path(r"D:\code\word-island\game\assets\img\ollie-wave.webp")


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


css = (FONTS / "baloo2.css").read_text(encoding="utf-8")
css = re.sub(r"url\(([\w.-]+\.woff2)\)", lambda m: f"url(data:font/woff2;base64,{b64(FONTS / m.group(1))})", css)
html = TEMPLATE.read_text(encoding="utf-8")
html = html.replace("{{FONTS}}", css).replace("{{OLLIE}}", f"data:image/webp;base64,{b64(OLLIE)}")
assert "{{" not in html
OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

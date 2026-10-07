"""Android launcher icons for Ollie's Farm: the hen on grass green (legacy + adaptive foreground)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "game" / "assets" / "img" / "chicken.webp"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
GRASS = (121, 194, 90, 255)
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

hen = Image.open(SRC).convert("RGBA")
hen = hen.crop(hen.getchannel("A").getbbox())


def fit(img, box):
    s = box / max(img.size)
    return img.resize((round(img.width * s), round(img.height * s)), Image.Resampling.LANCZOS)


for name, k in DENSITIES.items():
    out = RES / f"mipmap-{name}"
    out.mkdir(parents=True, exist_ok=True)
    size = round(108 * k)
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = fit(hen, round(size * 0.58))
    fg.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    fg.save(out / "ic_launcher_foreground.png")
    size = round(48 * k)
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(icon).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.22), fill=GRASS)
    art = fit(hen, round(size * 0.8))
    icon.paste(art, ((size - art.width) // 2, size - art.height - round(size * 0.06)), art)
    icon.save(out / "ic_launcher.png")
print("icons written")

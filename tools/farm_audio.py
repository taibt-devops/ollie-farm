"""Pre-render Ollie's Farm voice clips with OpenAI TTS (offline play). Missing clips only unless --force."""
from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parent.parent / "game" / "assets" / "audio"
STUDIO_ENV = Path(r"D:\code\game-asset-studio\.env")
INSTRUCTIONS = ("You are a warm, cheerful English teacher for young children. Speak in clear standard American "
                "English, slowly and naturally, with friendly intonation.")
NUMBERS = ["one", "two", "three", "four", "five"]
COUNTABLE = {"carrot": "carrots", "tomato": "tomatoes", "egg": "eggs"}

CLIPS = {
    "corn": "corn", "carrot": "carrot", "tomato": "tomato", "egg": "egg", "chicken": "chicken",
    "and": "and", "please": "please!",
    "welcome": "Welcome to Ollie's farm! Let's plant some seeds!",
    "thanks": "Thank you!",
    "level-up": "Level up! Great job!",
    "hungry": "The chicken is hungry!",
    "yum": "Yum yum!",
    "cluck": "Cluck, cluck!",
    "new-egg": "An egg!",
    "unlock-tomato": "Now you can grow tomatoes!",
}
for item, plural in COUNTABLE.items():
    for n, word in enumerate(NUMBERS, 1):
        CLIPS[f"{n}-{item}"] = f"{word} {item if n == 1 else plural}"


def api_key() -> str:
    key = os.getenv("OPENAI_API_KEY")
    if not key and STUDIO_ENV.exists():
        for line in STUDIO_ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENAI_API_KEY="):
                key = line.split("=", 1)[1].strip()
    return key or sys.exit("no OPENAI_API_KEY")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    todo = {k: v for k, v in CLIPS.items() if args.force or not (OUT / f"{k}.mp3").exists()}
    if not todo:
        print("all clips present")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(base_url="https://api.openai.com/v1", timeout=60, headers={"Authorization": f"Bearer {api_key()}"})

    def one(item):
        name, text = item
        r = client.post("/audio/speech", json={"model": "gpt-4o-mini-tts", "voice": "coral", "input": text,
                                               "instructions": INSTRUCTIONS, "response_format": "mp3"})
        r.raise_for_status()
        (OUT / f"{name}.mp3").write_bytes(r.content)

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(one, todo.items()))
    print(f"rendered {len(todo)} clips")


if __name__ == "__main__":
    main()

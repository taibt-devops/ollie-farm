"""Generate Ollie's Farm art through Game Asset Studio (http://127.0.0.1:8765) and export it to game/.

    python tools/farm_assets.py gen [--redo a,b]   # new art; "edit" entries are made from their base image
    python tools/farm_assets.py sheet              # build/sheet.png for review
    python tools/farm_assets.py export             # game/assets/img/*.webp + game/data.js
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CONTENT = json.loads((ROOT / "content" / "farm.json").read_text(encoding="utf-8"))
MAP = ROOT / "tools" / "asset_map.json"
GAME = ROOT / "game"
MAX_SPEND = 6.0
client = httpx.Client(base_url="http://127.0.0.1:8765", timeout=60)


def api(method, path, **kw):
    r = client.request(method, path, **kw)
    if r.status_code >= 400:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text}")
    return r.json() if "json" in r.headers.get("content-type", "") else r


def load_map() -> dict:
    return json.loads(MAP.read_text(encoding="utf-8")) if MAP.exists() else {}


def save_map(m: dict) -> None:
    MAP.write_text(json.dumps(m, indent=2), encoding="utf-8")


def wait(jobs: dict[str, str]) -> dict[str, dict]:
    done, t0 = {}, time.time()
    while len(done) < len(jobs):
        time.sleep(3)
        for jid, label in jobs.items():
            if jid not in done:
                j = api("GET", f"/api/jobs/{jid}")
                if j["status"] in ("done", "error"):
                    done[jid] = j
                    print(f"  [{len(done)}/{len(jobs)}] {'ok ' if j['status'] == 'done' else 'ERR'} {label} "
                          f"({time.time() - t0:.0f}s) {j['error'] or ''}")
    return done


def budget(n: int) -> None:
    spent = api("GET", "/api/meta")["total_cost"]
    print(f"studio spent so far ${spent:.3f}; {n} new images planned")
    if spent + n * 0.04 > MAX_SPEND:
        sys.exit("would go over budget")


def finish(m: dict, key: str, job: dict) -> None:
    if job["status"] != "done":
        return
    aid = job["result"]["asset_ids"][0]
    spec = CONTENT["assets"][key]
    if spec.get("size"):   # tiles: re-process to the wanted size (free, no API call)
        a = api("GET", f"/api/assets/{aid}")
        api("POST", f"/api/assets/{aid}/reprocess", json={"recipe": {**a["recipe"], "target_size": spec["size"]}})
    api("PATCH", f"/api/assets/{aid}", json={"status": "approved", "name": f"farm {key}"})
    m[key] = aid


def cmd_gen(args) -> None:
    m = load_map()
    redo = set(filter(None, args.redo.split(",")))
    style = next(s for s in api("GET", "/api/styles") if s["name"] == CONTENT["style"])
    specs = CONTENT["assets"]
    base = [k for k, s in specs.items() if "edit" not in s and (k not in m or k in redo)]
    if base:
        budget(len(base))
        jobs = {api("POST", "/api/generate", json={
            "kind": specs[k]["kind"], "description": specs[k]["prompt"], "style_id": style["id"],
            "quality": args.quality, "n": 1, "name": f"farm {k}"})["id"]: k for k in base}
        for jid, job in wait(jobs).items():
            finish(m, jobs[jid], job)
        save_map(m)
    edits = [k for k, s in specs.items() if "edit" in s and s["edit"] in m
             and (k not in m or k in redo or s["edit"] in base)]
    if edits:
        budget(len(edits))
        jobs = {api("POST", f"/api/assets/{m[specs[k]['edit']]}/edit", json={
            "instruction": specs[k]["prompt"], "quality": args.quality, "n": 1})["id"]: k for k in edits}
        for jid, job in wait(jobs).items():
            finish(m, jobs[jid], job)
        save_map(m)
    print("missing:", [k for k in specs if k not in m] or "none")


def png(aid: int) -> Image.Image:
    a = api("GET", f"/api/assets/{aid}")
    return Image.open(io.BytesIO(client.get(a["url"]).content)).convert("RGBA")


def all_ids(m: dict) -> dict[str, int]:
    ids = {**{k: v for k, v in CONTENT["reuse"].items() if not k.startswith("_")}, **m}
    anims = {a["name"]: a for a in api("GET", "/api/animations")}
    for move, name in CONTENT["chicken_animations"].items():
        for f in anims[name]["frames"]:
            ids[f"chicken-{move}-{f['frame_index']}"] = f["id"]
    return ids


def cmd_sheet(args) -> None:
    ids = all_ids(load_map())
    cell, cols = 180, 8
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new("RGB", (cell * cols, (cell + 24) * rows), (236, 244, 230))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=15)
    for i, (k, aid) in enumerate(ids.items()):
        img = png(aid)
        img.thumbnail((cell - 12, cell - 12))
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        sheet.paste(img, (x + (cell - img.width) // 2, y + 4), img)
        d.text((x + 6, y + cell + 2), k, fill=(20, 60, 70), font=font)
    (ROOT / "build").mkdir(exist_ok=True)
    sheet.save(ROOT / "build" / "sheet.png")
    print("wrote build/sheet.png")


def cmd_export(args) -> None:
    ids = all_ids(load_map())
    out = GAME / "assets" / "img"
    out.mkdir(parents=True, exist_ok=True)
    sizes = {"grass": 256, "soil": 256}
    for k, aid in ids.items():
        img = png(aid)
        side = sizes.get(k) or (256 if k.startswith(("chicken", "item", "coin")) else 384)
        img.thumbnail((side, side), Image.Resampling.LANCZOS)
        if k in sizes:
            img = img.convert("RGB")
        img.save(out / f"{k}.webp", "WEBP", quality=88, method=4)
    audio = GAME / "assets" / "audio"
    data = {
        "img": {k: f"assets/img/{k}.webp" for k in ids},
        "chicken": {move: [f"assets/img/chicken-{move}-{i}.webp" for i in range(4)] for move in CONTENT["chicken_animations"]},
        "audio": {p.stem: f"assets/audio/{p.name}" for p in sorted(audio.glob("*.mp3"))},
    }
    (GAME / "data.js").write_text("// Generated by tools/farm_assets.py export.\nwindow.OLLIE_FARM = "
                                  + json.dumps(data, indent=1) + ";\n", encoding="utf-8")
    print(f"exported {len(ids)} images, {len(data['audio'])} audio clips")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen")
    g.add_argument("--redo", default="")
    g.add_argument("--quality", default="medium")
    g.set_defaults(fn=cmd_gen)
    sub.add_parser("sheet").set_defaults(fn=cmd_sheet)
    sub.add_parser("export").set_defaults(fn=cmd_export)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()

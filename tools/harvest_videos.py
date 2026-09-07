"""Harvest the Immerse library from YouTube: listings, metadata and auto-captions.

The channels are curated in data/curated/channels.json. For each, the channel's
video listing is fetched, the newest `max` videos within the duration bounds are
taken, and for each of those two things are cached under data/raw/:

  youtube/meta/<id>.json   full yt-dlp metadata (title, tags, description, chapters…)
  subs/<id>.ru-orig.json3  the Russian auto-captions with per-word offsets

Everything is cached and the tool is re-runnable: a video already on disk costs no
request. YouTube rate-limits, so requests are paused and a failure is counted, not
retried in a loop. The result is data/raw/youtube/catalogue.json — every harvested
video with the metadata the build needs — which build_transcripts.py and
build_videos.py read. Nothing here decides what the app shows; that is the build's.

    python tools/harvest_videos.py              # everything missing
    python tools/harvest_videos.py --no-fetch   # rebuild the catalogue from the cache
    python tools/harvest_videos.py --channel BoostYourRussian
"""

import argparse
import html
import json
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
YT = RAW / "youtube"
META = YT / "meta"
SUBS = RAW / "subs"
CHANNELS = ROOT / "data" / "curated" / "channels.json"
LEGACY_LIST = YT / "easyrussian.tsv"   # the hand-curated Easy Russian listing, kept in

# Channel business rather than teaching material.
SKIP_RE = re.compile(r"\b(trailer|announcement|q&a|behind the scenes|patreon|"
                     r"livestream|live stream|shorts?|giveaway)\b", re.I)


def ytdlp(args, timeout):
    """Run yt-dlp as a module, returning stdout text or None on any failure."""
    cmd = [sys.executable, "-m", "yt_dlp", "--no-warnings", "--quiet"] + args
    try:
        r = subprocess.run(cmd, check=False, timeout=timeout, capture_output=True)
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8-sig", errors="replace")


def listing(handle, pause):
    """The channel's videos, newest first: [{id, title, dur}]. Cached per run day."""
    cache = YT / f"list_{handle}.json"
    text = None
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        text = cache.read_text(encoding="utf-8")
    else:
        text = ytdlp(["--flat-playlist", "-J", f"https://www.youtube.com/@{handle}/videos"], 180)
        if text:
            cache.write_text(text, encoding="utf-8")
            time.sleep(pause)
    if not text:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    out = []
    for e in data.get("entries") or []:
        if not e or not e.get("id"):
            continue
        out.append({"id": e["id"], "title": html.unescape(e.get("title") or ""),
                    "dur": int(e["duration"]) if e.get("duration") else None})
    return {"name": data.get("channel") or handle, "url": data.get("channel_url") or "",
            "videos": out}


def metadata(video_id, pause):
    out = META / f"{video_id}.json"
    if out.exists() and out.stat().st_size > 200:
        return "cached"
    text = ytdlp(["--skip-download", "--dump-json", f"https://www.youtube.com/watch?v={video_id}"], 120)
    time.sleep(pause)
    if not text:
        return "failed"
    out.write_text(text, encoding="utf-8")
    return "fetched"


def captions(video_id, pause):
    out = SUBS / f"{video_id}.ru-orig.json3"
    if out.exists() and out.stat().st_size > 500:
        return "cached"
    ytdlp(["--skip-download", "--write-auto-subs", "--sub-langs", "ru-orig",
           "--sub-format", "json3", "-o", str(SUBS / "%(id)s"),
           f"https://www.youtube.com/watch?v={video_id}"], 120)
    time.sleep(pause)
    return "fetched" if out.exists() and out.stat().st_size > 500 else "none"


def trimmed(meta):
    """The metadata the build reads, and nothing the app will not use."""
    desc = (meta.get("description") or "")
    # Descriptions front-load the episode and end with links and boilerplate.
    desc = re.split(r"\n\s*-{3,}|\n\s*={3,}|https?://", desc)[0].strip()
    return {
        "tags": [t for t in (meta.get("tags") or []) if isinstance(t, str)][:40],
        "desc": desc[:600],
        "upload": meta.get("upload_date"),
        "views": meta.get("view_count"),
        "lang": meta.get("language"),
        "chapters": [{"t": int(c.get("start_time") or 0), "title": c.get("title") or ""}
                     for c in (meta.get("chapters") or [])][:40],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true", help="only rebuild the catalogue")
    ap.add_argument("--channel", help="only this handle")
    ap.add_argument("--pause", type=float, default=1.0)
    ap.add_argument("--out", type=Path, default=YT / "catalogue.json")
    args = ap.parse_args()

    META.mkdir(parents=True, exist_ok=True)
    SUBS.mkdir(parents=True, exist_ok=True)
    channels = json.loads(CHANNELS.read_text(encoding="utf-8"))["channels"]
    if args.channel:
        channels = [c for c in channels if c["handle"] == args.channel]

    # The Easy Russian TSV predates this tool; its ids stay in even if the listing
    # fetch fails, so the unit videos never depend on today's network.
    legacy = {}
    if LEGACY_LIST.exists():
        for line in LEGACY_LIST.read_text(encoding="utf-8").splitlines():
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2 and p[0].strip():
                legacy[p[0].strip()] = {"id": p[0].strip(), "title": html.unescape(p[1].strip()),
                                        "dur": int(p[2]) if len(p) > 2 and p[2].isdigit() else None}

    catalogue = {"channels": [], "videos": []}
    tally = Counter()
    for ch in channels:
        lst = None if args.no_fetch else listing(ch["handle"], args.pause)
        if lst is None:
            cache = YT / f"list_{ch['handle']}.json"
            if cache.exists():
                data = json.loads(cache.read_text(encoding="utf-8"))
                lst = {"name": data.get("channel") or ch["name"], "url": data.get("channel_url") or "",
                       "videos": [{"id": e["id"], "title": html.unescape(e.get("title") or ""),
                                   "dur": int(e["duration"]) if e.get("duration") else None}
                                  for e in (data.get("entries") or []) if e and e.get("id")]}
        vids = list(lst["videos"]) if lst else []
        if ch["handle"] == "EasyRussianVideos":
            have = {v["id"] for v in vids}
            vids += [v for v in legacy.values() if v["id"] not in have]
        picked = []
        for v in vids:
            if SKIP_RE.search(v["title"]):
                continue
            if v["dur"] is not None and not (ch["min_sec"] <= v["dur"] <= ch["max_sec"]):
                continue
            picked.append(v)
            if len(picked) >= ch["max"]:
                break
        # The curated name, not the listing's: a channel may style itself
        # "Russian Progress - videos w/ subs to learn Russian" on YouTube.
        name = ch["name"]
        catalogue["channels"].append({"handle": ch["handle"], "name": name,
                                      "url": (lst or {}).get("url") or f"https://www.youtube.com/@{ch['handle']}"})
        print(f"{name}: {len(vids)} listed, {len(picked)} taken")
        for n, v in enumerate(picked, 1):
            if not args.no_fetch:
                tally["meta " + metadata(v["id"], args.pause)] += 1
                tally["subs " + captions(v["id"], args.pause)] += 1
                if n % 20 == 0:
                    print(f"  {n}/{len(picked)} … {dict(tally)}")
            row = {"id": v["id"], "title": v["title"], "dur": v["dur"],
                   "channel": name, "handle": ch["handle"]}
            mp = META / f"{v['id']}.json"
            if mp.exists():
                try:
                    meta = json.loads(mp.read_text(encoding="utf-8-sig"))
                    row.update(trimmed(meta))
                    if not row["dur"] and meta.get("duration"):
                        row["dur"] = int(meta["duration"])
                    if meta.get("title"):
                        row["title"] = html.unescape(meta["title"])
                except ValueError:
                    pass
            row["subs"] = (SUBS / f"{v['id']}.ru-orig.json3").exists()
            catalogue["videos"].append(row)

    args.out.write_text(json.dumps(catalogue, ensure_ascii=False, indent=1), encoding="utf-8")
    with_subs = sum(1 for v in catalogue["videos"] if v["subs"])
    with_meta = sum(1 for v in catalogue["videos"] if "tags" in v)
    print(f"\nwrote {args.out}")
    print(f"  channels : {len(catalogue['channels'])}")
    print(f"  videos   : {len(catalogue['videos'])}  with captions {with_subs}, with metadata {with_meta}")
    if tally:
        print(f"  requests : {dict(tally)}")


if __name__ == "__main__":
    main()

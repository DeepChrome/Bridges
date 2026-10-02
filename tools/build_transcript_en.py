#!/usr/bin/env python3
"""English for every line of every video transcript (the owner, 2026-10-01:
*"the option to have English in line with the transcription too (also
highlighted as it goes)"*).

The transcripts are YouTube's automatic captions, cut into lines at the
speaker's pauses by build_site.py `video_transcripts`: no punctuation, no
capitals, a line often half a sentence. A line translated on its own is a
guess, so lines go to a model (Claude Haiku) in runs of RUN with the CONTEXT
lines before them shown and not translated, and it returns one English line
per Russian line — a fragment for a fragment, so the English can sit under the
Russian and be highlighted with it.

What keeps it honest is the check: every numbered line must come back, none
twice, none empty, and no English may carry Cyrillic. A run that fails is
asked once more and otherwise left untranslated; nothing is filled in. The app
labels the English as machine-made.

The answers cost money and are kept in data/transcript_en.json (committed),
keyed per line by a hash of video, start and text: a re-run pays only for
lines that are new or changed.

    python tools/build_transcript_en.py            # needs ANTHROPIC_API_KEY
    python tools/build_transcript_en.py --dry-run  # what would be asked, no calls
    python tools/build_transcript_en.py --limit 3  # the first three videos only
"""

import argparse
import hashlib
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "native" / "assets" / "transcripts.json"
OUT = ROOT / "data" / "transcript_en.json"
MODEL = "claude-haiku-4-5-20251001"
RUN = 40              # lines translated per request
CONTEXT = 6           # lines before a run, shown for sense, not translated
WORKERS = 8
PRICE_IN, PRICE_OUT = 1.0, 5.0      # $ per million tokens, Haiku 4.5
CYRILLIC = re.compile(r"[а-яёА-ЯЁ]")

SYSTEM = (
    "You translate the automatic captions of Russian YouTube videos for English-speaking "
    "learners of Russian. The captions have no punctuation or capitals, and each line is "
    "where the speaker paused, so a line is often part of a sentence.\n\n"
    "Translate each numbered line into natural English so that, read in order, the lines "
    "read as a faithful translation of the speech. Keep each line's English to that line's "
    "words: a fragment for a fragment, never pulling words from the next line. Use the "
    "context lines (marked ctx) only to understand; do not translate them. Write names in "
    "English letters. Never write Cyrillic. Fix nothing in the Russian and add nothing that "
    "was not said.\n\n"
    "Reply with only a JSON array: [{\"n\": line number, \"en\": \"English\"}, …], one entry "
    "for every numbered line.")


def key_of(vid, line):
    return hashlib.sha1(f"{vid}|{line[0]}|{line[1]}".encode("utf-8")).hexdigest()[:16]


def ask(api_key, context, run):
    rows = [f"ctx: {ln[1]}" for ln in context]
    rows += [f"{n + 1}: {ln[1]}" for n, ln in enumerate(run)]
    body = json.dumps({"model": MODEL, "max_tokens": 4000, "system": SYSTEM,
                       "messages": [{"role": "user", "content": "\n".join(rows)}]}).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                reply = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            # A dropped or timed-out connection is the network, not the request:
            # wait and ask again. It ended a 2,000-request run once (2026-10-01).
            if attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            raise
    text = "".join(c.get("text", "") for c in reply.get("content", []))
    a, b = text.find("["), text.rfind("]")
    try:
        items = json.loads(text[a:b + 1]) if a >= 0 else []
    except ValueError:
        items = []
    return items, reply.get("usage", {})


def checked(items, size):
    """{index: english} when every line came back once, non-empty, in English; else None."""
    got = {}
    for x in items if isinstance(items, list) else ():
        if not isinstance(x, dict):
            return None
        n, en = x.get("n"), (x.get("en") or "").strip()
        if not isinstance(n, int) or not 1 <= n <= size or n in got or not en or CYRILLIC.search(en):
            return None
        got[n] = en
    return got if len(got) == size else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only the first N videos")
    args = ap.parse_args()

    transcripts = json.loads(SRC.read_text(encoding="utf-8"))
    store = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    lines_en = store.get("lines", {})
    vids = sorted(transcripts)
    if args.limit:
        vids = vids[:args.limit]

    jobs = []
    for vid in vids:
        lines = transcripts[vid]
        k = 0
        while k < len(lines):
            if key_of(vid, lines[k]) in lines_en:
                k += 1
                continue
            run_start = k
            while k < len(lines) and k - run_start < RUN and key_of(vid, lines[k]) not in lines_en:
                k += 1
            jobs.append((vid, lines[max(0, run_start - CONTEXT):run_start], lines[run_start:k]))
    pending = sum(len(j[2]) for j in jobs)
    chars = sum(len(ln[1]) for j in jobs for ln in j[2])
    print(f"{len(vids)} videos, {sum(len(transcripts[v]) for v in vids):,} lines; "
          f"{pending:,} to translate in {len(jobs):,} requests ({chars:,} characters)")
    if args.dry_run or not jobs:
        print("(dry run — nothing asked)" if args.dry_run else "nothing to do")
        return
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("ANTHROPIC_API_KEY is not set")

    lock = threading.Lock()
    totals = {"in": 0, "out": 0, "done": 0, "failed": 0, "calls": 0}
    why = Counter()             # what each failed attempt was, so a run can say
    fatal = threading.Event()   # an error no retry fixes: stop asking

    def work(job):
        vid, context, run = job
        for _try in range(2):
            if fatal.is_set():
                return vid, run, None
            try:
                items, usage = ask(api_key, context, run)
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:160]
                with lock:
                    why[f"HTTP {e.code}: {detail}"] += 1
                # A bad key, a spent balance, a malformed request: the next
                # thousand requests would fail the same way.
                if e.code in (400, 401, 403, 404):
                    fatal.set()
                continue
            except Exception as e:             # one run left untranslated, not the whole job lost
                with lock:
                    why[type(e).__name__] += 1
                continue
            with lock:
                totals["calls"] += 1
                totals["in"] += usage.get("input_tokens", 0)
                totals["out"] += usage.get("output_tokens", 0)
            got = checked(items, len(run))
            if got:
                return vid, run, got
            with lock:
                why["reply did not give every line back once, in English"] += 1
        return vid, run, None

    def save():
        OUT.write_text(json.dumps({"model": MODEL, "note": "English for the video transcripts, "
                                   "machine-translated (tools/build_transcript_en.py); keyed by "
                                   "sha1(video|start|text)[:16].", "lines": lines_en},
                                  ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(work, j) for j in jobs]
        for n, f in enumerate(as_completed(futures), 1):
            vid, run, got = f.result()
            with lock:
                if got:
                    for i, ln in enumerate(run):
                        lines_en[key_of(vid, ln)] = got[i + 1]
                    totals["done"] += len(run)
                else:
                    totals["failed"] += len(run)
            if n % 50 == 0:
                save()
                cost = totals["in"] / 1e6 * PRICE_IN + totals["out"] / 1e6 * PRICE_OUT
                print(f"  {n:,} of {len(jobs):,} requests, {totals['done']:,} lines, ${cost:.2f}", flush=True)
    save()
    cost = totals["in"] / 1e6 * PRICE_IN + totals["out"] / 1e6 * PRICE_OUT
    print(f"translated {totals['done']:,} lines, {totals['failed']:,} left untranslated after a retry; "
          f"{totals['calls']:,} calls, {totals['in']:,} in / {totals['out']:,} out tokens, about ${cost:.2f}")
    print(f"wrote {OUT} ({len(lines_en):,} lines held)")
    for reason, n in why.most_common():
        print(f"  {n:,} attempts failed: {reason}")
    if fatal.is_set():
        sys.exit("stopped early: the API refused in a way retrying will not fix (above)")


if __name__ == "__main__":
    main()

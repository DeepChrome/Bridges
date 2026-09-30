#!/usr/bin/env python3
"""Sentences from the goal videos themselves (ROADMAP Phase 14, the owner's
follow-up of 2026-09-29: *"I think we can still tune up the lesson plans a bit
better to be more video centric. More sentences/phrases… for those sentences,
we should only use the ones in the video"*).

The captions are YouTube's automatic ones: no punctuation, no capitals, no
English, and nothing marks where a sentence ends. Cutting them at pauses was
tried first and lost half — a pause falls mid-thought as often as between
thoughts, and chapter 1's spine kept one line. So each goal video's transcript
goes to a model (Claude Haiku) in overlapping chunks, and it returns the
**complete sentences** it finds there, punctuated, with an English
translation.

What keeps that honest is the check, not the prompt: every sentence returned
must be an **exact, contiguous run of the words that were said**, compared
token for token after folding. A sentence that adds, drops, changes or
reorders a single word is thrown away. So what reaches the app is the
speaker's own words; only the punctuation, the capitals and the English are
the model's.

Then, per unit, the sentences that carry its words, mostly readable by the
unit's end, spread across its words — up to LINES_PER_UNIT.

The model's answers cost money and are kept in data/video_lines.json
(committed), keyed by a hash of each chunk; a re-run pays only for new chunks.

    python tools/build_video_lines.py            # needs ANTHROPIC_API_KEY
    python tools/build_video_lines.py --dry-run  # what would be asked, no calls
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import fold  # noqa: E402
from build_transcripts import words_with_times, SUBS  # noqa: E402
from build_skeleton import spoken_ranks  # noqa: E402

OUT = ROOT / "data" / "video_lines.json"
MODEL = "claude-haiku-4-5-20251001"
CHUNK = 120             # words a request carries; chunks overlap so a sentence on a cut survives in one
OVERLAP = 20
MIN_WORDS, MAX_WORDS = 3, 15
LINES_PER_UNIT = 16
READABLE = 0.6          # share of a line's words known by the unit's end, at least
FREE_RANK = 150         # the commonest spoken words, known in practice from the start
WORD = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")


def chunks(stream):
    step = CHUNK - OVERLAP
    for s in range(0, max(1, len(stream) - OVERLAP), step):
        yield s, stream[s:s + CHUNK]


def ask(words, key):
    text = " ".join(words)
    prompt = (
        "Below is part of an automatic transcript of a Russian YouTube video: no punctuation, "
        "no capitals, and it may start or end mid-sentence.\n\n"
        "Find the complete sentences in it that a learner could understand on their own, "
        f"{MIN_WORDS} to {MAX_WORDS} words long. For each, give:\n"
        "- ru: the sentence exactly as its words appear in the transcript — the same words in "
        "the same order, contiguous, none added, dropped, changed or corrected — with only "
        "punctuation and capital letters added.\n"
        "- en: a natural English translation.\n"
        "Skip anything cut off at the start or end of the text, and anything that only makes "
        "sense with what comes before it.\n"
        "Reply with only a JSON array of {\"ru\": string, \"en\": string}.\n\n" + text)
    body = json.dumps({"model": MODEL, "max_tokens": 4000,
                       "messages": [{"role": "user", "content": prompt}]}).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        reply = json.loads(r.read().decode("utf-8"))
    out = "".join(c.get("text", "") for c in reply.get("content", []))
    a, b = out.find("["), out.rfind("]")
    try:
        items = json.loads(out[a:b + 1]) if a >= 0 else []
    except ValueError:
        items = []
    return [x for x in items if isinstance(x, dict) and x.get("ru") and x.get("en")], reply.get("usage", {})


def place(ru, tokens):
    """Where in `tokens` the sentence's words run, contiguous and unchanged, or None."""
    want = [fold(w) for w in WORD.findall(ru)]
    have = [fold(w) for w in tokens]
    n = len(want)
    if not MIN_WORDS <= n <= MAX_WORDS:
        return None
    for i in range(len(have) - n + 1):
        if have[i:i + n] == want:
            return i
    return None


def unit_words(db_topics, db_lex):
    db = sqlite3.connect(f"file:{db_topics}?mode=ro", uri=True)
    db.execute("attach database ? as lex", (str(db_lex),))
    words = {}
    for tid, bare in db.execute("select u.topic_id, l.bare from unit_words u"
                                " join lex.lemmas l on l.id=u.lemma_id order by u.topic_id, u.ord"):
        words.setdefault(tid, []).append(bare)
    order = [t for _r, _c, t in db.execute("select row, col, topic_id from path order by row, col")]
    db.close()
    return words, order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    videos = json.loads((ROOT / "data" / "videos.json").read_text(encoding="utf-8"))["units"]
    index = json.loads((ROOT / "data" / "transcripts.json").read_text(encoding="utf-8"))["index"]
    ranks = spoken_ranks(index)
    words, order = unit_words(args.topics, args.lexicon)
    store = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    cache = store.get("chunks", {})
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not args.dry_run and not key:
        sys.exit("ANTHROPIC_API_KEY is not set")

    known, lines_out = set(), {}
    calls, t_in, t_out, returned, refused, pending = 0, 0, 0, 0, 0, 0
    for tid in order:
        known |= set(words.get(tid, []))
        v = videos.get(tid)
        if not v or v["id"] not in index:
            continue
        vid = v["id"]
        stream = words_with_times(SUBS / f"{vid}.ru-orig.json3")
        at = {}
        for lemma, moments in index[vid].items():
            for m in moments:
                at[m["t"]] = lemma

        # Every complete sentence the video holds, placed back on its timings.
        found = {}
        for start, part in chunks(stream):
            toks = [w for w, _ in part]
            h = hashlib.sha1(f"{vid}|{start}|{' '.join(toks)}".encode("utf-8")).hexdigest()[:16]
            if h not in cache:
                if args.dry_run:
                    pending += 1
                    continue
                items, usage = ask(toks, key)
                calls += 1
                t_in += usage.get("input_tokens", 0)
                t_out += usage.get("output_tokens", 0)
                cache[h] = items
            for x in cache[h]:
                returned += 1
                i = place(x["ru"], toks)
                if i is None:
                    refused += 1
                    continue
                n = len(WORD.findall(x["ru"]))
                span = part[i:i + n]
                t0 = span[0][1]
                # Once per sentence: a video that says it twice gives one line.
                if t0 not in found and not any(fold(f["ru"]) == fold(x["ru"]) for f in found.values()):
                    found[t0] = {"t": t0, "end": span[-1][1], "ru": x["ru"].strip(), "en": x["en"].strip(),
                                 "lem": [at.get(ms) for _w, ms in span]}

        own = set(words.get(tid, []))
        picks = []
        for s in found.values():
            mine = {l for l in s["lem"] if l in own}
            if not mine:
                continue
            readable = sum(1 for l in s["lem"] if l and (l in known or ranks.get(l, 10 ** 6) < FREE_RANK)) / len(s["lem"])
            if readable < READABLE:
                continue
            picks.append((s, mine, readable))
        # Spread across the unit's words first, the most readable first; then
        # the rest by readability, up to the cap.
        picks.sort(key=lambda p: (-p[2], len(p[0]["lem"])))
        chosen, covered = [], set()
        for p in picks:
            if len(chosen) < LINES_PER_UNIT and p[1] - covered:
                chosen.append(p)
                covered |= p[1]
        for p in picks:
            if len(chosen) >= LINES_PER_UNIT:
                break
            if p not in chosen:
                chosen.append(p)
        kept = sorted(({k: s[k] for k in ("t", "end", "ru", "en")} for s, _m, _r in chosen), key=lambda s: s["t"])
        lines_out[vid] = kept
        print(f"  {tid:<9} {len(found):>3} sentences in the video, {len(kept):>2} for the unit")

    if args.dry_run:
        print(f"(dry run — {pending} chunks would be asked; nothing written)")
        return
    store = {"_": ("Complete sentences from each unit's goal video, found by a model in the automatic "
                   "transcript and kept only when they are an exact run of the words said; punctuation "
                   "and English are the model's (tools/build_video_lines.py)."),
             "lines": lines_out, "chunks": cache}
    OUT.write_text(json.dumps(store, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cost = t_in / 1e6 * 1.0 + t_out / 1e6 * 5.0
    print(f"wrote {OUT}: {sum(len(v) for v in lines_out.values())} lines over {len(lines_out)} videos; "
          f"{refused} of {returned} sentences refused as not the words said; {calls} calls, about ${cost:.2f}")


if __name__ == "__main__":
    main()

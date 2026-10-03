#!/usr/bin/env python3
"""Which stress a two-way spelling takes in a shown sentence.

The owner, 2026-10-03, of «Прихо́дите в субботу на спектакль» — "Come on
Saturday for the show" — "I feel like the accent is on the wrong letter".
It was: the imperative is «приходи́те»; «прихо́дите» is "you come". The mark
is Russian Core 5000's, and fix_stress in build_site.py keeps a deck's mark
wherever the lexicon stresses that spelling two ways, because only the
sentence can say which form is meant (§30bm). A deck that chose wrong was
therefore always believed.

So the sentences that carry such a mark are read — the sentence, its English,
the word and its two stressings — and a model names the one the sentence
means. Verdicts go to data/curated/stress_review.json, keyed by the folded
sentence and the folded word, as the vowel index the stress falls on;
build_site.py moves the mark there. A person may correct the file by hand.

    python tools/review_stress.py --dry-run
    python tools/review_stress.py              pick a stress for every marked two-way word
    python tools/review_stress.py --confirm    read every pick that moves a mark a second time

Reads the built native payload; run it after build_site.py and rebuild after
it. The Anthropic key is read from backend/.dev.vars and never printed.
"""
import argparse
import json
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "curated" / "stress_review.json"
MODEL = "claude-sonnet-5-5"
BATCH = 50
ACUTE = "́"

SYSTEM = """You check stress marks in Russian example sentences for learners.

Each item is a sentence, its English translation, one word from it, and two or more ways that word can be stressed — each a different form of a word (for example «прихо́дите» "you come" against «приходи́те» "come!", «ру́ки» "hands" against «руки́» "of the hand"). From the sentence and its English, decide which stressing is the form the sentence uses.

Answer with JSON only: {"pick":[{"id":0,"choice":1}]} — one entry for every item, `choice` the index of the right option. If the sentence genuinely allows either, pick the one its English translation means."""


def api_key():
    m = re.search(r'^ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?', (ROOT / "backend" / ".dev.vars").read_text(), re.M)
    if not m:
        sys.exit("no ANTHROPIC_API_KEY in backend/.dev.vars")
    return m.group(1).strip()


def ask(content):
    body = json.dumps({"model": MODEL, "max_tokens": 4000, "system": SYSTEM,
                       "messages": [{"role": "user", "content": content}]}).encode()
    for attempt in range(1, 4):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "x-api-key": api_key(), "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                j = json.loads(res.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(4 * attempt)
                continue
            raise SystemExit(f"{e.code} {e.read()[:300]}")   # a spent balance does not improve with retries
        text = "".join(c.get("text", "") for c in j["content"])
        m = re.search(r"\{[\s\S]*\}", text)
        try:
            return json.loads(m.group(0))["pick"], j.get("usage", {})
        except Exception:
            continue
    raise SystemExit("no usable answer after three attempts")


def stressings(word, table):
    """Every way the lexicon stresses this spelling, as accented strings."""
    plain = unicodedata.normalize("NFC", unicodedata.normalize("NFD", word).replace(ACUTE, ""))
    out = []
    for v in sorted(table.get(B.fold(plain), ())):
        out.append((v, place(plain, v)))
    return out


def place(plain, v):
    """`plain` with the stress on vowel `v` (an ё needs no mark)."""
    n, out = -1, []
    for ch in plain:
        out.append(ch)
        if ch in B.VOWELS:
            n += 1
            if n == v and ch not in "ёЁ":
                out.append(ACUTE)
    return unicodedata.normalize("NFC", "".join(out))


def candidates(table):
    data = json.loads((ROOT / "native" / "assets" / "data.json").read_text(encoding="utf-8"))
    sent = json.loads((ROOT / "native" / "assets" / "sent.json").read_text(encoding="utf-8"))
    rows = [(r[0], r[1]) for r in data["speech"]["rows"]] + [(r[0], r[1]) for r in sent]
    seen, out = set(), []
    for ru, en in rows:
        n = unicodedata.normalize("NFC", ru)
        for w in B.WORD_RE.findall(n):
            if ACUTE not in unicodedata.normalize("NFD", w):
                continue
            opts = stressings(w, table)
            if len(opts) < 2:
                continue
            key = (B.fold(n), B.fold(w))
            if key in seen:
                continue
            seen.add(key)
            out.append({"key": key, "ru": n, "en": en or "", "word": w, "opts": opts})
    return out


def confirm(table, store):
    """A second, independent reading of every pick that moves a deck's mark,
    the options in the other order. The first pass moved «в Федера́льном
    о́круге» to «окру́ге» ("neighbourhood"), so a move is applied only where
    both readings agree; where they do not, the mark is dropped — no mark
    says "unknown", which is true (§26), where a guessed one teaches a stress."""
    picked, agreed = store.get("picked", {}), store.setdefault("agreed", {})
    todo = []
    for c in candidates(table):
        v = picked.get(c["key"][0], {}).get(c["key"][1])
        was = set(B._stressed(c["word"].replace("ё", "е").replace("Ё", "Е")))
        if v is None or v in was or c["key"][1] in agreed.get(c["key"][0], {}):
            continue
        todo.append(dict(c, opts=list(reversed(c["opts"])), first=v))
    print(f"{len(todo)} moved marks to read again")
    spent = agree = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        lines = []
        for k, c in enumerate(batch):
            plain = unicodedata.normalize("NFC", unicodedata.normalize("NFD", c["ru"]).replace(ACUTE, ""))
            opts = " / ".join(f"{n}: {s}" for n, (_, s) in enumerate(c["opts"]))
            lines.append(f"{k} | {plain} | {c['en']} | word: {c['word'].replace(ACUTE, '')} | {opts}")
        pick, usage = ask("\n".join(lines))
        spent += (usage.get("input_tokens", 0) * 3 + usage.get("output_tokens", 0) * 15) / 1e6
        for p in pick:
            c = batch[p["id"]] if isinstance(p.get("id"), int) and 0 <= p["id"] < len(batch) else None
            if not c or not isinstance(p.get("choice"), int) or not 0 <= p["choice"] < len(c["opts"]):
                continue
            same = c["opts"][p["choice"]][0] == c["first"]
            agreed.setdefault(c["key"][0], {})[c["key"][1]] = same
            agree += same
        OUT.write_text(json.dumps(store, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\r{min(i + BATCH, len(todo))} of {len(todo)} · {agree} agreed · ${spent:.2f}", end="")
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--confirm", action="store_true", help="read every moved mark a second time")
    args = ap.parse_args()
    db = sqlite3.connect(f"file:{ROOT / 'data' / 'lexicon.db'}?mode=ro", uri=True)
    table = B.stress_table(db)
    store = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    if args.confirm:
        confirm(table, store)
        return
    picked = store.get("picked", {})
    todo = [c for c in candidates(table) if c["key"][1] not in picked.get(c["key"][0], {})]
    print(f"{len(todo)} marked two-way words in shown sentences not yet checked")
    if args.dry_run or not todo:
        return
    moved = spent = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        lines = []
        for k, c in enumerate(batch):
            plain = unicodedata.normalize("NFC", unicodedata.normalize("NFD", c["ru"]).replace(ACUTE, ""))
            opts = " / ".join(f"{n}: {s}" for n, (_, s) in enumerate(c["opts"]))
            lines.append(f"{k} | {plain} | {c['en']} | word: {c['word'].replace(ACUTE, '')} | {opts}")
        pick, usage = ask("\n".join(lines))
        spent += (usage.get("input_tokens", 0) * 3 + usage.get("output_tokens", 0) * 15) / 1e6
        for p in pick:
            c = batch[p["id"]] if isinstance(p.get("id"), int) and 0 <= p["id"] < len(batch) else None
            if not c or not isinstance(p.get("choice"), int) or not 0 <= p["choice"] < len(c["opts"]):
                continue
            v = c["opts"][p["choice"]][0]
            picked.setdefault(c["key"][0], {})[c["key"][1]] = v
            was = set(B._stressed(c["word"].replace("ё", "е").replace("Ё", "Е")))
            moved += v not in was
        store = {"_": "tools/review_stress.py: the stress a two-way spelling takes in a shown sentence, "
                      "keyed by the folded sentence and the folded word, as the vowel index (0-based). "
                      "`agreed` is the second reading of every pick that moves the deck's mark: true moves "
                      "it, false drops the mark. Correct by hand if a pick is wrong.",
                 "model": MODEL, "picked": picked, "agreed": store.get("agreed", {})}
        OUT.write_text(json.dumps(store, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\r{min(i + BATCH, len(todo))} of {len(todo)} · {moved} marks to move · ${spent:.2f}", end="")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

"""Wiktionary's Russian entries -> data/senses.db: numbered senses, with labels.

Why this exists (the owner, 2026-09-11, with a Merriam-Webster entry beside the
app): *"every single word should have a detailed entry with multiple uses of the
word"*. The app was not hiding those. It did not have them. Measured across the
3,996 studied lemmas that carry a gloss, 3,543 of them — 89% — have exactly one
sense group, because OpenRussian gives a **list of translations**, not a
dictionary entry: «идти» is "go, walk" and nothing else.

A translation list cannot be split into senses after the fact, and inventing the
split is precisely what §30a forbids — a learner cannot tell a fabricated sense
from a real one, which is the whole reason he is the one studying. So the senses
come from a source that has them.

**The source** is Wiktionary, through kaikki.org's machine-readable extraction
(wiktextract). English Wiktionary's Russian entries carry numbered senses, the
labels a dictionary puts on them (figurative, colloquial, dated, anatomy), and
often a quotation. 89 MB of JSONL, one JSON object per entry.

**The licence** is CC BY-SA 3.0, and rule 20.10 makes attribution an obligation
rather than a decoration: the `meta` rows written here are what the app's credit
line is built from, exactly as `lexicon.db`'s are for OpenRussian.

What is deliberately dropped:
  - form-of entries ("genitive singular of ..."), which are most of the file and
    are not senses. The app resolves forms through its own paradigms.
  - senses with no gloss, and entries in any language but Russian.
  - everything else Wiktionary carries — etymology, pronunciation, synonym
    sections. The app has its own pronunciation and its own examples, and an
    entry that shows four sources of the same thing is not a better entry.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "data", "raw", "wiktionary", "russian.jsonl")
OUT = os.path.join(ROOT, "data", "senses.db")

SOURCE_NAME = "English Wiktionary (via kaikki.org)"
SOURCE_LICENCE = "CC BY-SA 3.0"
SOURCE_URL = "https://kaikki.org/dictionary/Russian/"

# A sense that only says "this is a form of that word" is not a sense. The app
# knows the paradigms; what it wants from here is meaning.
FORM_OF = re.compile(
    r"^(inflection|plural|genitive|dative|accusative|instrumental|prepositional|"
    r"locative|vocative|nominative|singular|comparative|superlative|diminutive|"
    r"alternative form|alternative spelling|obsolete form|misspelling|"
    r"past|present|future|participle|gerund|imperative|short form|feminine|"
    r"masculine|neuter|abbreviation|initialism|acronym|romanization)\b",
    re.I,
)

# The parts of speech the curriculum uses; the rest (interjections, particles,
# prefixes) come through too, but anything Wiktionary files as punctuation or a
# character does not.
SKIP_POS = {"character", "punct", "symbol", "romanization"}

MAX_SENSES = 8          # a dictionary entry, not a concordance
MAX_EXAMPLES = 2        # per sense
MAX_GLOSS = 180
MAX_TAGS = 3

# Labels worth showing. Wiktionary's tag vocabulary is large and much of it is
# grammatical bookkeeping the app states elsewhere (gender, aspect, animacy) or
# noise; these are the ones that change what a sense *means* to a reader.
USEFUL_TAGS = {
    "figurative", "colloquial", "informal", "formal", "slang", "vulgar",
    "dated", "archaic", "obsolete", "poetic", "literary", "humorous",
    "derogatory", "euphemistic", "rare", "regional", "dialectal",
    "transitive", "intransitive", "reflexive", "impersonal",
}


def fold(s):
    """The join key, as rule 20.2 defines it everywhere else."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if c not in ("̀", "́"))
    return unicodedata.normalize("NFC", s).lower().replace("ё", "е").strip()


def clean(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s[:MAX_GLOSS]


def sense_of(raw):
    """One sense, or None when it is a form-of row or has nothing to say."""
    glosses = raw.get("glosses") or raw.get("raw_glosses") or []
    if not glosses:
        return None
    text = clean(glosses[-1] if len(glosses) > 1 else glosses[0])
    if not text or FORM_OF.match(text):
        return None
    # wiktextract marks these structurally too, which catches the ones whose
    # wording the regex above would miss.
    if raw.get("form_of") or raw.get("alt_of"):
        return None
    tags = [t for t in (raw.get("tags") or []) if t in USEFUL_TAGS][:MAX_TAGS]
    out = {"g": text}
    if tags:
        out["t"] = tags
    ex = []
    for e in (raw.get("examples") or [])[:6]:
        ru, en = clean(e.get("text")), clean(e.get("english"))
        # Only a pair: a Russian example with no translation is no use to a
        # learner reading an English entry, and an English-only line is not an
        # example of a Russian word.
        if ru and en and re.search(r"[а-яё]", ru):
            ex.append({"ru": ru, "en": en})
        if len(ex) >= MAX_EXAMPLES:
            break
    if ex:
        out["x"] = ex
    return out


def entries(path, limit=None):
    n = 0
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue
            n += 1
            if limit and n >= limit:
                return


def build(src, out, limit=None):
    if not os.path.exists(src):
        sys.exit(f"no extract at {src} — see the module docstring for the URL")

    rows = {}          # (key, pos) -> [senses]
    read = skipped = 0
    for e in entries(src, limit):
        read += 1
        if e.get("lang_code") != "ru":
            continue
        pos = (e.get("pos") or "").lower()
        if pos in SKIP_POS:
            continue
        word = e.get("word") or ""
        key = fold(word)
        if not key or not re.search(r"[а-яё]", key):
            continue
        senses = []
        for s in e.get("senses") or []:
            got = sense_of(s)
            if got and not any(got["g"] == x["g"] for x in senses):
                senses.append(got)
            if len(senses) >= MAX_SENSES:
                break
        if not senses:
            skipped += 1
            continue
        at = rows.setdefault((key, pos), [])
        for s in senses:
            if len(at) < MAX_SENSES and not any(s["g"] == x["g"] for x in at):
                at.append(s)

    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.execute("CREATE TABLE senses (key TEXT, pos TEXT, n INTEGER, json TEXT)")
    db.execute("CREATE INDEX senses_key ON senses (key)")
    db.execute("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)")
    for (key, pos), senses in rows.items():
        db.execute("INSERT INTO senses VALUES (?,?,?,?)",
                   (key, pos, len(senses), json.dumps(senses, ensure_ascii=False)))
    for k, v in (("source", SOURCE_NAME), ("licence", SOURCE_LICENCE), ("url", SOURCE_URL)):
        db.execute("INSERT INTO meta VALUES (?,?)", (k, v))
    db.commit()

    multi = sum(1 for s in rows.values() if len(s) > 1)
    withex = sum(1 for s in rows.values() if any("x" in x for x in s))
    print(f"read {read:,} entries, {len(rows):,} kept ({skipped:,} had no sense worth keeping)")
    print(f"  more than one sense : {multi:,}")
    print(f"  at least one example: {withex:,}")
    print(f"  source              : {SOURCE_NAME}, {SOURCE_LICENCE}")
    print(f"wrote {out}")
    db.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--limit", type=int, default=None, help="read only the first N entries")
    a = ap.parse_args()
    build(a.src, a.out, a.limit)


if __name__ == "__main__":
    main()

"""Public-domain photographs for the words the units teach (the owner, 2026-09-07).

For every noun in a unit, Wikimedia Commons is searched for its first English
sense; the first photograph (JPEG, wide enough) whose licence is CC0 or public
domain is taken — nothing else is: a CC BY photo would need a credit line in the
app for every card, and the owner asked for public domain. A 240-pixel thumbnail
is cached under data/raw/images/<lemma>.jpg with the file's title, author and
licence in manifest.json, which is the attribution record.

Commons search is a full-text search over a hundred million files: "bread" finds
bread, "grandmother" finds a painting of one, "case" finds anything. The report
names every word that got no photo so a person can decide whether a different
search term is worth it (data/curated/image_terms.json overrides the term, or
says "" to skip a word that should not have a picture).

    python tools/harvest_images.py             # every unit noun without a photo
    python tools/harvest_images.py --unit food # one unit
    python tools/harvest_images.py --report    # what is on disk, nothing fetched
"""

import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "images"
MANIFEST = OUT / "manifest.json"
TERMS = ROOT / "data" / "curated" / "image_terms.json"
UA = "bridges-personal-study/1.0 (jared.a.flood@gmail.com)"
API = "https://commons.wikimedia.org/w/api.php"
OK_LICENCE = re.compile(r"^(CC0|Public domain)", re.I)
MIN_WIDTH = 480
# 176 px wide: about 9 KB a photo, so seven hundred of them cost the app ~6 MB.
# At 240 px they were 20 KB each and the set would have been 14 MB.
THUMB = 176
PARENS = re.compile(r"\([^)]*\)")


def api_at(base, params):
    url = base + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def api(params):
    return api_at(API, params)


NEGATIVE = ("-drawing -map -logo -icon -engraving -illustration -painting -poster "
            "-manuscript -page -scan -diagram")
# Museum scans and antiques: the public-domain pool is full of them, and they
# are titled like catalogue entries — a year before 2000, "museum", the
# Rijksmuseum's "(titel op object)". They lose to any plain photograph.
OLD_RE = re.compile(r"\b1[0-9]{3}\b|museum|titel op object|funerary|manuscript|engrav|"
                    r"lithograph|woodcut|etching|plate\b|fresco|relief|codex", re.I)


def candidates(query):
    d = api({"action": "query", "generator": "search", "gsrsearch": query,
             "gsrnamespace": 6, "gsrlimit": 16, "prop": "imageinfo",
             "iiprop": "url|extmetadata|mime|size", "iiurlwidth": THUMB, "format": "json"})
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        licence = (em.get("LicenseShortName", {}).get("value") or "").strip()
        if not OK_LICENCE.match(licence):
            continue
        if ii.get("mime") != "image/jpeg" or (ii.get("width") or 0) < MIN_WIDTH:
            continue
        artist = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value") or "").strip()[:80]
        out.append({"title": p["title"], "thumb": ii.get("thumburl"), "author": artist,
                    "licence": licence, "url": ii.get("descriptionurl") or ii.get("url"),
                    "old": bool(OLD_RE.search(p["title"]))})
    return out


def wiki_lead(term):
    """The English Wikipedia article's lead image, when it is public domain or
    CC0: the best-chosen picture of a thing there is, but mostly share-alike
    licensed — two in ten qualify. Same shape as a search hit, or None."""
    d = api_at("https://en.wikipedia.org/w/api.php",
               {"action": "query", "titles": term.capitalize(), "prop": "pageimages",
                "piprop": "name", "redirects": 1, "format": "json"})
    page = next(iter(d.get("query", {}).get("pages", {}).values()), {})
    name = page.get("pageimage")
    if not name:
        return None
    d2 = api({"action": "query", "titles": "File:" + name, "prop": "imageinfo",
              "iiprop": "url|extmetadata|mime|size", "iiurlwidth": THUMB, "format": "json"})
    p = next(iter(d2.get("query", {}).get("pages", {}).values()), {})
    ii = (p.get("imageinfo") or [{}])[0]
    em = ii.get("extmetadata", {})
    licence = (em.get("LicenseShortName", {}).get("value") or "").strip()
    if not OK_LICENCE.match(licence) or ii.get("mime") != "image/jpeg" or (ii.get("width") or 0) < MIN_WIDTH:
        return None
    artist = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value") or "").strip()[:80]
    return {"title": p.get("title", "File:" + name), "thumb": ii.get("thumburl"), "author": artist,
            "licence": licence, "url": ii.get("descriptionurl") or ii.get("url"), "via": "wikipedia"}


def search(term):
    """-> the first acceptable photo: {title, thumb, author, licence, url} or None.

    Wikipedia's lead image when it is free (wiki_lead); else Commons, the term
    in the file's *title* first — a full-text match on a description handed
    "money" a street festival whose caption mentioned it — and the whole text
    only when the title finds nothing. Among what is found, a photograph that is
    not an antique wins (OLD_RE), then search order."""
    lead = wiki_lead(term)
    if lead:
        return lead
    found = candidates(f'intitle:"{term}" filetype:bitmap {NEGATIVE}')
    if not any(not f["old"] for f in found):
        found += candidates(f'"{term}" filetype:bitmap {NEGATIVE}')
    if not found:
        return None
    found.sort(key=lambda f: (f["old"], 0))
    best = dict(found[0])
    del best["old"]
    return best


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--unit", help="only this unit id")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--pause", type=float, default=1.0)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    terms = {}
    if TERMS.exists():
        terms = {k: v for k, v in json.loads(TERMS.read_text(encoding="utf-8")).items() if not k.startswith("_")}

    db = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    db.execute("attach database ? as lx", (str(args.lexicon),))
    rows = db.execute("""
        select u.topic_id, l.bare, l.en from unit_words u join lx.lemmas l on l.id = u.lemma_id
        where l.pos = 'noun' order by u.topic_id, u.ord""").fetchall()
    db.close()
    if args.unit:
        rows = [r for r in rows if r[0] == args.unit]

    tally = Counter()
    misses = []
    for tid, bare, en in rows:
        curated = terms.get(bare)
        stale = (curated is not None and bare in manifest
                 and (manifest[bare] or {}).get("term") != curated)
        if bare in manifest and manifest[bare] and (OUT / f"{bare}.jpg").exists() and not stale:
            tally["have"] += 1
            continue
        if bare in manifest and manifest[bare] is None and not args.report and not stale:
            tally["skipped before"] += 1
            continue
        if args.report:
            tally["missing"] += 1
            misses.append((tid, bare, en))
            continue
        term = curated
        if term == "":
            manifest[bare] = None
            tally["curated skip"] += 1
            continue
        if not term:
            term = PARENS.sub(" ", (en or "").split(",")[0].split(";")[0]).strip()
        if not term:
            tally["no gloss"] += 1
            continue
        try:
            hit = search(term)
            if hit and hit["thumb"]:
                data = fetch(hit["thumb"])
                (OUT / f"{bare}.jpg").write_bytes(data)
                manifest[bare] = dict(hit, term=term, unit=tid, bytes=len(data))
                tally["fetched"] += 1
            else:
                manifest[bare] = None
                tally["no photo"] += 1
                misses.append((tid, bare, term))
        except (urllib.error.URLError, OSError, ValueError) as e:
            tally["error"] += 1
            print(f"  !! {bare}: {e}")
        time.sleep(args.pause)
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        n = sum(tally.values())
        if n % 25 == 0:
            print(f"  {n}/{len(rows)} … {dict(tally)}")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    have = sum(1 for v in manifest.values() if v)
    print(f"\n{len(rows)} unit nouns; photos on disk for {have}; {dict(tally)}")
    if misses:
        print("\nno photo (unit, word, term searched):")
        for tid, bare, term in misses[:80]:
            print(f"  {tid:<10} {bare:<18} {term}")


if __name__ == "__main__":
    main()

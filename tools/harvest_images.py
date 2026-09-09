"""Photographs for the words the units teach (the owner, 2026-09-07 and -08).

The second harvest. The first took only public-domain files, and the
public-domain pool is museum scans and government press photographs: half the
hits were the wrong subject and the right ones looked a century old. The owner
asked for modern pictures on most vocabulary cards — something a learner can
recall the word by. So the sources and the licence changed:

  * Any Creative Commons licence that allows reuse with credit — CC0, public
    domain, CC BY, CC BY-SA. The app credits every photograph on the word's
    entry (title, author, licence, and the Commons page behind it), which is
    what CC BY asks for. Nothing NC or ND; nothing GFDL-only.
  * The pictures are the ones Wikipedia's article on the thing uses: the lead
    image first, then the rest of the article's photographs, in order. An
    editor chose them for that subject, which is the precision a full-text
    search of Commons never had. The article is the *Russian* one for the
    Russian word when there is one — «бал» is then the dance and «насморк»
    is not "cold" the temperature, so the sense problem never arises — with
    the English article of the same concept (through Wikidata) as a second
    source of photographs. Without a Russian article the English gloss is
    tried: by title (redirects followed: "grandmother" lands on Grandparent),
    or, when the title is a disambiguation page or a film, through
    Wikidata's search for the concept and its English article. A Wikidata
    item that is a film, an album, a person, a surname… is refused (P31 in
    NOT_A_THING), which is how "big" stops finding the Tom Hanks poster.
  * When the article has no usable photograph, Commons is searched for files
    whose structured data says they *depict* the concept (P180) and that the
    community rated as quality images — and only when the file's own title or
    categories name the thing, since a photograph of a courtyard is tagged
    "dog" for the dog in the corner.

What "usable" means: a JPEG at least MIN_WIDTH wide, not extreme in shape,
taken in MIN_YEAR or later when the file says when it was taken, and not
artwork — a painting, engraving, statue, map, logo or diagram by its
categories or title (ART_RE). Nouns, verbs and adjectives of every unit are
tried, the first three senses of each; a verb's sense also as a gerund
("run" → "Running"). data/curated/image_terms.json still overrides the term,
and "" still means no picture for this word.

Thumbnails are THUMB pixels wide, cached under data/raw/images/<lemma>.jpg,
with the record in manifest.json (v2 entries; v1 entries are re-fetched).

    python tools/harvest_images.py             # every unit word without a v2 photo
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
COMMONS = "https://commons.wikimedia.org/w/api.php"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
RUWIKI = "https://ru.wikipedia.org/w/api.php"
WIKIDATA = "https://www.wikidata.org/w/api.php"
VERSION = 2

OK_LICENCE = re.compile(r"^(CC0|Public domain|CC BY(-SA)? \d)", re.I)
MIN_WIDTH = 640
MIN_YEAR = 1995
# 320 px wide: 30–45 KB a photo from Commons' encoder; the card shows it at the
# screen's width, and 176 px (the first harvest) was visibly soft there.
THUMB = 320
MAX_SENSE_WORDS = 3
PARENS = re.compile(r"\([^)]*\)")

# Artwork and non-photographs, by category or title. "PD-Art" and "PD-old" are
# Commons' own tags for reproductions of old works.
ART_RE = re.compile(r"paintings?\b|drawings?\b|engrav|lithograph|woodcut|etching|artworks?\b|"
                    r"PD-Art|PD-old|manuscript|illustrations?\b|sculptures?\b|statues?\b|"
                    r"posters?\b|logos?\b|\bmaps?\b|diagrams?\b|coats? of arms|stamps?\b|"
                    r"coins?\b|banknotes?\b|screenshots?\b|covers?\b|icons?\b|"
                    r"\b1[0-9]{3}s?\b(?! in )|museum|titel op object|codex|frescos?\b|"
                    r"reliefs?\b|mosaics?\b|scans?\b|cartoons?\b|comics?\b|emblems?\b|"
                    r"flags?\b|heraldry|charts?\b|graphs?\b|renderings?\b|3D\b", re.I)
# Photographs of the wrong kind: the article on a living thing opens its
# evolution section with a fossil and its anatomy section with a skeleton,
# and both come before the first photograph of the animal alive.
NOT_IT_RE = re.compile(r"fossil|skeleton|skulls?\b|bones?\b|anatom|taxiderm|specimens?\b|"
                       r"dissect|embryo|x-ray|microscop|histolog|\bdead\b|carcass|roadkill|"
                       r"ultrasound|endoscop|\bf?MRI\b|\bCT\b|radiograph|tomograph|patholog|"
                       r"neuroimag|brain scan|activation|"
                       r"lesion|disease|syndrome|surg|clinical|medical imag|injur|wound|"
                       r"hunting|slaughter|butcher|meat\b|larva|pupa|egg\b|eggs\b|"
                       r"in art\b|models?\b|toys?\b|costume|mascot|replica|cross-?section|"
                       r"close-?up|macro\b|detail\b", re.I)
# Wikidata "instance of" values that are not the thing a word names.
NOT_A_THING = {
    "Q11424": "film", "Q482994": "album", "Q7366": "song", "Q134556": "single",
    "Q5398426": "television series", "Q571": "book", "Q8261": "novel", "Q5": "human",
    "Q215380": "band", "Q7889": "video game", "Q1002697": "periodical",
    "Q15416": "television program", "Q4167410": "disambiguation page",
    "Q13442814": "scholarly article", "Q101352": "family name", "Q202444": "given name",
    "Q4830453": "business", "Q783794": "company", "Q1371849": "musical work",
    "Q2188189": "musical work", "Q47461344": "written work", "Q732577": "publication",
    "Q3305213": "painting", "Q838948": "work of art", "Q1004": "comics",
    "Q21191270": "television episode", "Q1656682": "event", "Q4167836": "category",
    "Q1229071": "word", "Q11266439": "template", "Q3231690": "automobile model",
    "Q4438121": "sports organization", "Q476028": "football club",
}
# …and, when the concept was reached through an *English* gloss rather than
# the Russian word's own article, places: "раз" (once) is not the commune of
# Raze, "мать" is not a rhinoceros reserve. A Russian word whose own article
# is a place («Москва») is still a place.
NOT_A_PLACE = {
    "Q486972": "human settlement", "Q515": "city", "Q3957": "town", "Q532": "village",
    "Q484170": "commune of France", "Q15284": "municipality", "Q123705": "neighbourhood",
    "Q7930989": "city/town", "Q5119": "capital", "Q1549591": "big city", "Q6256": "country",
    "Q23442": "island", "Q4022": "river", "Q8502": "mountain", "Q23397": "lake",
    "Q82794": "region", "Q3624078": "sovereign state", "Q34442": "road",
    "Q41176": "building", "Q1435 ": "", "Q2221906": "geographic location",
    "Q56061": "administrative territorial entity", "Q532": "village", "Q3191695": "neighbourhood",
}


def api(base, params, retries=2):
    url = base + "?" + urllib.parse.urlencode(dict(params, format="json"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for k in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (urllib.error.URLError, OSError):
            if k == retries:
                raise
            time.sleep(3 * (k + 1))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


# --- finding the concept ----------------------------------------------------

def wiki_page(title, base=WIKIPEDIA):
    """An article (English by default, Russian with RUWIKI): its Wikidata id,
    whether it is a disambiguation page, and its lead image. None if there is
    no article."""
    d = api(base, {"action": "query", "titles": title, "redirects": 1,
                   "prop": "pageprops|pageimages", "piprop": "name",
                   "ppprop": "wikibase_item|disambiguation"})
    page = next(iter(d.get("query", {}).get("pages", {}).values()), {})
    if "missing" in page or "invalid" in page:
        return None
    pp = page.get("pageprops", {})
    lead = page.get("pageimage")
    return {"title": page.get("title"), "qid": pp.get("wikibase_item"), "base": base,
            "disambig": "disambiguation" in pp,
            "lead": "File:" + lead.replace("_", " ") if lead else None}


def article_files(page):
    """The files an article uses *in the order they appear* — the parse API
    gives that; the query API's list is alphabetical, which once handed
    "animal" a rotifer and "mouse" a caribou from the navbox at the foot of
    the page."""
    d = api(page["base"], {"action": "parse", "page": page["title"], "redirects": 1, "prop": "images"})
    return ["File:" + f.replace("_", " ") for f in d.get("parse", {}).get("images", [])]


def entity(qid):
    """Wikidata: what the item is an instance of, and its English and Russian
    articles."""
    d = api(WIKIDATA, {"action": "wbgetentities", "ids": qid, "props": "claims|sitelinks",
                       "sitefilter": "enwiki|ruwiki"})
    e = d.get("entities", {}).get(qid, {})
    kinds = []
    for c in e.get("claims", {}).get("P31", []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if isinstance(v, dict) and v.get("id"):
            kinds.append(v["id"])
    links = e.get("sitelinks", {})
    return {"kinds": kinds, "article": links.get("enwiki", {}).get("title"),
            "ru": links.get("ruwiki", {}).get("title")}


def wd_search(term):
    """Items whose English *label* is the term — not an alias, not a longer
    name that contains it: "race" must not find a rowing regatta."""
    d = api(WIKIDATA, {"action": "wbsearchentities", "search": term, "language": "en",
                       "type": "item", "limit": 6})
    return [r["id"] for r in d.get("search", [])
            if (r.get("match") or {}).get("type") == "label"
            and (r.get("label") or "").lower() == term.lower()]


def refused(kinds, english=False):
    why = next((NOT_A_THING[k] for k in kinds if k in NOT_A_THING), None)
    if not why and english:
        why = next((NOT_A_PLACE[k] for k in kinds if k in NOT_A_PLACE), None)
    return why


def resolve_ru(bare):
    """The Russian word's own article on the Russian Wikipedia -> (ru page,
    qid, en page or None), or (None, None, why). The word itself, not a
    translation, so «бал» is the dance and «насморк» is not "cold" the
    temperature — the sense problem does not arise. A disambiguation page
    means the word has several things and the English gloss must decide."""
    if not bare:
        return None, None, "curated term"
    page = wiki_page(bare[:1].upper() + bare[1:], RUWIKI)
    if not page:
        return None, None, "no Russian article"
    if page["disambig"] or not page["qid"]:
        return None, None, "ambiguous in Russian"
    e = entity(page["qid"])
    why = refused(e["kinds"])
    if why:
        return None, None, why
    en = wiki_page(e["article"]) if e["article"] else None
    return page, page["qid"], en


def resolve(term):
    """term -> (page, qid, note) — the article to take pictures from, or
    (None, None, why)."""
    page = wiki_page(term[:1].upper() + term[1:])
    if page and not page["disambig"] and page["qid"]:
        why = refused(entity(page["qid"])["kinds"], english=True)
        if not why:
            return page, page["qid"], None
    # The title was missing, ambiguous or the wrong kind of thing: ask Wikidata
    # for the concept and take its article.
    for qid in wd_search(term):
        e = entity(qid)
        if refused(e["kinds"], english=True) or not e["article"]:
            continue
        p = wiki_page(e["article"])
        if p and not p["disambig"]:
            return p, qid, None
    return None, None, ("ambiguous" if page and page["disambig"] else
                        "not a thing" if page else "no article")


# --- choosing the picture ---------------------------------------------------

def year_of(em):
    m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", em.get("DateTimeOriginal", {}).get("value") or "")
    return int(m.group(1)) if m else None


def judge(p):
    """A Commons page with imageinfo -> (hit, reason). hit is the record to
    keep; reason says why it was refused."""
    ii = (p.get("imageinfo") or [{}])[0]
    em = ii.get("extmetadata", {})
    title = re.sub(r"^File:", "", p.get("title") or "")
    licence = (em.get("LicenseShortName", {}).get("value") or "").strip()
    if not OK_LICENCE.match(licence):
        return None, "licence"
    if ii.get("mime") != "image/jpeg":
        return None, "not jpeg"
    w, h = ii.get("width") or 0, ii.get("height") or 0
    if w < MIN_WIDTH or not (0.5 <= w / max(h, 1) <= 2.4):
        return None, "size"
    cats = em.get("Categories", {}).get("value") or ""
    if ART_RE.search(title) or ART_RE.search(cats):
        return None, "artwork"
    if NOT_IT_RE.search(title) or NOT_IT_RE.search(cats):
        return None, "not the thing"
    year = year_of(em)
    if year and year < MIN_YEAR:
        return None, "old"
    # A public-domain file that does not say when it was taken is, nearly
    # always, an old one — a painting whose categories missed ART_RE.
    if not year and licence.lower().startswith("public domain"):
        return None, "old"
    artist = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value") or "").strip()[:80]
    return {"title": "File:" + title, "thumb": ii.get("thumburl"), "author": artist,
            "licence": licence, "url": ii.get("descriptionurl") or ii.get("url"),
            "year": year, "cats": cats[:200]}, None


def imageinfo(titles, base=WIKIPEDIA):
    """imageinfo for up to 50 files, in the order asked. Asked of Wikipedia
    by default: it answers for its own files and for Commons' alike."""
    out = []
    for k in range(0, len(titles), 50):
        batch = titles[k:k + 50]
        d = api(base, {"action": "query", "titles": "|".join(batch), "prop": "imageinfo",
                       "iiprop": "url|extmetadata|mime|size", "iiurlwidth": THUMB})
        pages = d.get("query", {}).get("pages", {})
        norm = {n["to"]: n["from"] for n in d.get("query", {}).get("normalized", [])}
        by_title = {norm.get(p.get("title"), p.get("title")): p for p in pages.values()}
        out += [by_title[t] for t in batch if t in by_title]
    return out


# How far down an article to look. Past the first dozen photographs the
# article is into its history section and its navboxes.
ARTICLE_DEPTH = 12


def from_lead(page):
    """The article's lead image, when it is a usable photograph."""
    if not page.get("lead") or not page["lead"].lower().endswith((".jpg", ".jpeg")):
        return None, "no lead photograph"
    for p in imageinfo([page["lead"]], page["base"]):
        return judge(p)
    return None, "lead missing"


def from_article(page):
    """The article's photographs in order -> (hit, reasons)."""
    titles = [t for t in article_files(page)
              if t.lower().endswith((".jpg", ".jpeg")) and t != page.get("lead")][:ARTICLE_DEPTH]
    reasons = Counter()
    for p in imageinfo(titles, page["base"]):
        hit, why = judge(p)
        if hit:
            return hit, reasons
        reasons[why] += 1
    return None, reasons


def names(p, words):
    text = ((p.get("title") or "") + " " + (p.get("cats") or "")).lower()
    return any(re.search(r"\b" + re.escape(w) + r"s?\b", text) for w in words)


def from_depicts(qid, words):
    """Quality images whose structured data depicts the concept, named after it."""
    d = api(COMMONS, {"action": "query", "generator": "search",
                      "gsrsearch": f'haswbstatement:P180={qid} filetype:bitmap incategory:"Quality images"',
                      "gsrnamespace": 6, "gsrlimit": 12, "prop": "imageinfo",
                      "iiprop": "url|extmetadata|mime|size", "iiurlwidth": THUMB})
    if not d.get("query"):
        return None
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    for p in pages:
        hit, _ = judge(p)
        if hit and names(hit, words):
            return hit
    return None


def senses(en, pos):
    """The search terms a gloss offers: its first senses, short ones, without
    parentheses or a leading "to"; a verb's first sense also as a gerund."""
    out = []
    for part in re.split(r"[;,]", PARENS.sub(" ", en or "")):
        term = re.sub(r"^\s*to\s+", "", part).strip(" .")
        if not term or len(term.split()) > MAX_SENSE_WORDS or term in out:
            continue
        out.append(term)
        if len(out) == 3:
            break
    if pos == "verb" and out and " " not in out[0]:
        base = out[0]
        ger = base[:-1] + "ing" if base.endswith("e") and not base.endswith("ee") else base + "ing"
        out.insert(1, ger)
    return out


def pictures(pages, qid, term):
    """The picture for a concept, given its articles (Russian first when there
    is one) -> (hit, log line). In order of how surely the picture is *of*
    the thing: each article's lead image; a quality image whose structured
    data depicts the concept and whose name or categories say so; each
    article's other photographs in page order."""
    words = [w for w in re.split(r"[^a-zа-яё]+", (term + " " + " ".join(p["title"] for p in pages)).lower())
             if len(w) > 2]
    found = dict(term=term, article=pages[0]["title"], qid=qid)
    whys = []
    for p in pages:
        hit, why = from_lead(p)
        if hit:
            return dict(hit, via="lead", **found), None
        whys.append(f"lead {why}")
    hit = from_depicts(qid, words)
    if hit:
        return dict(hit, via="depicts", **found), None
    for p in pages:
        hit, reasons = from_article(p)
        if hit:
            return dict(hit, via="article", **found), None
        whys.append(str(dict(reasons) or "no photographs"))
    return None, f"{term} ({found['article']}): " + "; ".join(whys)


def search(bare, terms, english=True):
    """-> (hit or None, log). The Russian word's own article first; failing
    that — for nouns only — the English senses in turn until one names a
    thing. Once a term has found its article the search stops there whether
    or not a photograph was usable — the next sense of «порода» is "race",
    and a picture of the wrong sense is worse than none. Verbs and adjectives
    take no English route at all: "suit" for «подходить» found a man in a
    tweed suit, "back" for «поддержать» a pair of bare backs, "last" for
    «последний» a shoemaker's lasts."""
    log = []
    ru, qid, en = resolve_ru(bare)
    if ru:
        hit, why = pictures([ru] + ([en] if en and not en["disambig"] else []), qid, bare)
        # The Russian article settled what the word means; if that thing has
        # no usable photograph, a guess from the English gloss must not be
        # made instead («насморк» with no picture beats an iceberg for "cold").
        return hit, [why] if why else log
    log.append(f"{bare}: {en}")
    if not english:
        return None, log
    for term in terms:
        page, qid, why = resolve(term)
        if not page:
            log.append(f"{term}: {why}")
            continue
        hit, why = pictures([page], qid, term)
        if hit:
            return hit, log
        log.append(why)
        break
    return None, log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--unit", help="only this unit id")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many fetches")
    ap.add_argument("--redo", action="store_true", help="fetch again what is already on disk")
    ap.add_argument("--redo-english", action="store_true",
                    help="fetch again only what was found through an English gloss")
    ap.add_argument("--pause", type=float, default=0.3)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    terms = {}
    if TERMS.exists():
        terms = {k: v for k, v in json.loads(TERMS.read_text(encoding="utf-8")).items() if not k.startswith("_")}

    db = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    db.execute("attach database ? as lx", (str(args.lexicon),))
    rows = db.execute("""
        select u.topic_id, l.bare, l.en, l.pos from unit_words u join lx.lemmas l on l.id = u.lemma_id
        where l.pos in ('noun', 'verb', 'adjective') order by u.topic_id, u.ord""").fetchall()
    db.close()
    if args.unit:
        rows = [r for r in rows if r[0] == args.unit]

    tally = Counter()
    misses = []
    fetched = 0
    for tid, bare, en, pos in rows:
        curated = terms.get(bare)
        have = manifest.get(bare)
        current = (have is not None and have.get("v") == VERSION and (OUT / f"{bare}.jpg").exists()
                   and (curated is None or have.get("term") == curated))
        skipped = bare in manifest and manifest[bare] is None and manifest.get(f"_{bare}") == VERSION
        via_english = bool(have) and have.get("term") != bare and not curated
        if current and not args.redo and not (args.redo_english and via_english):
            tally["have"] += 1
            continue
        if skipped and not args.report and not args.redo:
            tally["skipped before"] += 1
            continue
        if args.report:
            tally["missing"] += 1
            misses.append((tid, bare, en))
            continue
        if args.limit and fetched >= args.limit:
            break
        if curated == "":
            manifest[bare] = None
            manifest[f"_{bare}"] = VERSION
            tally["curated skip"] += 1
            continue
        candidates = [curated] if curated else senses(en, pos)
        if not candidates:
            tally["no gloss"] += 1
            continue
        fetched += 1
        try:
            hit, log = search(bare if not curated else "", candidates,
                              english=(pos == "noun" or bool(curated)))
            if hit and hit["thumb"]:
                data = fetch(hit["thumb"])
                (OUT / f"{bare}.jpg").write_bytes(data)
                manifest[bare] = dict(hit, v=VERSION, unit=tid, pos=pos, bytes=len(data))
                manifest.pop(f"_{bare}", None)
                tally[hit["via"]] += 1
            else:
                manifest[bare] = None
                manifest[f"_{bare}"] = VERSION
                tally["no photo"] += 1
                misses.append((tid, bare, "; ".join(log)))
        except (urllib.error.URLError, OSError, ValueError) as e:
            tally["error"] += 1
            print(f"  !! {bare}: {e}")
        time.sleep(args.pause)
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        n = sum(tally.values())
        if n % 25 == 0:
            print(f"  {n}/{len(rows)} … {dict(tally)}", flush=True)

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    have = sum(1 for k, v in manifest.items() if v and not k.startswith("_") and v.get("v") == VERSION)
    print(f"\n{len(rows)} unit words; v{VERSION} photos on disk for {have}; {dict(tally)}")
    if misses:
        print("\nno photo (unit, word, what was tried):")
        for tid, bare, why in misses[:120]:
            print(f"  {tid:<10} {bare:<18} {why[:110]}")


if __name__ == "__main__":
    main()

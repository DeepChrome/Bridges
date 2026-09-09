"""The video library: every harvested video with what it is about, and one video
per study unit.

Reads the catalogue from tools/harvest_videos.py and the index from
tools/build_transcripts.py, writes data/videos.json:

  channels  the sources, for the credit line
  units     unit id -> the one video that teaches its words (coverage-led)
  videos    every video: title, channel, duration, keywords, the units whose
            vocabulary it speaks, its level and ease, its chapters

Keywords are what the Immerse search matches: the title, the channel's own tags,
the start of the description, the grammar points a title names, the level, and the
names of the units and chapters whose words the video speaks. So "grammar" finds
the case lessons and "travel" finds the trip vlogs, without a taxonomy of its own —
the unit keyword sets in build_topics.py are reused, as before.

Unit attachment is deliberately conservative: a video is attached only when it
actually speaks a good share of the unit's words (the transcript decides), with the
title as tie-break; units with no confident match get no video rather than a loose
one, and the report says how many.

    python tools/build_videos.py
"""

import argparse
import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# reconfigure, not a fresh TextIOWrapper: build_topics wraps sys.stdout at import
# time, and wrapping the same buffer twice closes it out from under the first.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_topics import RULES  # noqa: E402
from panel import fold  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Series aimed at beginners, used for the frequency-ordered Core stages which have no
# topic of their own.
BEGINNER_RE = re.compile(r"super easy russian", re.I)

# A unit's video is watched inside a lesson; a half-hour vlog is not that.
UNIT_MAX_SEC = 1200
# A video is a unit's episode only if it says this many of the unit's words.
MIN_HIT = 5

# Keyword matching gets these wrong: "city" pulled a video about a Latvian city
# rather than town vocabulary, and "photos" pulled a family album into Technology.
# Same convention as OVERRIDES in build_topics.py — curate the misses, don't bend
# the rules around them.
OVERRIDES = {
    "city": "TBI1dEe_X5E",   # Learn to Talk About Your Neighbourhood in Russian
    "tech": "p9XNf1EFz98",   # Laptop, App and Other Words Russians Call Differently
}

STOP = set("""the a an and or of in on at to for with about from is are was were be
been being this that these those it its as by how why what when where who russian
russia russians people easy super vs your you we our my me i do does did can will
not no yes all one two more most very just into out up down over than then them
they their there here his her she he him has have had but if so some any every
also new learn learning language languages video videos episode part lesson lessons
podcast channel subscribe like comment share""".split())

# What a title says the video teaches. Each hit adds its key and "grammar".
GRAMMAR = [
    ("cases", r"\bcases?\b|prepositional|accusative|genitive|dative|instrumental|nominative"),
    ("verbs", r"\bverbs?\b|conjugat"),
    ("tense", r"past tense|future tense|present tense|\btenses?\b"),
    ("aspect", r"\baspects?\b|perfective|imperfective"),
    ("motion", r"verbs? of motion"),
    ("plural", r"\bplurals?\b"),
    ("gender", r"\bgenders?\b"),
    ("pronouns", r"\bpronouns?\b"),
    ("adjectives", r"\badjectives?\b"),
    ("adverbs", r"\badverbs?\b"),
    ("numbers", r"\bnumbers?\b|\bnumerals?\b|\bcounting\b"),
    ("prepositions", r"\bprepositions?\b"),
    ("imperative", r"\bimperative\b"),
    ("particles", r"\bparticles?\b"),
    ("prefixes", r"\bprefix(es)?\b"),
    ("stress", r"\bstress\b|\baccent\b"),
    ("pronunciation", r"pronunciation|pronounce|sounds?\b"),
    ("alphabet", r"alphabet|cyrillic"),
]
KINDS = [
    ("vocabulary", r"vocabulary|\bwords\b|phrases|expressions|slang|idioms"),
    ("listening", r"listening|comprehensible|comprehension|\bstory\b|\bstories\b|fairy tale|\bvlog\b|podcast|conversation|dialogue|interview"),
    ("culture", r"culture|tradition|holiday|history|soviet|\bussr\b"),
    ("interview", r"street interview|interviews?\b"),
    ("slow", r"\bslow\b"),
]
LEVELS = [
    ("beginner", r"\ba1\b|super easy|for beginners|beginner|from zero|absolute|\bslow\b"),
    ("elementary", r"\ba2\b|elementary"),
    ("intermediate", r"\bb1\b|intermediate"),
    ("upper-intermediate", r"\bb2\b|upper"),
    ("advanced", r"\bc1\b|\bc2\b|advanced"),
]
LATIN = re.compile(r"[a-z']+")
CYRILLIC = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")


def tokens(text):
    return [w for w in LATIN.findall(text.lower()) if w not in STOP and len(w) > 2]


def score_title(title, keywords):
    """How strongly a title matches one topic's keyword set."""
    words = tokens(title)
    if not words:
        return 0
    hits = sum(1 for w in words if w in keywords)
    # Also catch singular/plural drift ("jobs" vs "job").
    hits += sum(1 for w in words if w.endswith("s") and w[:-1] in keywords)
    return hits


def first_hits(text, table):
    return [key for key, pat in table if re.search(pat, text, re.I)]


CEFR_RE = re.compile(r"\b([ABC][12])(\+?)\b")
LEVEL_CEFR = {"beginner": "A1", "elementary": "A2", "intermediate": "B1",
              "upper-intermediate": "B2", "advanced": "C1"}


def cefr_of(title, level, ease):
    """A CEFR code for the search: the title's own ("B1+") first, then the level
    word. Never shown, only matched when someone types "B1". The transcript's
    ease is deliberately not used: measured, it does not separate the levels
    (beginner videos median 0.62, intermediate 0.60), so it would only invent
    codes. A video with neither stays uncoded and is found by its words."""
    m = CEFR_RE.search(title.upper())
    if m:
        return m.group(1) + m.group(2)
    if level in LEVEL_CEFR:
        return LEVEL_CEFR[level]
    return None


def keywords(v, topics, unit_name, chapter_title):
    """The search string: distinct words, most specific first, capped."""
    out, seen = [], set()

    def add(words):
        for w in words:
            w = w.lower().strip()
            if w and w not in seen:
                seen.add(w)
                out.append(w)

    text = v["title"] + " " + " ".join(v.get("tags") or [])
    add(tokens(v["title"]))
    add(fold(w) for w in CYRILLIC.findall(v["title"]))
    grammar = first_hits(text, GRAMMAR)
    if grammar:
        add(["grammar"] + grammar)
    add(first_hits(text, KINDS))
    level = v.get("level")
    if level:
        add([level, level.split("-")[0]])
    for tid in topics:
        add([tid] + tokens(unit_name.get(tid, "")))
    if chapter_title:
        add(tokens(chapter_title))
    add(tokens(v.get("channel", "")))
    add(t for tag in (v.get("tags") or []) for t in tokens(tag))
    add(tokens(v.get("desc", ""))[:40])
    return " ".join(out[:90])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalogue", type=Path,
                    default=ROOT / "data" / "raw" / "youtube" / "catalogue.json")
    ap.add_argument("--transcripts", type=Path, default=ROOT / "data" / "transcripts.json")
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "videos.json")
    ap.add_argument("--min-score", type=int, default=1)
    args = ap.parse_args()

    if not args.catalogue.exists():
        sys.exit(f"no catalogue at {args.catalogue}; run tools/harvest_videos.py first")
    catalogue = json.loads(args.catalogue.read_text(encoding="utf-8"))
    rows = [dict(v) for v in catalogue["videos"]]
    print(f"{len(rows)} videos in the catalogue from {len(catalogue['channels'])} channels")

    kw = {tid: set(words) for tid, _, words in RULES}
    unit_name = {tid: name for tid, name, _ in RULES}

    db = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    units = db.execute("select id, name, kind, ord from topics order by ord").fetchall()
    for tid, name, _, _ in units:
        unit_name[tid] = name
    # What each unit actually teaches, as lemma head-words — the same keys the
    # transcript index uses.
    db.execute("attach database ? as lex", (str(ROOT / "data" / "lexicon.db"),))
    unit_words = {}
    for tid, bare in db.execute(
            "select u.topic_id, l.bare from unit_words u"
            " join lex.lemmas l on l.id = u.lemma_id"):
        unit_words.setdefault(tid, set()).add(bare)
    # A unit's chapter, read off the path the way the app reads it: a spine row
    # opens a chapter and the branches after it belong to that chapter.
    chapter_title = {sid: title for _, title, sid
                     in db.execute("select n, title, spine_id from chapters")}
    chapter_of, current = {}, None
    for _, col, tid in db.execute("select row, col, topic_id from path order by row, col"):
        if col == 0 or current is None:
            current = chapter_title.get(tid, current)
        chapter_of[tid] = current
    db.close()

    # Heard vocabulary per video, from tools/build_transcripts.py.
    heard, tstats = {}, {}
    if args.transcripts.exists():
        data = json.loads(args.transcripts.read_text(encoding="utf-8"))
        heard = {vid: set(words) for vid, words in data.get("index", {}).items()}
        tstats = data.get("stats", {})
        print(f"transcripts available for {len(heard)} videos")

    # --- what each video is about ------------------------------------------
    # Topic units only: a spine unit's words are the commonest in the language,
    # so every video "covers" it, and that says nothing about the video.
    branch_ids = [tid for tid, _, kind, _ in units if kind != "spine"]
    for v in rows:
        spoken = heard.get(v["id"], set())
        scored = []
        for tid in branch_ids:
            words = unit_words.get(tid, set())
            hit = len(words & spoken) if spoken else 0
            cov = hit / len(words) if words else 0
            ts = score_title(v["title"], kw.get(tid, set()))
            if (hit >= 4 and cov >= 0.1) or ts >= 2:
                scored.append((cov + ts * 0.1, tid))
        scored.sort(reverse=True)
        v["topics"] = [tid for _, tid in scored[:3]]
        # The title first, the channel's tags only as a fallback: a channel tags
        # everything "russian for beginners" and titles a video "Intermediate".
        lv = first_hits(v["title"], LEVELS) or first_hits(" ".join(v.get("tags") or []), LEVELS)
        v["level"] = lv[0] if lv else None
        st = tstats.get(v["id"])
        v["ease"] = st["ease"] if st else None
        v["cefr"] = cefr_of(v["title"], v["level"], v["ease"])
        v["kw"] = keywords(v, v["topics"], unit_name,
                           chapter_of.get(v["topics"][0]) if v["topics"] else None)

    # --- one video per unit --------------------------------------------------
    # Rank every (video, unit) pair once, then hand each unit its best unused video
    # so two units never advertise the same clip. A video's claim on a unit is the
    # share of that unit's vocabulary it actually speaks — coverage rather than raw
    # count, so a long video does not win every unit simply by saying more words —
    # with a topical title breaking ties. Title alone is the fallback for a video
    # with no transcript.
    ranked = []
    for v in rows:
        if v.get("dur") and v["dur"] > UNIT_MAX_SEC:
            continue
        spoken = heard.get(v["id"])
        for tid in kw:
            words = unit_words.get(tid) or set()
            title_score = score_title(v["title"], kw[tid])
            hit = len(words & spoken) if (spoken and words) else 0
            coverage = hit / len(words) if words else 0
            if hit >= MIN_HIT:
                ranked.append((coverage * 1000 + title_score * 120, tid,
                               dict(v, hit=hit, coverage=coverage)))
            elif title_score >= args.min_score:
                ranked.append((title_score, tid, dict(v)))
    ranked.sort(key=lambda x: (-x[0], x[2]["title"]))

    by_id = {v["id"]: v for v in rows}
    taken, assigned = set(), {}
    for tid, vid in OVERRIDES.items():
        v = by_id.get(vid)
        if v:
            assigned[tid] = dict(v, score=99)
            taken.add(vid)
        else:
            print(f"  !! override video not in the catalogue: {vid} ({tid})")
    for s, tid, v in ranked:
        if tid in assigned or v["id"] in taken:
            continue
        assigned[tid] = dict(v, score=s)
        taken.add(v["id"])

    # Core stages get the beginner series, in the channel's own order (the listing
    # is newest first, so reverse for a gentle-to-harder progression) — but only
    # an episode that says at least MIN_HIT of the unit's words. The series used
    # to be dealt out regardless, and a chapter's video listed none of its words
    # (the content review, 2026-09-08); no video beats one that says nothing.
    beginner = [v for v in reversed(rows)
                if BEGINNER_RE.search(v["title"]) and v["id"] not in taken]
    cores = [u for u in units if u[2] == "spine"]
    for tid, _name, _kind, _ in cores:
        words = unit_words.get(tid) or set()
        for v in beginner:
            if v["id"] in taken:
                continue
            spoken = heard.get(v["id"]) or set()
            hit = len(words & set(spoken))
            if hit >= MIN_HIT:
                assigned[tid] = dict(v, score=0, hit=hit,
                                     coverage=hit / len(words) if words else 0)
                taken.add(v["id"])
                break

    keep = ("id", "title", "dur", "channel", "score", "hit", "coverage")
    out = {
        "channels": catalogue["channels"],
        "units": {tid: {k: v[k] for k in keep if k in v} for tid, v in assigned.items()},
        "videos": [{"id": v["id"], "title": v["title"], "ch": v.get("channel"),
                    "dur": v.get("dur"), "kw": v["kw"], "topics": v["topics"],
                    "level": v["level"], "ease": v["ease"], "cefr": v.get("cefr"),
                    "upload": v.get("upload"),
                    "chapters": (v.get("chapters") or [])[:12]}
                   for v in rows if heard.get(v["id"])],
    }
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    have = sum(1 for u in units if u[0] in assigned)
    print(f"wrote {args.out}")
    print(f"  library          : {len(out['videos'])} videos with a transcript "
          f"({len(rows) - len(out['videos'])} without, left out)")
    print(f"  units with a video : {have}/{len(units)}")
    print(f"  videos used        : {len(taken)}\n")
    for tid, name, _kind, _ in units:
        v = assigned.get(tid)
        mark = "  " if v else "!!"
        if v and "coverage" in v:
            how = f"{v['hit']:>3} words, {v['coverage']:.0%} of the unit"
        elif v:
            how = "title match      "
        else:
            how = "—"
        detail = f"{v['title'][:42]}" if v else "(no confident match)"
        print(f"{mark} {name:<22} {how:<24} {detail}")
    levels = defaultdict(int)
    for v in out["videos"]:
        levels[v["level"] or "unstated"] += 1
    print(f"\n  levels: {dict(levels)}")
    with_topics = sum(1 for v in out["videos"] if v["topics"])
    print(f"  videos with a unit topic: {with_topics}/{len(out['videos'])}")


if __name__ == "__main__":
    main()

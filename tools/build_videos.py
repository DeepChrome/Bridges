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
# The channel the skeleton prefers (2026-09-29): the most episodes, familiar
# presenters, and made to teach.
EASY_RE = re.compile(r"easy russian", re.I)

# A unit's video is watched inside a lesson; a half-hour vlog is not that.
UNIT_MAX_SEC = 1200
# A video is a unit's episode only if it says this many of the unit's words.
MIN_HIT = 5

# The course's goal videos, chosen from the videos first (tools/build_skeleton.py,
# ROADMAP Phase 14). A unit the skeleton names takes its video from there; the
# matching below is only for a unit it has no video for (Law, Military).
SKELETON = ROOT / "data" / "curated" / "skeleton.json"

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

    # --- the video skeleton ---------------------------------------------------
    # **Each unit works towards one real video** (the owner, 2026-09-29: "the
    # learner works their way towards being able to understand that video… use
    # the videos to help plan the lesson content… prioritize the Easy Russian
    # videos"). A unit's video used to be the one that said most of the unit's
    # own words — topical, and blind to whether a learner at that point could
    # follow it. Now the path is walked in order, the words taught so far are
    # accumulated, and each unit takes the unused video its learner will
    # understand best: `comp` is the share of the video's spoken, resolved
    # words the learner has been taught by the end of the unit. Coverage of the
    # unit's own words still counts, so the video is about what was just
    # learned, and Easy Russian — familiar faces, teaching well — is preferred.
    # Because what is known only grows, the videos harden along the path on
    # their own: that is the progression, not a list somebody keeps.
    counts = {vid: {lemma: len(occ) for lemma, occ in words.items()}
              for vid, words in (json.loads(args.transcripts.read_text(encoding="utf-8")).get("index", {})
                                 if args.transcripts.exists() else {}).items()}
    order = []
    db = sqlite3.connect(f"file:{args.topics}?mode=ro", uri=True)
    for _r, _c, tid in db.execute("select row, col, topic_id from path order by row, col"):
        if tid not in order:
            order.append(tid)
    db.close()
    order += [tid for tid, _, _, _ in units if tid not in order]

    def comprehension(vid, known):
        c = counts.get(vid) or {}
        total = sum(c.values())
        return (sum(n for lemma, n in c.items() if lemma in known) / total) if total else 0

    by_id = {v["id"]: v for v in rows}
    taken, assigned, known = set(), {}, set()
    skeleton = json.loads(SKELETON.read_text(encoding="utf-8")) if SKELETON.exists() else {"chapters": []}
    goal, lesson = {}, {}
    for k, ch in enumerate(skeleton["chapters"]):
        goal[f"core{k + 1}"] = ch["spine"]
        if ch.get("lesson"):
            lesson[f"core{k + 1}"] = ch["lesson"]
        goal.update(ch["quests"])
    taken |= set(goal.values()) | set(lesson.values())

    def pick(tid, words, min_hit):
        best = None
        for v in rows:
            if v["id"] in taken or not counts.get(v["id"]):
                continue
            if v.get("dur") and v["dur"] > UNIT_MAX_SEC:
                continue
            spoken = heard.get(v["id"]) or set()
            hit = len(words & spoken)
            if hit < min_hit:
                continue
            comp = comprehension(v["id"], known)
            cov = hit / len(words) if words else 0
            easy = 0.12 if EASY_RE.search(v.get("channel") or "") else 0
            # Slow, beginner episodes early: comprehension alone cannot see
            # speed, and a street interview is fast whatever words it uses. The
            # pull fades as the learner's vocabulary grows.
            slow = (BEGINNER_RE.search(v["title"]) or re.search(r"\bslow\b", v["title"], re.I)
                    or v.get("level") == "beginner")
            early = 0.2 * max(0.0, 1 - len(known) / 400) if slow else 0
            topical = 0.02 * score_title(v["title"], kw.get(tid, set()))
            score = comp + 0.5 * cov + easy + early + topical
            if best is None or score > best[0]:
                best = (score, v, hit, cov, comp)
        return best

    for tid in order:
        words = unit_words.get(tid) or set()
        known |= words
        if tid in goal and by_id.get(goal[tid]):
            v = by_id[goal[tid]]
            assigned[tid] = dict(v, score=99, comp=round(comprehension(v["id"], known), 3))
            # The chapter's grammar episode, played from the grammar step.
            if tid in lesson and by_id.get(lesson[tid]):
                g = by_id[lesson[tid]]
                assigned[tid]["lesson"] = {"id": g["id"], "title": g["title"], "dur": g.get("dur")}
            continue
        # A narrow side quest (Medicine, Law) is said by fewer videos; three of
        # its words is still a video about it, and no video is worse.
        best = pick(tid, words, MIN_HIT) or pick(tid, words, 3)
        if best:
            score, v, hit, cov, comp = best
            assigned[tid] = dict(v, score=round(score, 3), hit=hit, coverage=cov, comp=round(comp, 3))
            taken.add(v["id"])

    keep = ("id", "title", "dur", "channel", "score", "hit", "coverage", "comp", "lesson")
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
        if v and v.get("score") == 99:
            how = f"skeleton, knows {v['comp']:.0%}"
        elif v and "comp" in v and "hit" in v:
            how = f"knows {v['comp']:.0%}, {v['hit']:>2} unit words"
        elif v and "coverage" in v:
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

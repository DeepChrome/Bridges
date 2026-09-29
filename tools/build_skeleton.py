#!/usr/bin/env python3
"""The video skeleton: every captioned video measured, and the course's goal
videos put in the order a learner should meet them (ROADMAP Phase 14, V1).

The owner, 2026-09-29: the video skeleton is "the framework as well as the
goal of everything" — each unit prepares the learner for one real video, and
the videos run in a logical flow. build_videos.py used to pick a video *for*
each unit after the curriculum was fixed, which is backwards and measured
badly (chapter 1's video was 35 % followable, Family's was about months).
This tool starts from the videos.

What it measures, per video, from the transcript index (build_transcripts.py):

- **vocabulary load** — how far down the frequency list a learner must know
  to follow 90 % (and 95 %) of what is said: `r90`, `r95`. The research on
  comprehensible input puts the threshold for following speech at 90-95 %
  of words known, so this is the number that decides how hard a video is.
- **pace** — words a minute over the video's length.
- what it **teaches** (grammar named in its title) and what it is **about**
  (a topic named in its title), both read off the title, since the owner's
  channels title their episodes plainly ("Russian Instrumental Case",
  "Having Lunch In Slow Russian").

What it proposes: ten chapters in order of difficulty, each anchored on one
spine video — preferring an episode that teaches that chapter's grammar
point — with its side quests the topic videos whose difficulty falls in that
chapter's band. Nothing here is final. It writes a proposal and a report; the
curated file `data/curated/skeleton.json` is what later steps read, and it is
written only with --write, never over a hand-edited one without --force
(rule 20.3: human decisions survive a rebuild).

    python tools/build_skeleton.py                  # measure, propose, report
    python tools/build_skeleton.py --write          # also write the curated file
"""

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TRANSCRIPTS = ROOT / "data" / "transcripts.json"
VIDEOS = ROOT / "data" / "videos.json"
CURATED = ROOT / "data" / "curated" / "skeleton.json"
WORK = ROOT / "data" / "_work"

CHAPTERS = 10
MIN_DUR, MAX_DUR = 150, 20 * 60      # seconds: long enough to be a video, short enough to finish
COVER = 0.9                          # the share of speech a learner should be able to follow
FREE_RANK = 150                      # the commonest words, met from the first lessons whatever the video

# The spine's grammar, chapter by chapter — the order the courses agree on
# (docs/grammar-sequence.md, CLAUDE.md §30e), and the order the grammar cards
# already teach it. A chapter prefers a spine video that teaches its point.
GRAMMAR = ["basics", "present", "gender", "plural", "prepositional",
           "accusative", "past", "aspect", "future", "imperative"]

# What a title says it teaches. Read in order; a title may teach several.
TEACHES = [
    ("basics", r"total beginner|from zero|first (verbs|words|steps)|greeting|introduc|how to describe your day|just started"),
    ("present", r"conjugat|verbs? \(group|basic russian verbs|use russian verbs|first verbs"),
    ("gender", r"gender|masculine|feminine|neuter|adjectives|colou?rs"),
    ("plural", r"plural"),
    ("prepositional", r"prepositional|location|where is"),
    ("accusative", r"accusative"),
    ("genitive", r"genitive"),
    ("dative", r"dative"),
    ("instrumental", r"instrumental"),
    ("past", r"past tense"),
    ("aspect", r"perfective|imperfective|aspect"),
    ("future", r"future"),
    ("imperative", r"imperative|commands?\b|asking someone"),
    ("motion", r"verbs? of motion|идти|\bgo(ing)? to\b"),
    ("numbers", r"numbers?|count(ing)?\b|how much|prices?"),
    ("questions", r"questions"),
]

# The side-quest topics, by the unit ids the path already carries (learner
# state keys on them, rule 20.4). Read off the title only: `kw` carries the
# topics of the words a video happens to say, which is circular here.
TOPICS = {
    "family":   r"family|mother|mum|parents|relatives|grandm|kids|children|wedding",
    "time":     r"\btime\b|days? of (the )?week|months?|calendar|clock|seasons?|new year",
    "food":     r"food|lunch|dinner|cook|pancake|kasha|salad|kitchen|grocer|breakfast|restaurant|caf[eé]|sweet|vegetable|sauce|pizza|oatmeal|tea\b|coffee",
    "school":   r"school|student|university|exam|teacher|classroom",
    "home":     r"\bhome|house|apartment|\bflat\b|dacha|furniture|room\b",
    "clothes":  r"cloth|fashion|what do people wear|shoes|dress",
    "city":     r"\bcity|town|neighbou?rhood|moscow|petersburg|street|metro|shopping",
    "travel":   r"travel|trip|drive|drives|train|airport|abroad|vacation|holiday|countries",
    "body":     r"body|face|hands|beauty|appearance",
    "medicine": r"doctor|hospital|medicine|pharmacy|sick|\bill\b|health",
    "nature":   r"nature|winter|summer|autumn|spring|weather|forest|\bsea\b|mountain|snow|°c|lake",
    "work":     r"\bwork|\bjobs?\b|office|profession|career|boss|burnout",
    "animals":  r"animal|pets?\b|\bdogs?\b|\bcats?\b|\bzoo\b|birds?",
    "emotion":  r"(?<!you.ll )\blove\b|feelings?|emotion|happy|\bsad\b|stress|friends?|\bdate\b",
    "speech":   r"slang|idiom|proverb|phrases|words russians|swear|accent|dialect",
    "business": r"money|business|salary|\bbank|\bbuy|price|cost|rich",
    "military": r"\barmy|\bwar\b|military|soldier",
    "tech":     r"tech|phone|internet|computer|\bapps?\b|laptop|social media|\bcars?\b",
    "sport":    r"sport|football|hockey|\bgym\b|fitness|\bski",
    "art":      r"music|musician|\bart\b|films?\b|movies?|\bsongs?\b|theat|museum|paint",
    "politics": r"politic|freedom|government|election|president",
    "science":  r"science|space|research|scientist|books?",
    "law":      r"\blaws?\b|police|crime|court|legal",
    "religion": r"easter|church|orthodox|religio|\bgod\b|christmas|faith",
}

# Titles that are not something to *understand*: learning to read the letters,
# songs, shadowing drills, the channel talking about itself.
NOT_A_GOAL = re.compile(r"alphabet|pronounc|rules of reading|how to read|shadowing|imitation|"
                        r"\blyrics|learn russian with songs|say ы|podcast trailer", re.I)


def load():
    t = json.loads(TRANSCRIPTS.read_text(encoding="utf-8"))
    lib = json.loads(VIDEOS.read_text(encoding="utf-8"))["videos"]
    return t["index"], t["stats"], lib


def spoken_ranks(index):
    """Frequency ranks read off the videos themselves: how many videos say a
    word, then how often in all. The deck corpus's ranks were tried first and
    miss the closed classes — «что», «это», «он» are shared forms and its
    independent count skips them — so a video looked 12 % unrankable. What a
    learner needs for Russian in the wild is what is said in the wild, and
    counting videos rather than tokens stops one episode that repeats a word
    ninety times from ranking it."""
    docs, total = Counter(), Counter()
    for words in index.values():
        for b, m in words.items():
            docs[b] += 1
            total[b] += len(m)
    return {b: k for k, b in enumerate(sorted(docs, key=lambda b: (-docs[b], -total[b], b)))}


def coverage_rank(counts, ranks, share):
    """The frequency rank a learner must know down to, to follow `share` of the
    words said. Words the lexicon cannot rank count as rare."""
    total = sum(counts.values())
    if not total:
        return None
    rows = sorted((ranks.get(b, 10 ** 6), n) for b, n in counts.items())
    got = 0
    for r, n in rows:
        got += n
        if got >= share * total:
            return r + 1
    return rows[-1][0] + 1


def measure(index, stats, lib, ranks):
    out = []
    for v in lib:
        idx = index.get(v["id"])
        st = stats.get(v["id"])
        if not idx or not st:
            continue
        counts = {b: len(m) for b, m in idx.items()}
        title = v["title"]
        low = title.lower()
        out.append({
            "id": v["id"], "title": title, "ch": v.get("ch"), "dur": v.get("dur") or 0,
            "cefr": v.get("cefr"),
            "tokens": st["tokens"], "lemmas": st["lemmas"],
            "wpm": round(st["tokens"] / max(1, (v.get("dur") or 60) / 60)),
            "r90": coverage_rank(counts, ranks, 0.90),
            "r95": coverage_rank(counts, ranks, 0.95),
            "teaches": [g for g, rx in TEACHES if re.search(rx, low)],
            "about": [k for k, rx in TOPICS.items() if re.search(rx, low)],
            "easy": bool(re.search(r"super easy|slow russian|beginner|comprehensible|tprs|total beginner", low)),
            "counts": counts,
        })
    return out


def eligible(m):
    return (MIN_DUR <= m["dur"] <= MAX_DUR and not NOT_A_GOAL.search(m["title"])
            and m["cefr"] not in ("C1", "C2") and m["r90"] is not None)


def difficulty(pool):
    """One number per video, lower is easier: vocabulary load most, pace next.
    Both on a log scale and standardised over the pool, since a video needing
    the top 2,000 words is not ten times harder than one needing the top 200."""
    def z(xs):
        mu = sum(xs) / len(xs)
        sd = math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs)) or 1
        return [(x - mu) / sd for x in xs]
    load = z([math.log(m["r90"]) for m in pool])
    pace = z([math.log(max(20, m["wpm"])) for m in pool])
    for m, a, b in zip(pool, load, pace):
        m["d"] = round(0.65 * a + 0.35 * b - (0.25 if m["easy"] else 0), 3)


def new_words(m, known, ranks):
    """Content words this video needs beyond what is already known, to reach
    COVER — the most-said first. What a unit built on it would teach."""
    total = sum(m["counts"].values())
    have = sum(n for b, n in m["counts"].items() if b in known or ranks.get(b, 10 ** 6) < FREE_RANK)
    need = []
    for b, n in sorted(m["counts"].items(), key=lambda x: (-x[1], ranks.get(x[0], 10 ** 6))):
        if have >= COVER * total:
            break
        if b in known or ranks.get(b, 10 ** 6) < FREE_RANK:
            continue
        need.append(b)
        have += n
    return need


# Side quests a chapter may carry. Chapter 1 has few: a beginner with eight
# detours before chapter 2 has a menu, not a course (the first proposal did
# exactly that, because the easy topic videos all measure easy).
QUESTS = [2, 2, 2, 3, 3, 3, 3, 2, 2, 2]
# Everyday topics before specialist ones when they cost the same: someone
# living in the language needs food before politics.
EVERYDAY = ["family", "food", "home", "time", "city", "clothes", "work", "school", "travel",
            "body", "medicine", "nature", "animals", "emotion", "speech", "tech", "sport",
            "art", "business", "science", "politics", "law", "religion", "military"]
STREET = re.compile(r"\| easy russian \d+", re.I)
# A title that says it is a lesson, whatever it teaches.
LESSONISH = re.compile(r"lesson|practice russian|grammar|learn russian|vocabulary|tprs|podcast for beginners", re.I)


def propose(pool, ranks):
    """Chapter by chapter, as a learner walks it. Each chapter's spine video is
    the one that best teaches the chapter's grammar at about the chapter's
    difficulty *and costs the fewest new words after everything before it* —
    the second is what makes the order a flow rather than a sort. Its side
    quests are then the topic videos cheapest to reach from there, everyday
    topics first, up to the chapter's share."""
    pool = sorted(pool, key=lambda m: m["d"])
    n = len(pool)
    pos = {m["id"]: i for i, m in enumerate(pool)}
    used, known, chapters = set(), set(), []
    # A grammar episode is reserved first, for the chapter whose point it
    # teaches: the easiest one that teaches it. It is not the goal — only half
    # the chapter points have an episode, and a course whose goals were all
    # lessons *about* Russian would never reach Russian as it is spoken.
    lesson_for = {}
    for g in GRAMMAR:
        eps = [m for m in pool if g in m["teaches"] and m["id"] not in used]
        if eps:
            lesson_for[g] = eps[0]
            used.add(eps[0]["id"])
    topics_left = [t for t in EVERYDAY if t in TOPICS]
    for k in range(CHAPTERS):
        g = GRAMMAR[k]
        centre = (k + 0.5) * n / CHAPTERS

        def spine_score(m):
            s = -0.6 * abs(pos[m["id"]] - centre) / (n / CHAPTERS)
            s -= len(new_words(m, known, ranks)) / 25
            if m["teaches"]:
                s -= 0.4            # a lesson about Russian is not the goal
            if m["easy"]:
                s += 0.4 if k < 5 else 0
            # From the middle of the course on, the goal is Russian as people
            # speak it: the street episodes, not another lesson about Russian.
            if k >= 3 and STREET.search(m["title"]) and "super easy" not in m["title"].lower():
                s += min(1.0, 0.3 * (k - 2))
            if k >= 3 and LESSONISH.search(m["title"]):
                s -= 0.6
            # Two goals in a row from the same beginner series is a series, not a course.
            if chapters and m["title"][:24] == chapters[-1]["spine"]["title"][:24]:
                s -= 0.8
            if m["about"]:
                s -= 0.3            # a topic video is better spent on a side quest
            if not 300 <= m["dur"] <= 900:
                s -= 0.3
            return s
        near = [m for m in pool if m["id"] not in used and abs(pos[m["id"]] - centre) <= 1.5 * n / CHAPTERS]
        cands = sorted(near, key=spine_score, reverse=True)
        spine = cands[0]
        used.add(spine["id"])
        known |= set(new_words(spine, known, ranks))
        chapter = {"n": k + 1, "grammar": g, "spine": spine, "lesson": lesson_for.get(g), "quests": {},
                   "alternates": [c["id"] for c in cands[1:4]]}
        chapters.append(chapter)

        # The last chapter takes whatever is left, so no topic falls off the end.
        room = QUESTS[k] if k < CHAPTERS - 1 else len(topics_left)
        for _ in range(room):
            best = None
            for t in topics_left:
                for m in pool:
                    if t not in m["about"] or m["id"] in used:
                        continue
                    if pos[m["id"]] > centre + 1.5 * n / CHAPTERS and k < CHAPTERS - 1:
                        continue        # not reachable yet
                    cost = len(new_words(m, known, ranks)) / 25 + 0.08 * EVERYDAY.index(t) \
                        + (0.3 if len(m["about"]) > 1 else 0)
                    if best is None or cost < best[0]:
                        best = (cost, t, m)
            if best is None:
                break
            _, t, m = best
            used.add(m["id"])
            topics_left.remove(t)
            known |= set(new_words(m, known, ranks))
            chapter["quests"][t] = m
    return chapters, topics_left

def flow(chapters, ranks):
    """Walk the proposal in order, as a learner would: what each video needs
    beyond everything the videos before it taught. The measure of whether the
    order is a *flow* — a video that needs 200 new words after its
    predecessors is a wall, however easy it looks alone."""
    known = set()
    for c in chapters:
        for kind, m in [("spine", c["spine"])] + [(t, q) for t, q in c["quests"].items()]:
            need = new_words(m, known, ranks)
            m["need"] = len(need)
            m["need_words"] = need[:40]
            known |= set(need)
        c["known"] = len(known)


def report(chapters, orphans, pool):
    lines = ["# The video skeleton — proposal", "",
             f"{len(pool)} videos eligible. `r90`: know the commonest N words to follow 90 % of the speech. "
             f"`new`: content words to learn beyond everything earlier in the course, to follow {COVER:.0%}.", ""]
    for c in chapters:
        s = c["spine"]
        lines.append(f"## Chapter {c['n']} — grammar: {c['grammar']}")
        lines.append("")
        lines.append("| | video | channel | min | wpm | r90 | new | teaches |")
        lines.append("|---|---|---|---|---|---|---|---|")
        def row(label, m):
            return (f"| {label} | [{m['title'][:70].replace('|', '·')}](https://youtu.be/{m['id']}) | {m['ch']} | "
                    f"{round(m['dur'] / 60)} | {m['wpm']} | {m['r90']} | {m.get('need', '')} | "
                    f"{', '.join(m['teaches'])} |")
        lines.append(row("**goal**", s))
        if c.get("lesson"):
            lines.append(row("grammar", c["lesson"]))
        for t, q in c["quests"].items():
            lines.append(row(t, q))
        lines.append("")
    if orphans:
        lines.append(f"Topics with no video named for them: {', '.join(orphans)}.")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write data/curated/skeleton.json")
    ap.add_argument("--force", action="store_true", help="overwrite an existing curated skeleton")
    args = ap.parse_args()

    index, stats, lib = load()
    ranks = spoken_ranks(index)
    measured = measure(index, stats, lib, ranks)
    pool = [m for m in measured if eligible(m)]
    difficulty(pool)
    chapters, orphans = propose(pool, ranks)
    flow(chapters, ranks)

    WORK.mkdir(parents=True, exist_ok=True)
    slim = lambda m: {k: v for k, v in m.items() if k != "counts"}  # noqa: E731
    (WORK / "skeleton_measures.json").write_text(json.dumps(
        [slim(m) for m in sorted(measured, key=lambda m: m.get("d", 99))], ensure_ascii=False, indent=1), encoding="utf-8")
    proposal = {"chapters": [{"n": c["n"], "grammar": c["grammar"], "spine": c["spine"]["id"],
                              "lesson": c["lesson"]["id"] if c.get("lesson") else None,
                              "quests": {t: q["id"] for t, q in c["quests"].items()},
                              "alternates": c["alternates"]} for c in chapters],
                "orphans": orphans}
    (WORK / "skeleton_proposal.json").write_text(json.dumps(proposal, ensure_ascii=False, indent=1), encoding="utf-8")
    (WORK / "skeleton_report.md").write_text(report(chapters, orphans, pool), encoding="utf-8")

    print(f"measured {len(measured)} videos, {len(pool)} eligible as goals")
    for c in chapters:
        s = c["spine"]
        print(f"  ch{c['n']:>2} {c['grammar']:<13} r90 {s['r90']:>5} wpm {s['wpm']:>3} new {s['need']:>3}  {s['title'][:60]}")
        if c.get("lesson"):
            print(f"       (grammar)     {c['lesson']['title'][:70]}")
        for t, q in c["quests"].items():
            print(f"       {t:<13} r90 {q['r90']:>5} wpm {q['wpm']:>3} new {q['need']:>3}  {q['title'][:60]}")
    print(f"  words to learn across the course: {chapters[-1]['known']}")
    if orphans:
        print(f"  topics with no video: {', '.join(orphans)}")
    print(f"  report: {WORK / 'skeleton_report.md'}")

    if args.write:
        if CURATED.exists() and not args.force:
            sys.exit(f"{CURATED} exists and may carry hand edits; pass --force to replace it")
        CURATED.write_text(json.dumps({
            "_comment": ["The course's goal videos, chapter by chapter (ROADMAP Phase 14).",
                         "Proposed by tools/build_skeleton.py, then edited by hand: this file is the decision."],
            "chapters": [{"n": c["n"], "grammar": c["grammar"], "spine": c["spine"]["id"],
                          "lesson": c["lesson"]["id"] if c.get("lesson") else None,
                          "quests": {t: q["id"] for t, q in c["quests"].items()}} for c in chapters],
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  wrote {CURATED}")


if __name__ == "__main__":
    main()

"""Listening passages: a topic, half a minute of it, from the video library.

The listening activity used to play two or three unrelated sentences in a row and
ask what each meant. The owner's complaint (2026-09-10) was exactly right: the
sentences had nothing to do with each other, there was no topic, and there was no
way to hear a bit again. What a listener actually does is hold one subject in mind
for a while, lose the thread, and go back five seconds.

So a passage is a **span of one real video** — 30 to 60 seconds of a native
speaker on one subject — chosen where the curriculum's own words are thickest, and
tied to the chapter that teaches most of them. The app plays it through the
YouTube player it already has, which can seek, so skipping back five seconds costs
nothing.

Choosing the span:

  * Slide a window over the word stream (build_transcripts.words_with_times gives
    every Cyrillic word with its millisecond).
  * Score it by how many DISTINCT curriculum words it says. Distinct, because a
    speaker repeating one word for thirty seconds is not a rich passage.
  * Keep the best few per video, never overlapping, so one video yields several
    passages rather than one window and its neighbours.

Placing it on the route — and why this tool does NOT do that. The first cut
assigned each passage the chapter by which most of its words are taught, and the
result said something worth keeping: chapters 1 to 3 got four passages between
them, chapter 10 got 345. Forty-five seconds of a native speaker simply uses more
words than a beginner has, and no threshold fixes that; it is the intermediate
plateau in one measurement.

So a passage is shipped with the curriculum words it says and nothing more, and
the **app** ranks passages by how many of them this learner has actually met. A
beginner is not asked to understand everything — the questions are about what was
caught, which is a real skill at any level and the only thing auto-captions can
honestly support. Nobody is handed a passage and told they should have followed
it.

Writes data/listening.json; build_site.py ships it. Re-runnable and idempotent.
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import Resolver, fold                      # noqa: E402
from build_transcripts import words_with_times        # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SUBS = ROOT / "data" / "raw" / "subs"

# A passage is this long. Under thirty seconds there is no thread to lose; over a
# minute a learner cannot hold the questions in mind while listening.
SPAN_MS = 45_000
MIN_MS = 30_000
MAX_MS = 60_000
# How far the window steps as it slides. Five seconds is the same unit the player
# skips by, so every span starts where a learner could have skipped to.
STEP_MS = 5_000
# At most this many passages from one video, and they may not overlap.
PER_VIDEO = 3
# A passage must say at least this many distinct curriculum words to be worth
# hearing at all. Which learner it suits is the app's business, not this tool's.
MIN_WORDS = 12
# Only for the build's own report: the chapter by which this share of a passage's
# words has been taught. Not shipped, and not a gate.
COVERAGE = 0.8


def paradigm_index(lexicon_path, unit_of):
    """folded form -> the curriculum lemmas whose PARADIGM holds it.

    `forms` and `paradigm` are not the same table, and the app rebuilds its
    tables from the latter. A form present in one and absent from the other is
    how a spoken «его» could still be offered as a word «он» did not say, even
    after the resolver's own candidates were taken into account.
    """
    db = sqlite3.connect(f"file:{lexicon_path}?mode=ro", uri=True)
    bare_of = dict(db.execute("select id, bare from lemmas"))
    out = {}
    for lid, accented in db.execute(
            "select lemma_id, accented from paradigm"
            " where accented is not null and accented <> ''"):
        bare = bare_of.get(lid)
        if bare is None or bare not in unit_of:
            continue
        out.setdefault(fold(accented), set()).add(bare)
    db.close()
    return out


def load_units(topics_path, lexicon_path):
    """-> (unit order, {unit id: chapter index}, {bare: unit id}) from topics.db."""
    db = sqlite3.connect(f"file:{topics_path}?mode=ro", uri=True)
    db.execute("attach database ? as lx", (str(lexicon_path),))
    order = [r[0] for r in db.execute("select id from topics order by ord")]
    chapter = {}
    n = -1
    for tid, kind in db.execute("select id, kind from topics order by ord"):
        if kind == "spine":
            n += 1
        chapter[tid] = max(0, n)
    unit_of = {}
    for bare, tid in db.execute(
            "select l.bare, u.topic_id from unit_words u join lx.lemmas l on l.id=u.lemma_id"):
        unit_of[bare] = tid
    db.close()
    return order, chapter, unit_of


def spans_for(stream, resolver, unit_of, chapter, par_index):
    """Every candidate window in one video, best first.

    -> [{start, end, words: {bare: [ms]}, chapter}]
    """
    if not stream:
        return []
    out = []
    last = stream[-1][1]
    start = 0
    while start + MIN_MS <= last:
        end = start + SPAN_MS
        words = {}
        # Curriculum words that MIGHT have been said: every lemma the resolver
        # lists as a candidate for a form spoken here but could not settle, or
        # settled to something outside the units. The questions need it. A wrong
        # option is "a word you know that this passage does not say", and reading
        # that off `words` alone called every unsettled form unspoken — «его» is
        # heard, «он» is offered as not said, and the learner is marked wrong for
        # hearing correctly. A quarter of the questions, measured. Shipping the
        # candidates rather than every surface form keeps it small.
        maybe = set()
        for tok, at in stream:
            if at < start:
                continue
            if at >= end:
                break
            key = fold(tok)
            # Anything this form could belong to, from both tables.
            maybe |= par_index.get(key, set())
            for c in resolver.candidates(key):
                if c["bare"] in unit_of:
                    maybe.add(c["bare"])
            # The shared-form rule, the same one the pools and the lookup index
            # use (panel.py Resolver) — a form belongs to one lemma or to none.
            cand, ambiguous = resolver.owner(key)
            if cand is None or ambiguous or cand["bare"] not in unit_of:
                continue
            words.setdefault(cand["bare"], []).append(at)
        if len(words) >= MIN_WORDS:
            # Diagnostic only (see the docstring): where this passage would land
            # if it were assigned a chapter, which is what the build reports.
            chapters = sorted(chapter[unit_of[b]] for b in words)
            at_index = min(len(chapters) - 1, int(len(chapters) * COVERAGE))
            out.append({"start": start, "end": min(end, last + 1500),
                        "words": words, "maybe": maybe,
                        "chapter": chapters[at_index]})
        start += STEP_MS
    out.sort(key=lambda s: (-len(s["words"]), s["start"]))
    # Non-overlapping, best first.
    kept = []
    for s in out:
        if all(s["end"] <= k["start"] or s["start"] >= k["end"] for k in kept):
            kept.append(s)
        if len(kept) == PER_VIDEO:
            break
    kept.sort(key=lambda s: s["start"])
    return kept


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--videos", type=Path, default=ROOT / "data" / "videos.json")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "listening.json")
    ap.add_argument("--report", action="store_true", help="print every passage found")
    args = ap.parse_args()

    db = sqlite3.connect(f"file:{args.lexicon}?mode=ro", uri=True)
    db.execute("attach database ? as c", (str(args.corpus),))
    resolver = Resolver(db)
    order, chapter, unit_of = load_units(args.topics, args.lexicon)
    par_index = paradigm_index(args.lexicon, unit_of)

    catalogue = json.loads(args.videos.read_text(encoding="utf-8"))
    library = {v["id"]: v for v in catalogue.get("videos", [])}

    passages, skipped = [], {"no captions": 0, "too thin": 0}
    for vid, meta in library.items():
        path = SUBS / f"{vid}.ru-orig.json3"
        if not path.exists():
            skipped["no captions"] += 1
            continue
        stream = words_with_times(path)
        found = spans_for(stream, resolver, unit_of, chapter, par_index)
        if not found:
            skipped["too thin"] += 1
            continue
        for k, s in enumerate(found):
            passages.append({
                "id": f"{vid}-{k}",
                "v": vid,
                "title": meta.get("title", ""),
                "ch": meta.get("ch", ""),
                "start": s["start"],
                "end": s["end"],
                # Bare word -> the milliseconds it was said at, for the questions
                # and for "you missed this one, here is where".
                "words": {b: sorted(ms) for b, ms in s["words"].items()},
                # …and the ones that may have been said but could not be pinned
                # to a lemma. Never an answer; never a wrong option either.
                "maybe": sorted(b for b in s["maybe"] if b not in s["words"]),
            })
            # Kept out of the payload; the report below is its only reader.
            passages[-1]["_chapter"] = s["chapter"]
    db.close()

    passages.sort(key=lambda p: (p["_chapter"], -len(p["words"])))
    by_chapter = {}
    for p in passages:
        by_chapter.setdefault(p["_chapter"], []).append(p["id"])

    shipped = [{k: v for k, v in p.items() if not k.startswith("_")} for p in passages]
    args.out.write_text(json.dumps({"passages": shipped}, ensure_ascii=False),
                        encoding="utf-8")
    print(f"wrote {args.out}")
    print(f"  videos       : {len(library)} in the library, "
          f"{len(library) - skipped['no captions'] - skipped['too thin']} usable "
          f"({skipped['no captions']} without captions, {skipped['too thin']} too thin)")
    print(f"  passages     : {len(passages)}, {SPAN_MS // 1000}s each, "
          f"at most {PER_VIDEO} a video")
    if passages:
        counts = [len(p["words"]) for p in passages]
        print(f"  words said   : {min(counts)}-{max(counts)} curriculum words a passage, "
              f"median {sorted(counts)[len(counts) // 2]}")
    # Diagnostic, not a shipped field: where each passage would land if it were
    # assigned a chapter. The skew toward the late chapters is the point — native
    # speech is not beginner input, and the app ranks by what the learner knows
    # rather than pretending otherwise (see the docstring).
    print("  would land in: " + "  ".join(
        f"{c + 1}:{len(by_chapter.get(c, []))}" for c in range(len(set(chapter.values())))))
    print(f"  size         : {args.out.stat().st_size / 1_048_576:.2f} MB")
    if args.report:
        for p in passages[:40]:
            print(f"  ch{p['_chapter'] + 1:>2} {p['start'] // 1000:>4}s "
                  f"{len(p['words']):>3} words  {p['title'][:54]}")


if __name__ == "__main__":
    main()

"""Index the harvested captions: which lemma was said in which video, and when.

YouTube's auto-captions come back as json3 with per-word offsets, so every spoken
word can be pinned to a moment rather than to a caption block. Each token is folded
and resolved through the lexicon's form->lemma index, which is what lets a lesson
word be found in the video even when it is spoken in a different case.

Resolution is the honest part. 8,404 form keys belong to more than one lemma, and
they carry 16 % of everything said: «нет» is a form of «житься» in OpenRussian,
«просто» of «простой», «уже» of «узкий». Taking the first lemma the lexicon
happened to list put words under videos that never say them — the owner tapped a
chip and heard something else. A form now goes to one lemma only when that lemma
clearly owns it (see `resolve`); otherwise the moment is dropped. Precision over
recall: a word listed under a video must be in the video.

Only the index is kept — lemma to a list of moments. The caption text itself is not
stored or shipped: the app needs to know *when* a word was said, not to reproduce
the transcript.

    python tools/build_transcripts.py            # index every video in the catalogue
    python tools/build_transcripts.py --audit    # also print how ambiguous forms went

The captions themselves are fetched by tools/harvest_videos.py.
"""

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from panel import fold, Resolver  # noqa: E402

SUBS = ROOT / "data" / "raw" / "subs"
CATALOGUE = ROOT / "data" / "raw" / "youtube" / "catalogue.json"
TOKEN = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")

# The corpus's top thousand lemmas count as common when judging a video's ease.
TOP_RANK = 1000


def words_with_times(path):
    """-> [(token, absolute_ms)] for every Cyrillic word in the transcript.

    Auto-captions roll: the same word is re-emitted as the caption scrolls, so a
    word repeated within a second of itself is one utterance, not two. Collapsing
    here rather than later keeps the surrounding context readable — otherwise every
    snippet stutters.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for ev in data.get("events", []):
        segs = ev.get("segs")
        if not segs:
            continue
        base = ev.get("tStartMs", 0)
        for s in segs:
            text = s.get("utf8", "")
            if not text.strip():
                continue
            at = base + s.get("tOffsetMs", 0)
            for m in TOKEN.finditer(text):
                tok = m.group(0)
                if out and out[-1][0] == tok and at - out[-1][1] <= 1000:
                    continue
                out.append((tok, at))
    return out


def snippet(stream, i, before=4, after=5):
    """The words either side of one occurrence — what was actually being said.

    Auto-captions carry no punctuation, so a fixed window is the honest unit: it is
    presented as "what you heard around this word", not as a sentence.
    """
    lo = max(0, i - before)
    words = [w for w, _ in stream[lo:i + after + 1]]
    text = " ".join(words)
    if lo > 0:
        text = "… " + text
    if i + after + 1 < len(stream):
        text = text + " …"
    return text


def load_lexicon(lex_path, corpus_path):
    """-> (Resolver, bare -> frequency rank). The form -> lemma rule itself lives
    in panel.py (resolve), shared with the pool count and the lookup index."""
    db = sqlite3.connect(f"file:{lex_path}?mode=ro", uri=True)
    db.execute("attach database ? as c", (str(corpus_path),))
    r = Resolver(db)
    bare_of = dict(db.execute("select id, bare from lemmas"))
    db.close()
    ranks = {bare_of[lid]: k for k, lid
             in enumerate(sorted(r.indep, key=lambda x: -r.indep[x]))}
    return r, ranks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--catalogue", type=Path, default=CATALOGUE)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "transcripts.json")
    ap.add_argument("--audit", action="store_true", help="print how the commonest ambiguous forms resolved")
    args = ap.parse_args()

    if not args.catalogue.exists():
        sys.exit(f"no catalogue at {args.catalogue}; run tools/harvest_videos.py first")
    catalogue = json.loads(args.catalogue.read_text(encoding="utf-8"))
    videos = [v["id"] for v in catalogue["videos"]]
    print(f"{len(videos)} videos in the catalogue")

    resolver, ranks = load_lexicon(args.lexicon, args.corpus)
    owners = resolver.cands
    print(f"  lexicon index: {len(owners):,} forms")

    index, stats, per_video = {}, Counter(), {}
    decided, dropped = Counter(), Counter()
    cache = {}
    for vid in videos:
        path = SUBS / f"{vid}.ru-orig.json3"
        if not path.exists():
            stats["no transcript"] += 1
            continue
        pairs = words_with_times(path)
        if not pairs:
            stats["empty"] += 1
            continue
        hits = defaultdict(list)
        easy = 0
        for i, (token, at) in enumerate(pairs):
            key = fold(token)
            if key not in cache:
                cand, ambiguous = resolver.owner(key)
                cache[key] = (cand["bare"] if cand else None, ambiguous)
            lemma, ambiguous = cache[key]
            if lemma is None:
                if ambiguous:
                    dropped[key] += 1
                continue
            if ambiguous:
                decided[(key, lemma)] += 1
            hits[lemma].append((at, token, i))
            if ranks.get(lemma, 10 ** 6) < TOP_RANK:
                easy += 1
        if not hits:
            stats["no matches"] += 1
            continue
        # Timings sorted, and near-duplicates within a second collapsed — the same
        # word repeated in one breath is one moment to replay, not three.
        #
        # Each kept moment carries the form actually spoken and the words around it.
        # The learner asked "where did I hear this?", and a bare timestamp does not
        # answer that until the video has already jumped.
        index[vid] = {}
        for lemma, occs in hits.items():
            occs.sort()
            keep = []
            for at, token, i in occs:
                if keep and at - keep[-1]["t"] <= 1000:
                    continue
                keep.append({"t": at, "w": token, "s": snippet(pairs, i)})
            index[vid][lemma] = keep
        # How much of the video is common words: the share of spoken tokens whose
        # lemma is in the corpus's top thousand. A rough, honest ease figure.
        per_video[vid] = {"tokens": len(pairs), "lemmas": len(hits),
                          "ease": round(easy / len(pairs), 3)}
        stats["indexed"] += 1
        stats["words"] += len(pairs)
        stats["lemmas"] += len(hits)

    args.out.write_text(json.dumps({"index": index, "stats": per_video},
                                   ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")

    n_decided, n_dropped = sum(decided.values()), sum(dropped.values())
    print(f"\nwrote {args.out}")
    print(f"  videos indexed   : {stats['indexed']}/{len(videos)}")
    if stats["no transcript"]:
        print(f"  no transcript    : {stats['no transcript']}")
    print(f"  words heard      : {stats['words']:,}")
    print(f"  lemma slots      : {stats['lemmas']:,}")
    print(f"  ambiguous forms  : {n_decided:,} credited, {n_dropped:,} dropped "
          f"({n_dropped / max(1, stats['words']):.1%} of words)")
    if stats["indexed"]:
        print(f"  distinct lemmas per video (median): "
              f"{sorted(len(v) for v in index.values())[len(index) // 2]}")
    print(f"  file size        : {args.out.stat().st_size / 1_048_576:.2f} MB")
    if args.audit:
        print("\n  credited (form -> lemma, times):")
        for (key, lemma), n in decided.most_common(40):
            print(f"    {n:>6}  {key:<14} -> {lemma}")
        print("\n  dropped as ambiguous (form, times, candidates):")
        for key, n in dropped.most_common(30):
            cands = ", ".join(f"{c['bare']} ({c['pos']} {c['n']})" for c in owners[key][:4])
            print(f"    {n:>6}  {key:<14}  {cands}")


if __name__ == "__main__":
    main()

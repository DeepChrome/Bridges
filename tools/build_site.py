"""Generate the standalone app: lookup, flashcards, learning path, status.

Bakes the lexicon subset, the study units and the path layout into one
self-contained HTML file. No server, no external requests.

    python tools/build_site.py --lemmas 4000
"""

import argparse
import hashlib
import io
import json
import re
import shutil
import sqlite3
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import build_tables, fold  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent

# Part of speech is one letter in the deep-dictionary blob — 46,000 rows makes the
# spelled-out word expensive. Must stay in step with POS_CODE in core/search.js.
POS_LETTER = {
    "noun": "n", "verb": "v", "adjective": "a", "adverb": "d", "pronoun": "p",
    "preposition": "r", "conjunction": "c", "particle": "t", "numeral": "m",
    "interjection": "i", "possessive": "s",
}


ACC_MARKS = "́̀"
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _plain(s):
    return "".join(c for c in s if c not in ACC_MARKS)


def _stress_index(s):
    """Where the stress sits in the unaccented string, or -1 for none.

    Reconstruction is exact for 764,755 of the lexicon's 764,916 paradigm forms;
    the 161 with a secondary stress are carried verbatim as overrides rather than
    approximated.
    """
    i = -1
    for ch in s:
        if ch in ACC_MARKS:
            return i
        i += 1
    return -1


def build_dictionary(db, sentences, items_of_key, keys_of, stats,
                     ext_sentences=None, ext_items_of_key=None):
    """Every glossed lemma, with its paradigm and its sentences.

    The curriculum ships ~4,000 lemmas in full. The lexicon holds 58,844, and an
    entry that says "no paradigm for this one" is not a dictionary entry — so every
    glossed lemma gets its declension or conjugation here.

    Shipping those tables naively costs 19 MB. They compress to about a tenth of
    that because Russian endings repeat: 41,087 paradigms are built from 3,166
    distinct sets of endings. Each lemma therefore stores a stem length, a shape id,
    and one character of stress per form — the shape table carries the endings once.

    Every count here is printed by the build, so a stale number in this docstring is
    a discrepancy you can see rather than one you have to measure.
    """
    meta = {}
    for lid, bare, acc, pos, gender, animate, aspect, partner, en in db.execute(
            "select id, bare, accented, pos, gender, animate, aspect, partner, en"
            " from lemmas where en is not null and en <> ''"):
        meta[lid] = {"b": bare, "w": acc or bare, "p": pos, "g": gender,
                     "an": animate, "a": aspect, "pt": partner, "e": en}

    par = {}
    for lid, slot, acc in db.execute(
            "select lemma_id, slot, accented from paradigm"
            " where accented is not null and accented <> ''"):
        if lid in meta:
            par.setdefault(lid, {}).setdefault(slot, [])
            if acc not in par[lid][slot]:
                par[lid][slot].append(acc)

    # Sentences from his own decks, for every glossed lemma that has one — 7,488 of
    # them, where only the studied 4,000 were reachable before. Pooled and
    # referenced, since one sentence often illustrates several words.
    pool, pool_at = [], {}
    def sentence_ref(iid):
        if iid not in pool_at:
            ru, en_s, deck, has_audio = sentences[iid]
            pool_at[iid] = len(pool)
            # Fifth field is the outside source, empty for his own decks. The app
            # labels whatever it is told rather than knowing any source by name.
            pool.append([ru, en_s, deck, 1 if has_audio else 0, ""])
        return pool_at[iid]

    def ext_ref(xid):
        """Same pool, keyed apart so an external id cannot collide with an item id."""
        key = ("x", xid)
        if key not in pool_at:
            ru, en_s, src = ext_sentences[xid]
            pool_at[key] = len(pool)
            pool.append([ru, en_s, src, 0, src])
        return pool_at[key]

    slot_names, slot_at = [], {}
    shapes, shape_at = [], {}
    lines = []
    ext_only = 0            # words whose only example comes from outside his decks

    for lid in sorted(meta, key=lambda x: meta[x]["b"]):
        m = meta[lid]
        bare = m["b"]
        slots = par.get(lid, {})

        shape_id, stem_len, stress, overrides = "", "", "", []
        if slots:
            flat = {s: [_plain(v) for v in vs] for s, vs in slots.items()}
            stem = bare
            for forms in flat.values():
                for f in forms:
                    n = 0
                    while n < len(stem) and n < len(f) and stem[n] == f[n]:
                        n += 1
                    stem = stem[:n]
            stem_len = B36[len(stem)] if len(stem) < 36 else B36[0]
            if len(stem) >= 36:
                stem = ""

            key_parts, marks = [], []
            for s in sorted(slots):
                if s not in slot_at:
                    slot_at[s] = len(slot_names)
                    slot_names.append(s)
                key_parts.append((slot_at[s], tuple(f[len(stem):] for f in flat[s])))
                for k, raw in enumerate(slots[s]):
                    idx = _stress_index(raw)
                    if sum(raw.count(c) for c in ACC_MARKS) > 1 or idx >= 36:
                        overrides.append(f"{slot_at[s]}.{k}={raw}")
                        marks.append("-")
                    elif idx < 0:
                        marks.append("-")
                    else:
                        marks.append(B36[idx])
            shape_key = tuple(key_parts)
            if shape_key not in shape_at:
                shape_at[shape_key] = len(shapes)
                shapes.append(shape_key)
            shape_id = str(shape_at[shape_key])
            stress = "".join(marks)

        # His own decks first, always. A Tatoeba sentence is attested Russian but it
        # is not material he has studied, so it fills the remaining slots rather than
        # competing for the first one.
        keys = keys_of.get(lid, ())
        refs = []
        for iid in sorted({i for k in keys for i in items_of_key.get(k, ())
                           if i in sentences})[:4]:
            refs.append(str(sentence_ref(iid)))
        own = len(refs)
        if ext_items_of_key and len(refs) < 4:
            spare = 4 - len(refs)
            for xid in sorted({x for k in keys for x in ext_items_of_key.get(k, ())
                               if x in ext_sentences})[:spare]:
                refs.append(str(ext_ref(xid)))
        if refs and not own:
            ext_only += 1

        lines.append("\t".join([
            bare,
            "" if m["w"] == bare else m["w"],
            POS_LETTER.get(m["p"], m["p"] or ""),
            m["g"] or "",
            m["a"] or "",
            m["pt"] or "",
            (m["e"] or "").replace("\t", " "),
            stem_len,
            shape_id,
            stress,
            ",".join(refs),
            ";".join(overrides),
        ]))

    shape_blob = "\n".join(
        "\t".join(str(si) + ":" + "/".join(ends) for si, ends in sh) for sh in shapes)

    # The app now lays paradigm tables out in JavaScript, because it has to do it for
    # words whose tables were never built here. panel.py still owns the layout for
    # the CLI, so the two could drift — this sample is what stops that silently:
    # core.test.mjs asserts the JS output matches these tables exactly.
    sample = []
    for lid in sorted(meta, key=lambda x: meta[x]["b"]):
        m = meta[lid]
        if not par.get(lid):
            continue
        if len(sample) >= 60:
            break
        if len(sample) % 4 == 0 or m["p"] in ("verb", "adjective", "pronoun"):
            sample.append({"b": m["b"], "p": m["p"],
                           "t": build_tables(m["p"], par[lid])})
    stats["tsample"] = len(sample)

    stats["deep"] = len(lines)
    stats["deep_paradigms"] = sum(1 for x in lines if x.split("\t")[8])
    stats["deep_examples"] = sum(1 for x in lines if x.split("\t")[10])
    stats["deep_ext_only"] = ext_only
    stats["deep_sentences"] = len(pool)
    stats["shapes"] = len(shapes)
    return "\n".join(lines), shape_blob, slot_names, pool, sample


# A word the units never teach may still appear in a pool sentence if it is this
# common — «не», «и», «в», «что»: met on every screen from the first lesson. Anything
# rarer and untaught makes the sentence unavailable to every unit. 500 was chosen by
# measuring: at 300 the second chapter has 27 speakable sentences, at 500 it has 42
# and the first chapter 48; at 0 the first chapter has 8.
COVERAGE_FREE_RANK = 500


def measure_sentences(sentences, sent_tokens, index, key_units, lemmas, unit_pos,
                      audio, src_of, stats):
    """How hard each corpus sentence is, and where in the curriculum it belongs.

    difficulty = 1 - studied/tokens, where a token is studied if its folded form
    is in the lookup index — i.e. it resolves to one of the shipped lemmas.

    unit is where the sentence becomes sayable: the *latest* unit (by path order)
    teaching any of its lemmas, provided every other token is also taught by some
    unit or is within COVERAGE_FREE_RANK by frequency. A sentence with one word the
    curriculum never teaches has no unit at all. It used to be enough for the
    latest taught word to be in the unit, and «Абсолютно ничто не может оправдать
    такие действия» landed in the second chapter's quiz because «не» and «может»
    are taught there and the four words nobody had taught did not count.

    Returns one record per English-paired sentence with tokens:
      (ru, en, n_tokens, difficulty, unit_index_or_None, audio_file_or_None, src)
    The pools the speaking and listening activities draw from are cut from this.
    """
    out = []
    for iid, (ru, en, _deck, _has) in sentences.items():
        toks = sent_tokens.get(iid)
        if not toks:
            continue
        n = len(toks)
        studied = sum(1 for k in toks if k in index)
        unit, covered = None, True
        for k in toks:
            taught = key_units.get(k)
            if taught:
                latest = max(taught, key=lambda u: unit_pos.get(u, -1))
                if unit is None or unit_pos.get(latest, -1) > unit_pos.get(unit, -1):
                    unit = latest
                continue
            hit = index.get(k)
            fr = lemmas[hit[0]].get("fr") if hit else None
            if not (fr and fr <= COVERAGE_FREE_RANK):
                covered = False
                break
        fname = audio.get(fold(ru))
        out.append((ru, en, n, 1 - studied / n, unit if covered else None,
                    fname, src_of.get(fname, "") if fname else ""))

    # Buckets match the pool thresholds, so the report answers the question the
    # pools ask: how much of the corpus is within reach at each cut.
    edges = [(0.0, "= 0"), (0.2, "≤ 0.2"), (0.35, "≤ 0.35"), (0.5, "≤ 0.5"),
             (0.75, "≤ 0.75"), (1.01, "> 0.75")]
    hist = Counter()
    for r in out:
        for edge, label in edges:
            if r[3] <= edge:
                hist[label] += 1
                break
    stats["sentences_measured"] = len(out)
    stats["sentences_with_unit"] = sum(1 for r in out if r[4] is not None)
    stats["sentences_with_audio"] = sum(1 for r in out if r[5])
    stats["difficulty_hist"] = [(label, hist[label]) for _, label in edges]
    return out


# One letter per source in the shipped rows, so an activity can tell a human
# recording from a synthetic one without a lookup. Matches build_audio.py's names.
SRC_CODE = {"tatoeba": "t", "lof": "l", "yandex": "y", "core5000": "c",
            "googletts": "g", "other": "o"}

# The video library (build_videos.py): how many curriculum words a video lists to
# listen for, how many moments each, and the frequency rank below which a word is
# a function word rather than something to listen for.
VIDEO_WORDS = 20
VIDEO_MOMENTS = 3
VIDEO_SKIP_TOP = 150

SPEAK_TOKENS = (3, 12)
LISTEN_TOKENS = (4, 15)
LISTEN_EXCLUDE = ("googletts", "other")
POOL_MIN_PER_UNIT = 15


def build_pools(measured, units, stats):
    """The sentences the speaking and listening activities draw from, by unit.

    Cut from measure_sentences() output rather than the dictionary's sentence pool:
    that pool holds whatever illustrates a word, capped four per lemma, while these
    need every sentence a learner at a given point could be asked to say — with a
    recording to compare against and an English side to prompt with. A sentence's
    unit is where it becomes sayable (measure_sentences); the app draws a quiz's
    prompts from every unit up to that point, so a unit's own list is what it adds
    to the pool, not all a learner there may be asked. Early units add little —
    the counts below say how little — and the app asks nothing rather than
    something too hard when there is nothing.

    Shipped as one shared row list plus per-unit index lists, so a sentence in both
    pools is stored once. Rows: [ru, en, tokens, difficulty, source letter]. The
    audio key is fold(ru), which the app already derives — not shipped.
    """
    rows, at = [], {}

    def row_for(rec):
        ru, en, n, diff, unit, fname, src = rec
        if ru not in at:
            at[ru] = len(rows)
            rows.append([ru, en, n, round(diff, 2), SRC_CODE.get(src, "o")])
        return at[ru]

    speak = {}
    for rec in measured:
        ru, en, n, diff, unit, fname, src = rec
        if unit is None or not fname or not en:
            continue
        if SPEAK_TOKENS[0] <= n <= SPEAK_TOKENS[1]:
            speak.setdefault(units[unit]["id"], []).append(row_for(rec))

    stats["speak_pool"] = {uid: len(v) for uid, v in speak.items()}
    stats["speak_short"] = sorted(u["id"] for u in units
                                  if len(speak.get(u["id"], ())) < POOL_MIN_PER_UNIT)

    # Listening: a little harder and a little longer, and the recording must be one
    # worth transcribing. Google TTS (32 kbps, 24 kHz) is excluded on quality; so is
    # "other", whose provenance is unknown. Core 5000 stays in: its 64 kbps / 48 kHz
    # matches Yandex, and whether a human or a voice recorded it is unverified rather
    # than known to be synthetic — the count without it is reported alongside so the
    # owner can pull it if that matters.
    listen, listen_human_yandex = {}, 0
    for rec in measured:
        ru, en, n, diff, unit, fname, src = rec
        if unit is None or not fname or not en or src in LISTEN_EXCLUDE:
            continue
        if LISTEN_TOKENS[0] <= n <= LISTEN_TOKENS[1]:
            listen.setdefault(units[unit]["id"], []).append(row_for(rec))
            if src in ("tatoeba", "lof", "yandex"):
                listen_human_yandex += 1

    stats["listen_pool"] = {uid: len(v) for uid, v in listen.items()}
    stats["listen_without_core5000"] = listen_human_yandex
    stats["listen_short"] = sorted(u["id"] for u in units
                                   if len(listen.get(u["id"], ())) < POOL_MIN_PER_UNIT)
    return {"rows": rows, "speak": speak, "listen": listen}


def gather(lex_path, corpus_path, topics_path, n_lemmas, n_examples):
    db = sqlite3.connect(f"file:{lex_path}?mode=ro", uri=True)
    db.execute("attach database ? as c", (str(corpus_path),))
    db.execute("attach database ? as t", (str(topics_path),))

    stats = {
        "built": datetime.now().strftime("%d %b %Y"),
        "sentences": db.execute(
            "select count(*) from c.items where kind='sentence'").fetchone()[0],
        "vocab": db.execute(
            "select count(*) from c.items where kind='vocab'").fetchone()[0],
        "audio": db.execute(
            "select count(*) from c.items where audio is not null").fetchone()[0],
        "tokens": db.execute("select count(*) from c.item_tokens").fetchone()[0],
        "lemmas": db.execute("select count(*) from lemmas").fetchone()[0],
        "forms": db.execute("select count(distinct key) from forms").fetchone()[0],
        "decks": [{"name": n, "cards": c} for n, c in db.execute(
            "select substr(name,1,instr(name||'::','::')-1) x, sum(card_count)"
            " from c.decks group by x having sum(card_count)>0 order by 2 desc")],
    }
    stats["distinct_forms"] = db.execute(
        "select count(distinct key) from c.item_tokens").fetchone()[0]
    cov_f, cov_t = db.execute("""
        select (select count(*) from (select distinct key from c.item_tokens
                                      where key in (select key from forms))),
               (select count(*) from c.item_tokens where key in (select key from forms))
    """).fetchone()
    stats["cov_forms"], stats["cov_tokens"] = cov_f, cov_t

    # --- candidate lemmas: everything a unit uses, plus the commonest ------
    unit_lemmas = [r[0] for r in db.execute("select distinct lemma_id from t.unit_words")]
    top = [r[0] for r in db.execute("""
        select f.lemma_id from c.item_tokens tk join forms f on f.key = tk.key
        group by f.lemma_id order by count(*) desc limit ?
    """, (n_lemmas,))]
    order, seen = [], set()
    for lid in top + unit_lemmas:
        if lid not in seen:
            seen.add(lid)
            order.append(lid)

    corpus_n = dict(db.execute("""
        select f.lemma_id, count(*) from c.item_tokens tk join forms f on f.key = tk.key
        group by f.lemma_id
    """))

    # Every glossed lemma, not just the curriculum's: build_dictionary reaches these
    # to find example sentences, and filtering to `seen` silently capped the deep
    # tier's sentences at the 4,000 studied words. Bounded to lemmas that can produce
    # output — all 58,844 would hold 567,526 form keys for nothing.
    glossed = {r[0] for r in db.execute(
        "select id from lemmas where en is not null and en <> ''")}
    keep = seen | glossed
    keys_of = {}
    for lid, k in db.execute("select lemma_id, key from forms"):
        if lid in keep:
            keys_of.setdefault(lid, set()).add(k)

    sentences = {}
    for iid, ru, en_s, deck, audio in db.execute(
            "select i.id, i.ru, i.en, d.name, i.audio from c.items i"
            " left join c.decks d on d.id=i.deck_id"
            " where i.kind='sentence' and i.en is not null"):
        sentences[iid] = (ru, en_s, (deck or "?").split("::")[0], audio is not None)

    items_of_key = {}
    for k, iid in db.execute("select key, item_id from c.item_tokens"):
        if iid in sentences:
            items_of_key.setdefault(k, []).append(iid)

    # Tatoeba examples, when tools/ingest_tatoeba.py has built them. Its own database
    # rather than corpus.db: both build_topics.py and the candidate-lemma query above
    # rank the curriculum by counting item_tokens with no filter on kind, so foreign
    # sentences landing there would quietly change which lemmas the curriculum uses.
    ext_sentences, ext_items_of_key = {}, {}
    ext_path = ROOT / "data" / "examples.db"
    if ext_path.exists():
        ex = sqlite3.connect(f"file:{ext_path}?mode=ro", uri=True)
        for xid, ru, en_s, src in ex.execute("select id, ru, en, source from items"):
            ext_sentences[xid] = (ru, en_s, src)
        for k, xid in ex.execute("select key, item_id from item_tokens"):
            ext_items_of_key.setdefault(k, []).append(xid)
        row = ex.execute("select v from meta where k='licence'").fetchone()
        stats["ext_licence"] = row[0] if row else ""
        stats["ext_source"] = (ex.execute(
            "select v from meta where k='source'").fetchone() or [""])[0]
        ex.close()
    stats["ext_sentences"] = len(ext_sentences)

    # Attribution is a licence condition on both corpora, not decoration. It is built
    # from what the databases themselves record, so a source cannot be credited by a
    # string in the UI that has drifted from the data actually shipped.
    credits = []
    lex_meta = dict(db.execute("select k, v from meta"))
    if lex_meta.get("source"):
        credits.append({"n": lex_meta["source"], "l": lex_meta.get("license", "")})
    if ext_sentences and stats.get("ext_source"):
        credits.append({"n": f"{stats['ext_source']} (tatoeba.org)",
                        "l": stats.get("ext_licence", "")})
    stats["credits"] = credits

    vocab_by_key = {}
    for rk, fr, ipm in db.execute(
            "select ru_key, freq_rank, ipm from c.items"
            " where kind='vocab' and freq_rank is not null order by freq_rank desc"):
        vocab_by_key[rk] = (fr, ipm)

    unit_of = dict(db.execute("select lemma_id, topic_id from t.unit_words"))

    lemmas, index, pos_of = [], {}, {}
    for lid in order:
        row = db.execute(
            "select bare, accented, pos, gender, aspect, partner, en from lemmas"
            " where id=?", (lid,)).fetchone()
        if not row:
            continue
        bare, accented, pos, gender, aspect, partner, en = row

        keys = keys_of.get(lid, set())

        # Neither the paradigm tables nor the example sentences are stored here any
        # more: the dictionary tier below carries both, for all 46,000 glossed
        # lemmas rather than only these 4,000, and the app rebuilds `t` and `x` on
        # the way in. Keeping a second copy cost 2.6 MB and was one more thing that
        # could disagree with itself.
        e = {"w": accented or bare, "b": bare, "p": pos, "e": en or "",
             "n": corpus_n.get(lid, 0)}
        if gender:
            e["g"] = gender
        if aspect:
            e["a"] = aspect
        if partner:
            e["pt"] = partner
        if lid in unit_of:
            e["u"] = unit_of[lid]
        v = vocab_by_key.get(fold(bare))
        if v:
            e["fr"] = v[0]
            if v[1]:
                e["ipm"] = v[1]

        lemmas.append(e)
        i = len(lemmas) - 1
        pos_of[lid] = i
        for k in keys:
            index.setdefault(k, []).append(i)

    # --- units and path ----------------------------------------------------
    grammar = {}
    gpath = ROOT / "data" / "curated" / "grammar_notes.json"
    if gpath.exists():
        grammar = json.loads(gpath.read_text(encoding="utf-8")).get("notes", {})

    videos, library, channels = {}, [], []
    vpath = ROOT / "data" / "videos.json"
    if vpath.exists():
        vdata = json.loads(vpath.read_text(encoding="utf-8"))
        videos = vdata.get("units", {})
        library = vdata.get("videos", [])
        channels = vdata.get("channels", [])

    # Which words are actually spoken in a video, and when. Only curriculum words
    # are shipped, and only a few moments each — the transcript itself stays out of
    # the app, which keeps the payload small and means we ship an index, not a copy
    # of the captions. Times are milliseconds from the start of the video.
    heard = {}
    tpath = ROOT / "data" / "transcripts.json"
    if tpath.exists():
        heard = json.loads(tpath.read_text(encoding="utf-8")).get("index", {})

    units = []
    uidx = {}
    for tid, name, kind, n in db.execute(
            "select id, name, kind, n from topics order by ord"):
        words = [pos_of[l] for (l,) in db.execute(
            "select lemma_id from t.unit_words where topic_id=? order by ord", (tid,))
            if l in pos_of]
        uidx[tid] = len(units)
        u = {"id": tid, "name": name, "kind": kind, "w": words}
        if tid in grammar:
            u["g"] = grammar[tid]
        if tid in videos:
            v = videos[tid]
            u["v"] = {"id": v["id"], "title": v["title"], "dur": v.get("dur"),
                      "ch": v.get("channel")}
            spoken = heard.get(v["id"], {})
            if spoken:
                # Only this unit's own words, and at most a handful of moments each —
                # the learner replays one occurrence, not every one. A unit word
                # the video never says is not listed: what is under a video must
                # be in the video (the owner's rule, 2026-09-07).
                u["v"]["heard"] = {
                    lemmas[i]["b"]: spoken[lemmas[i]["b"]][:4]
                    for i in words if lemmas[i]["b"] in spoken
                }
        units.append(u)

    # --- the video library ---------------------------------------------------
    # Every harvested video with a transcript, for Immerse: the search keywords,
    # the units whose words it speaks, and up to VIDEO_WORDS curriculum words it
    # says, each with a few moments. A video attached to a unit lists that unit's
    # words first; the rest are the content words it says most, commonest first
    # among ties. Function words are not "listen for" material.
    video_list = []
    unit_words_of = {u["id"]: u["w"] for u in units}
    unit_of_video = {v["id"]: tid for tid, v in videos.items()}
    idx_of_bare = {}
    for i, e in enumerate(lemmas):
        idx_of_bare.setdefault(e["b"], i)
    for v in library:
        spoken = heard.get(v["id"])
        if not spoken:
            continue
        chosen = []
        tid = unit_of_video.get(v["id"])
        if tid:
            chosen = [lemmas[i]["b"] for i in unit_words_of.get(tid, []) if lemmas[i]["b"] in spoken]
        pool = []
        for bare, occ in spoken.items():
            i = idx_of_bare.get(bare)
            if i is None or i < VIDEO_SKIP_TOP or bare in chosen:
                continue
            if lemmas[i]["p"] not in ("noun", "verb", "adjective"):
                continue
            pool.append((-len(occ), i, bare))
        pool.sort()
        chosen += [bare for _, _, bare in pool[:max(0, VIDEO_WORDS - len(chosen))]]
        entry = {"id": v["id"], "title": v["title"], "ch": v.get("ch"), "dur": v.get("dur"),
                 "kw": v.get("kw", ""), "topics": v.get("topics", []),
                 "words": {b: spoken[b][:VIDEO_MOMENTS] for b in chosen}}
        if tid:
            entry["unit"] = tid
        if v.get("level"):
            entry["level"] = v["level"]
        if v.get("ease") is not None:
            entry["ease"] = v["ease"]
        if v.get("cefr"):
            entry["cefr"] = v["cefr"]
        if v.get("chapters"):
            entry["chapters"] = v["chapters"]
        video_list.append(entry)
    stats["videos"] = len(video_list)
    stats["channels"] = [c.get("name") for c in channels]

    # Chapter titles ride on the spine row that opens each chapter, which is where the
    # app already starts a new stage — no second structure to keep in step with path.
    chapters = {sid: (n, title) for n, title, sid
                in db.execute("select n, title, spine_id from t.chapters order by n")}

    path = []
    for r, c, tid, req in db.execute(
            "select row, col, topic_id, requires from t.path order by row, col"):
        if tid not in uidx:
            continue
        row = {"r": r, "c": c, "u": uidx[tid], "req": uidx.get(req)}
        if tid in chapters:
            row["cn"], row["ch"] = chapters[tid]
        path.append(row)

    deep, shapes, slot_names, sent_pool, tsample = build_dictionary(
        db, sentences, items_of_key, keys_of, stats, ext_sentences, ext_items_of_key)

    # Per-sentence tokens and which units each token's lemma belongs to, for the
    # sentence measurements below — taken while the database is still open.
    sent_tokens = {}
    for k, iid in db.execute("select key, item_id from c.item_tokens order by rowid"):
        if iid in sentences:
            sent_tokens.setdefault(iid, []).append(k)
    key_units = {}
    for lid, tid in unit_of.items():
        if tid in uidx:
            for k in keys_of.get(lid, ()):
                key_units.setdefault(k, set()).add(uidx[tid])
    # Path order per unit index: "the latest unit" means latest on the learner's
    # route, not highest in the units list.
    unit_pos = {row["u"]: n for n, row in enumerate(path)}

    db.close()

    # Real recordings, when tools/build_audio.py has exported them. Only entries whose
    # file actually exists are shipped, so a partial export cannot promise audio the
    # build does not carry.
    audio = {}
    apath = ROOT / "data" / "audio.json"
    adir = ROOT / "site" / "audio"
    if apath.exists():
        raw = json.loads(apath.read_text(encoding="utf-8")).get("files", {})
        if adir.exists():
            present = {p.name for p in adir.iterdir() if p.is_file()}
            audio = {k: v for k, v in raw.items() if v in present}
        stats["audio_files"] = len(set(audio.values()))
        stats["audio_utterances"] = len(audio)

    # Where each shipped recording came from, per file, from the same manifest.
    src_of = {}
    if apath.exists():
        src_of = json.loads(apath.read_text(encoding="utf-8")).get("src", {})
    measured = measure_sentences(sentences, sent_tokens, index, key_units, lemmas,
                                 unit_pos, audio, src_of, stats)
    speech = build_pools(measured, units, stats)

    return {"stats": stats, "lemmas": lemmas, "index": index,
            "units": units, "path": path, "audio": {"files": audio},
            "deep": deep, "shapes": shapes, "slots": slot_names,
            "sent": sent_pool, "tsample": tsample, "speech": speech,
            "videos": video_list}


FONTS = ("https://fonts.googleapis.com/css2?"
         "family=Golos+Text:wght@400;500;600;700"
         "&family=Literata:opsz,wght@7..72,400;7..72,600&display=swap")

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F6F5F1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1113" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Bridges</title>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" href="icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="@FONTS@">
<style>@CSS@</style>
</head>
<body>
@SHELL@
<script>window.RB_SW = true;</script>
<script>@JS@</script>
</body>
</html>
"""

# The artifact host wraps the file in its own document, so this variant omits the
# document furniture. app.js injects the viewport meta at runtime for that case.
ARTIFACT = """<title>Bridges</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="@FONTS@">
<style>@CSS@</style>
@SHELL@
<script>@JS@</script>
"""


def strip_modules(src):
    """ES module syntax out, so a shared core file can live in one classic script.

    Only `export` prefixes and whole-line imports are removed; nothing else about
    the file changes, which is what lets core/ be the single source of truth for
    both the web bundle and the native app.
    """
    src = re.sub(r"(?m)^\s*import\s[^\n]*?;\s*$", "", src)
    src = re.sub(r"(?m)^export\s+(default\s+)?", "", src)
    return src


def strip_captions(payload):
    """The video moments carry a ten-word window of YouTube's caption text (`s`),
    which is the video's text, not ours. A private build keeps it — it is what the
    learner reads after tapping a word — a public one ships the moment and the
    spoken form only. Returns how many were stripped."""
    n = 0
    for u in payload.get("units", []):
        for occs in ((u.get("v") or {}).get("heard") or {}).values():
            for o in occs:
                if "s" in o:
                    del o["s"]
                    n += 1
    for v in payload.get("videos", []):
        for occs in (v.get("words") or {}).values():
            for o in occs:
                if "s" in o:
                    del o["s"]
                    n += 1
    return n


def assemble(tpl, fonts, css, shell, js):
    """Token replacement, not str.format — the CSS and JS are full of braces."""
    for token, value in (("@FONTS@", fonts), ("@CSS@", css),
                         ("@SHELL@", shell), ("@JS@", js)):
        tpl = tpl.replace(token, value)
    return tpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", type=Path, default=ROOT / "data" / "lexicon.db")
    ap.add_argument("--corpus", type=Path, default=ROOT / "data" / "corpus.db")
    ap.add_argument("--topics", type=Path, default=ROOT / "data" / "topics.db")
    ap.add_argument("--src", type=Path, default=ROOT / "tools" / "app")
    ap.add_argument("--outdir", type=Path, default=ROOT / "site")
    ap.add_argument("--lemmas", type=int, default=4000)
    # Not read any more: examples per lemma are capped at four where the pools
    # are built (§30a). Kept so an old command line still parses.
    ap.add_argument("--examples", type=int, default=4)
    ap.add_argument("--public", action="store_true",
                    help="a build for distribution: ships no caption text with the video "
                         "moments, only the spoken form and the time (ROADMAP P8.8)")
    args = ap.parse_args()

    payload = gather(args.lexicon, args.corpus, args.topics, args.lemmas, args.examples)
    if args.public:
        stripped = strip_captions(payload)
        print(f"  public build : {stripped:,} caption snippets stripped from the video moments")
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    css = (args.src / "app.css").read_text(encoding="utf-8")
    shell = (args.src / "shell.html").read_text(encoding="utf-8")
    # core/ is shared verbatim with the React Native app, so it is written as ES
    # modules. The web bundle is one classic script, so the module syntax is stripped
    # on the way in rather than the logic being duplicated for each platform.
    # forms.js after util.js: it calls fold() and firstSense() at run time, and the
    # concatenation order is the only thing standing in for module resolution.
    core_files = ["util.js", "state.js", "compare.js", "errortags.js",
                  "paradigm.js", "entry.js", "forms.js", "search.js",
                  "fsrs.js", "icons.js", "avatars.js"]
    core = "\n".join(strip_modules((ROOT / "core" / f).read_text(encoding="utf-8"))
                     for f in core_files if (ROOT / "core" / f).exists())

    # Order matters: everything is concatenated into one script, so top-level consts
    # must be evaluated before app.js's boot IIFE reaches them. Function declarations
    # hoist across the whole script, so only const/let evaluation order is at stake.
    js_files = []
    for f in ("accounts.js", "lessons.js", "drills.js", "app.js"):
        if (args.src / f).exists():
            js_files.append(f)
    js = "const DATA = " + blob + ";\n" + core + "\n" + "\n".join(
        (args.src / f).read_text(encoding="utf-8") for f in js_files)

    args.outdir.mkdir(parents=True, exist_ok=True)
    (args.outdir / "index.html").write_text(
        assemble(HEAD, FONTS, css, shell, js), encoding="utf-8")
    (args.outdir / "artifact.html").write_text(
        assemble(ARTIFACT, FONTS, css, shell, js), encoding="utf-8")

    # The native app bundles the same payload, so both platforms are always built
    # from one generation of the data.
    native_assets = ROOT / "native" / "assets"
    if native_assets.exists():
        (native_assets / "data.json").write_text(blob, encoding="utf-8")
        print(f"  native data  : {native_assets / 'data.json'} "
              f"({len(blob)/1_048_576:.2f} MB)")

    # PWA files. The cache name is stamped with a hash of the page so a new build
    # actually evicts the old one from installed devices.
    stamp = hashlib.sha1(js.encode("utf-8")).hexdigest()[:10]
    shutil.copyfile(args.src / "manifest.json", args.outdir / "manifest.json")
    (args.outdir / "sw.js").write_text(
        (args.src / "sw.js").read_text(encoding="utf-8").replace("@BUILD@", stamp),
        encoding="utf-8")

    print(f"wrote {args.outdir / 'index.html'}")
    print(f"  lemmas       : {len(payload['lemmas']):,}")
    print(f"  lookup forms : {len(payload['index']):,}")
    print(f"  units        : {len(payload['units'])}  "
          f"({sum(1 for u in payload['units'] if u['kind']=='spine')} spine, "
          f"{sum(1 for u in payload['units'] if u['kind']=='branch')} branch)")
    # The deep tier is most of the payload, so the build has to report what it ships:
    # a drop in either coverage number is the symptom of a join quietly breaking.
    st = payload["stats"]
    deep_n = st["deep"]
    print(f"  dictionary   : {deep_n:,} glossed lemmas "
          f"({st['deep_paradigms']:,} with a paradigm, "
          f"{100*st['deep_paradigms']/deep_n:.1f}%; "
          f"{st['deep_examples']:,} with sentences, "
          f"{100*st['deep_examples']/deep_n:.1f}%)")
    print(f"  shared       : {st['shapes']:,} ending shapes, "
          f"{st['deep_sentences']:,} pooled sentences")
    if st.get("ext_sentences"):
        print(f"  {st['ext_source'].lower():13.13}: {st['ext_sentences']:,} sentences, "
              f"the only example for {st['deep_ext_only']:,} words "
              f"({st['ext_licence']})")
    # The pools are cut by curriculum coverage (measure_sentences); the difficulty
    # histogram is the wider picture of how much of the corpus resolves at all.
    if st.get("sentences_measured"):
        print(f"  sentences    : {st['sentences_measured']:,} measured, "
              f"{st['sentences_with_unit']:,} placed in a unit, "
              f"{st['sentences_with_audio']:,} with a recording")
        print("  difficulty   : " + "  ".join(f"{lab} {n:,}" for lab, n in st["difficulty_hist"]))
    # Pool sizes per unit. A unit below the floor is named: a speaking activity that
    # keeps asking the same five sentences is worse than none.
    if st.get("speak_pool") is not None:
        sp = st["speak_pool"]
        print(f"  speak pool   : {sum(sp.values()):,} sentences over {len(sp)} units; "
              f"min {min(sp.values()) if sp else 0}, max {max(sp.values()) if sp else 0}")
        if st["speak_short"]:
            print(f"    under {POOL_MIN_PER_UNIT}: " + ", ".join(
                f"{u} ({sp.get(u, 0)})" for u in st["speak_short"]))
    if st.get("listen_pool") is not None:
        lp = st["listen_pool"]
        print(f"  listen pool  : {sum(lp.values()):,} sentences over {len(lp)} units; "
              f"min {min(lp.values()) if lp else 0}, max {max(lp.values()) if lp else 0}; "
              f"{st['listen_without_core5000']:,} without Core 5000")
        if st["listen_short"]:
            print(f"    under {POOL_MIN_PER_UNIT}: " + ", ".join(
                f"{u} ({lp.get(u, 0)})" for u in st["listen_short"]))
    print(f"  scripts      : {', '.join(js_files)}")
    print(f"  page         : {(args.outdir / 'index.html').stat().st_size/1_048_576:.2f} MB")


if __name__ == "__main__":
    main()

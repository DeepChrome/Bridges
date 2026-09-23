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
from panel import build_tables, fold, Resolver  # noqa: E402

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


# Examples shown per word, on the entry and the cards.
N_EXAMPLES = 4
# Two sentences sharing this many studied words (the word's own forms aside)
# are the same sentence twice as far as a learner is concerned.
NEAR_DUPLICATE = 2


def rank_examples(cands, sentences, sent_tokens, studied_keys, own_keys=(), tally=None):
    """The sentences worth showing first, and one of each — and different from
    each other.

    The collection holds the same sentence twice — the Core 5000 deck's stressed
    copy of an Ultimate Guide card — so "four examples" was often two; one of
    each (by fold), the stressed and recorded copy kept. Then the readable ones
    first: fewest words outside the curriculum, then shortest — the entry, the
    vocabulary card and the flashcard back all used to open on whatever sentence
    had the lowest id («в» on «Он лежал в гробу»).

    Readable-first alone showed «open» as "I opened the door", "He opened the
    door", "She opened the door" (the owner, 2026-09-20: "you'd want some
    variation to display versatility in the word"). So the first N_EXAMPLES are
    picked one at a time: among the sentences within one unknown word of the
    easiest left, prefer a form of the word not shown yet, then a sentence that
    is not a near copy of one already chosen, then the easiest and shortest.
    Readability still bounds it — a rare form in a hard sentence is not what
    "varied" means — and the rest of the list keeps the old order.

    `tally`, when given, counts what the plain order would have shown against
    what this shows, so the build can print the difference rather than claim it.
    """
    best = {}
    for iid in cands:
        ru, _en, _deck, has_audio = sentences[iid]
        # A vocabulary card's bare headword («читать — to read») is an item in
        # the corpus and, being the shortest and wholly known, was the first
        # "example" of every verb it had a card for. One word is not a sentence.
        if len(re.findall(r"[а-яёА-ЯЁ]+", ru)) < 2:
            continue
        k = fold(ru)
        score = (sum(ru.count(c) for c in ACC_MARKS) > 0, has_audio, -iid)
        if k not in best or score > best[k][0]:
            best[k] = (score, iid)
    kept = [iid for _, iid in best.values()]
    own = frozenset(own_keys)

    info = {}
    for iid in kept:
        toks = sent_tokens.get(iid, ())
        info[iid] = (sum(1 for k in toks if k not in studied_keys),
                     len(sentences[iid][0]),
                     frozenset(k for k in toks if k in own),
                     frozenset(k for k in toks if k in studied_keys and k not in own))

    def hardness(iid):
        return (info[iid][0], info[iid][1], iid)
    pool = sorted(kept, key=hardness)
    plain = pool[:N_EXAMPLES]

    chosen, forms_seen = [], set()
    while pool and len(chosen) < N_EXAMPLES:
        base = info[pool[0]][0]

        def choice(iid):
            unknown, length, forms, rest = info[iid]
            repeat = bool(forms) and forms <= forms_seen
            near = any(len(rest & info[c][3]) >= NEAR_DUPLICATE for c in chosen)
            return (unknown > base + 1, repeat, near, unknown, length, iid)
        pick = min(pool, key=choice)
        chosen.append(pick)
        pool.remove(pick)
        forms_seen |= info[pick][2]

    if tally is not None and len(kept) > 1:
        for name, shown in (("plain", plain), ("varied", chosen)):
            forms = {f for i in shown for f in info[i][2]}
            tally[name + "_words"] += 1
            tally[name + "_one_form"] += len(forms) <= 1
            tally[name + "_near"] += sum(
                1 for a in range(len(shown)) for b in range(a)
                if len(info[shown[a]][3] & info[shown[b]][3]) >= NEAR_DUPLICATE)
    return chosen + pool


def build_dictionary(db, sentences, items_of_key, keys_of, stats,
                     ext_sentences=None, ext_items_of_key=None,
                     resolver=None, sent_tokens=None, studied_keys=frozenset()):
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
    rec_of = {}             # lemma id -> its compressed record, for the studied rows
    ext_only = 0            # words whose only example comes from outside his decks
    tally = Counter()       # example variety, plain order against varied

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
        #
        # Only through forms the lemma owns: a key shared with another lemma
        # attaches a sentence only when the resolver gives it to this one, or
        # «мочь» is illustrated by «недержание мочи» and «лук» by Великие Луки.
        keys = [k for k in keys_of.get(lid, ())
                if resolver is None or len(resolver.candidates(k)) < 2
                or resolver.owner_id(k) == lid]
        cands = {i for k in keys for i in items_of_key.get(k, ()) if i in sentences}
        ranked = (rank_examples(cands, sentences, sent_tokens or {}, studied_keys, keys, tally)
                  if sent_tokens is not None else sorted(cands))
        refs = [str(sentence_ref(iid)) for iid in ranked[:N_EXAMPLES]]
        own = len(refs)
        if ext_items_of_key and len(refs) < N_EXAMPLES:
            spare = N_EXAMPLES - len(refs)
            ext = {x for k in keys for x in ext_items_of_key.get(k, ()) if x in ext_sentences}
            for xid in sorted(ext, key=lambda x: (len(ext_sentences[x][0]), x))[:spare]:
                refs.append(str(ext_ref(xid)))
        if refs and not own:
            ext_only += 1

        rec = (stem_len, shape_id, stress, ",".join(refs), ";".join(overrides))
        rec_of[lid] = rec
        # By folded headword and part of speech, first wins — the app's twinOf()
        # rule (core/entry.js), applied here so a studied row without a line of
        # its own still ships a record.
        for key in (fold(bare) + "|" + (m["p"] or ""), fold(bare)):
            rec_of.setdefault(key, rec)
        lines.append("\t".join([
            bare,
            "" if m["w"] == bare else m["w"],
            POS_LETTER.get(m["p"], m["p"] or ""),
            m["g"] or "",
            m["a"] or "",
            (m["pt"] or "").split(";")[0].strip(),
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
    stats["examples_variety"] = dict(tally)
    stats["shapes"] = len(shapes)
    return "\n".join(lines), shape_blob, slot_names, pool, sample, rec_of


# A word the units never teach may still appear in a pool sentence if it is this
# common — «не», «и», «в», «что»: met on every screen from the first lesson. Anything
# rarer and untaught makes the sentence unavailable to every unit. 500 was chosen by
# measuring: at 300 the second chapter has 27 speakable sentences, at 500 it has 42
# and the first chapter 48; at 0 the first chapter has 8.
COVERAGE_FREE_RANK = 500

# The parts of the payload the native app loads on first use rather than at boot,
# each written to its own file beside data.json.
NATIVE_PARTS = ["deep", "sent", "videos", "senses"]


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
LISTEN_TOKENS = (3, 15)     # three words is a sentence to hear in chapter 1
LISTEN_EXCLUDE = ("googletts", "other")
POOL_MIN_PER_UNIT = 15


# The classes that do not decline or conjugate the way a content word does. A
# curated closed-class entry and a unit teaching the same word as a noun are two
# sources of truth disagreeing, and only one of them can be right.
CLOSED_POS = {"other", "pronoun", "possessive", "numeral"}
CONTENT_POS = {"noun", "adjective", "verb"}


def check_closed_class(units, lemmas, with_paradigm):
    """No unit may teach as a content word something function_words.json declares
    closed-class and the lexicon gives no content-word forms.

    «перед» shipped as a noun glossed "before": OpenRussian carries a bare noun row
    beside the preposition, the noun row won build_topics' dedupe, and the
    curriculum then taught a preposition as a noun — with a noun's declension
    tables, so the chapter's form question could ask for its genitive plural
    (ROADMAP P11.5). Fatal, because nothing downstream can notice: a wrong
    declension looks exactly like a right one.

    Both halves are needed. The curated file also declares «мой», «твой», «свой»
    and «весь» possessive, and OpenRussian carries each of them again as an
    adjective — with its own 27-row declension, the same forms the curated entry
    hand-authored. Those are one word listed twice, not a word in the wrong class,
    and the unit teaching the adjective row shows the learner nothing false. (That
    duplication is its own defect and is not this check's business: the curated
    entries are redundant for those four, since the file exists for paradigms
    OpenRussian does not ship.) «перед»'s noun row has no paradigm at all, which
    is what separates the two cases.
    """
    path = ROOT / "data" / "curated" / "function_words.json"
    if not path.exists():
        return []
    closed = set()
    for e in json.loads(path.read_text(encoding="utf-8"))["entries"]:
        if e.get("pos") in CLOSED_POS:
            closed.add(fold(e.get("lemma") or e["attach_to"]))
    bad = []
    for u in units:
        for i in u["w"]:
            e = lemmas[i]
            if e["p"] in CONTENT_POS and fold(e["b"]) in closed and i not in with_paradigm:
                bad.append(f"{u['id']} teaches «{e['b']}» as a {e['p']} with no {e['p']} "
                           "forms in the lexicon, and function_words.json calls it closed-class")
    return bad


def check_grammar_cards(units, path, lemmas, index, keys_of, pos_of):
    """Every token in a unit's grammar card examples resolves to a word taught
    by that unit or one earlier on the route, or is within COVERAGE_FREE_RANK.
    Prints what is not; returns the count."""
    order = [row["u"] for row in path]
    taught = set()
    bad = 0
    for ui in order:
        u = units[ui]
        taught.update(u["w"])
        card = u.get("g")
        if not card:
            continue
        for ru, _en in card.get("examples", []):
            for m in re.finditer(r"[а-яёА-ЯЁ́]+", ru):
                key = fold(m.group(0))
                hit = index.get(key)
                if not hit:
                    continue                      # not a curriculum word at all
                if any(i in taught for i in hit):
                    continue
                fr = lemmas[hit[0]].get("fr")
                if fr and fr <= COVERAGE_FREE_RANK:
                    continue
                print(f"  !! card {u['id']}: «{m.group(0)}» ({lemmas[hit[0]]['b']}) is taught later or never")
                bad += 1
    return bad


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

    "Once" means once per fold(ru), not once per string. The collection holds the
    same sentence twice — the Core 5000 deck's stressed copy of an Ultimate Guide
    card — and both copies fold to the same audio key, so the pools were 26 % one
    sentence stored under two spellings pointing at one recording (ROADMAP P11.6).
    A scene built from that played the same recording for two of its questions and
    drew a wrong meaning option from a sentence it had just played. The stressed
    copy is kept, as rank_examples keeps it for the dictionary's examples.
    """
    rows, at, score, spellings = [], {}, {}, set()

    def quality(rec):
        ru, _en, _n, _diff, _unit, fname, _src = rec
        return (sum(ru.count(c) for c in ACC_MARKS) > 0, bool(fname))

    def row_for(rec):
        ru, en, n, diff, unit, fname, src = rec
        k = fold(ru)
        spellings.add(ru)
        row = [ru, en, n, round(diff, 2), SRC_CODE.get(src, "o")]
        if k not in at:
            at[k], score[k] = len(rows), quality(rec)
            rows.append(row)
        elif quality(rec) > score[k]:
            rows[at[k]], score[k] = row, quality(rec)
        return at[k]

    def add(pool, uid, i):
        seen = pool.setdefault(uid, [])
        if i not in seen:          # both spellings reach the same unit
            seen.append(i)

    speak = {}
    for rec in measured:
        ru, en, n, diff, unit, fname, src = rec
        if unit is None or not fname or not en:
            continue
        if SPEAK_TOKENS[0] <= n <= SPEAK_TOKENS[1]:
            add(speak, units[unit]["id"], row_for(rec))

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
            before = len(listen.get(units[unit]["id"], ()))
            add(listen, units[unit]["id"], row_for(rec))
            if src in ("tatoeba", "lof", "yandex") and len(listen[units[unit]["id"]]) > before:
                listen_human_yandex += 1

    stats["listen_pool"] = {uid: len(v) for uid, v in listen.items()}
    stats["listen_without_core5000"] = listen_human_yandex
    stats["listen_short"] = sorted(u["id"] for u in units
                                   if len(listen.get(u["id"], ())) < POOL_MIN_PER_UNIT)
    stats["speech_rows"] = len(rows)
    stats["speech_folded"] = len(spellings) - len(rows)
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
    # A token counts once, for the lemma its form belongs to (panel.py resolve()
    # — the same rule build_topics.py cuts the spine with), so the order of the
    # shipped lemmas, which is also the priority of the lookup index, is the
    # words' real frequency and not the number of paradigm rows sharing a key.
    resolver = Resolver(db)
    corpus_n = {}
    for key, n in db.execute("select key, count(*) from c.item_tokens group by key"):
        lid = resolver.owner_id(key)
        if lid is not None:
            corpus_n[lid] = corpus_n.get(lid, 0) + n
    unit_lemmas = [r[0] for r in db.execute("select distinct lemma_id from t.unit_words")]
    top = [lid for lid, _ in sorted(corpus_n.items(), key=lambda x: (-x[1], x[0]))[:n_lemmas]]
    order, seen = [], set()
    for lid in top + unit_lemmas:
        if lid not in seen:
            seen.add(lid)
            order.append(lid)

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
    # Wiktionary's senses (§30q), CC BY-SA 3.0. Read from senses.db's own meta
    # for the same reason as the other two: a credit written in the UI drifts
    # from what shipped, and this one cannot.
    spath = ROOT / "data" / "senses.db"
    if spath.exists():
        sdb = sqlite3.connect(str(spath))
        smeta = dict(sdb.execute("select k, v from meta"))
        sdb.close()
        if smeta.get("source"):
            credits.append({"n": smeta["source"], "l": smeta.get("licence", "")})
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
            "select bare, accented, pos, gender, aspect, partner, en, pl_only from lemmas"
            " where id=?", (lid,)).fetchone()
        if not row:
            continue
        bare, accented, pos, gender, aspect, partner, en, pl_only = row

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
            # The first partner is the pair the aspect drill asks for; the rest
            # ride along for the entry ("pair: сказать, поговорить").
            parts = [p.strip() for p in partner.split(";") if p.strip()]
            e["pt"] = parts[0]
            if len(parts) > 1:
                e["pt2"] = ", ".join(parts[1:])
        if pl_only:
            e["pl"] = 1
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

    # A shared key lists the lemma the form belongs to first: every consumer
    # takes index[key][0] — word links, grading, cloze labels, search — and by
    # frequency alone «нет» opened «житься» and «лет» credited «лёт».
    reordered = 0
    for k, ids in index.items():
        if len(ids) < 2:
            continue
        lid = resolver.owner_id(k)
        i = pos_of.get(lid)
        if i is not None and ids[0] != i:
            ids.remove(i)
            ids.insert(0, i)
            reordered += 1
    stats["index_reordered"] = reordered

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
    for tid, name, kind, n, opt in db.execute(
            "select id, name, kind, n, opt from topics order by ord"):
        words = [pos_of[l] for (l,) in db.execute(
            "select lemma_id from t.unit_words where topic_id=? order by ord", (tid,))
            if l in pos_of]
        uidx[tid] = len(units)
        u = {"id": tid, "name": name, "kind": kind, "w": words}
        # A side quest the chapter does not require (build_topics.py OPTIONAL,
        # 2026-09-22). Absent on everything else, so a unit without the key is
        # required — which is what every spine unit is by definition.
        if opt:
            u["opt"] = 1
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
        if v.get("upload"):
            entry["up"] = v["upload"]      # YYYYMMDD, for the library's "newest" order
        if v.get("chapters"):
            entry["chapters"] = v["chapters"]
        video_list.append(entry)
    stats["videos"] = len(video_list)

    # The creators behind the library, with where to support them (the owner,
    # 2026-09-23). The harvest's own channel rows carry the YouTube url; the
    # curated file carries the Patreon and the site, found by hand. Shipped so
    # the app's first-open notice on Immerse reads data rather than a list
    # typed into a screen.
    creators = []
    cpath = ROOT / "data" / "curated" / "channels.json"
    curated_ch = {}
    if cpath.exists():
        for c in json.loads(cpath.read_text(encoding="utf-8")).get("channels", []):
            curated_ch[c["handle"]] = c
    for c in channels:
        cur = curated_ch.get(c.get("handle"), {})
        row = {"name": c.get("name") or cur.get("name"), "url": c.get("url")}
        if cur.get("patreon"):
            row["patreon"] = cur["patreon"]
        if cur.get("site"):
            row["site"] = cur["site"]
        creators.append(row)
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

    # A grammar card may only use words taught by then (or the commonest few
    # hundred): chapter 2's card conjugated «читать», a chapter-8 word. Reported,
    # not fatal — the cards are hand-written and the fix is a word in the card.
    stats["card_words_untaught"] = check_grammar_cards(units, path, lemmas, index, keys_of, pos_of)
    with_paradigm = {pos_of[l] for (l,) in db.execute(
        "select distinct lemma_id from paradigm") if l in pos_of}
    stats["closed_class_taught"] = check_closed_class(units, lemmas, with_paradigm)

    # Per-sentence tokens and which units each token's lemma belongs to, for the
    # example ranking and the sentence measurements below — taken while the
    # database is still open.
    sent_tokens = {}
    for k, iid in db.execute("select key, item_id from c.item_tokens order by rowid"):
        if iid in sentences:
            sent_tokens.setdefault(iid, []).append(k)
    studied_keys = {k for lid in seen for k in keys_of.get(lid, ())}

    deep, shapes, slot_names, sent_pool, tsample, rec_of = build_dictionary(
        db, sentences, items_of_key, keys_of, stats, ext_sentences, ext_items_of_key,
        resolver=resolver, sent_tokens=sent_tokens, studied_keys=studied_keys)

    # Every studied row carries a compressed record — the same five fields its
    # dictionary line has, or its twin's (a glossless row, the same word under
    # another id), or an empty one when the lexicon has nothing — so the app
    # hydrates the curriculum's words without ever opening the dictionary at boot
    # (the engineering review, 2026-09-08: 4.45 MB parsed and 30 MB of tables
    # built before the first screen). About 160 KB.
    own = twinned = 0
    for lid, i in pos_of.items():
        e = lemmas[i]
        rec = rec_of.get(lid)
        if rec is not None:
            own += 1
        else:
            rec = rec_of.get(fold(e["b"]) + "|" + (e["p"] or "")) or rec_of.get(fold(e["b"]))
            twinned += rec is not None
        stem_len, shape_id, stress, refs, over = rec or ("", "", "", "", "")
        e["shape"] = shape_id
        if stem_len:
            e["stem"] = stem_len
        if stress:
            e["stress"] = stress
        if refs:
            e["refs"] = refs
        if over:
            e["over"] = over
    stats["lemmas_with_record"] = own
    stats["lemmas_twinned"] = twinned

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

    # Listening passages: spans of real video, 45 s each, with the curriculum
    # words they say (tools/build_listening.py). Shipped whole — which passage
    # suits which learner is decided in the app, against what they have met.
    scripts = load_scripts(stats)

    senses = load_senses(lemmas, stats)

    return {"stats": stats, "lemmas": lemmas, "index": index,
            "units": units, "path": path, "audio": {"files": audio},
            "deep": deep, "shapes": shapes, "slots": slot_names,
            "sent": sent_pool, "tsample": tsample, "speech": speech,
            "videos": video_list, "channels": creators,
            "scripts": scripts, "senses": senses}


# Our part-of-speech names against Wiktionary's. A closed-class word OpenRussian
# files as an adjective is a determiner or a pronoun to Wiktionary («весь»,
# «тот», «такой»), so those count as a match too.
POS_TO_WIKT = {"noun": ("noun",), "verb": ("verb",), "adjective": ("adj", "det", "pron", "num"),
               "adverb": ("adv",), "pronoun": ("pron", "det"), "possessive": ("det", "pron", "adj"),
               "numeral": ("num",)}
OPEN_CLASS = ("noun", "verb", "adjective")
# Wiktionary's Russian entries include one for the letter a word is spelt with:
# «а» opens on "The name of the Cyrillic script letter А/а", «же» on "zhe". A
# letter is not a meaning of the word.
LETTER_SENSE = re.compile(r"(name of|sound expressed by) the (Cyrillic|Latin|Greek)[- ]?(script )?letter", re.I)
# A sense a learner should meet last whatever order Wiktionary gives it: «весь»
# led with "[colloquial, dated, rare] run out, all gone".
LATE_TAGS = {"dated", "archaic", "obsolete", "rare"}
# Words that carry no meaning of their own, left out when two glosses are
# compared for whether they say the same thing.
GLOSS_STOP = {"to", "the", "a", "an", "of", "in", "on", "at", "by", "with", "or", "and",
              "it", "is", "be", "for", "as", "from", "that", "this", "one", "one's",
              "used", "something", "someone", "somebody", "up", "out", "off", "not"}


def gloss_words(s):
    """The words a gloss is made of, minus the scaffolding — unless the
    scaffolding is all there is: a preposition's meaning *is* "on", "at", "by",
    and stripping those left «на» matching nothing and its own gloss pushed in
    front of Wiktionary's "onto, on"."""
    words = set(re.findall(r"[a-z']+", (s or "").lower()))
    return (words - GLOSS_STOP) or words


def pick_senses(gloss, pos, by_pos):
    """The senses to show for one word, from its Wiktionary entries.

    Wiktionary files a spelling once per part of speech, and the app knows what
    it teaches the word as — the OpenRussian gloss, with the curated overrides
    on top, is the meaning the lesson and the quiz use. So an entry is chosen
    by that: a part of speech that matches ours, then how many of our gloss's
    words its senses contain. `max(..., key=len)` — the longest entry — was the
    rule before (2026-09-20) and it handed «есть» ("there is") the verb "to
    eat", «а» the name of the letter, and «весь» the dated adjective.

    A noun, verb or adjective takes its one best entry. A closed-class word
    takes them all, best first — «же» is a particle *and* a conjunction, and
    both are what a learner tapping it wants — but a noun or verb entry only
    when it says something our gloss says («есть» keeps the verb, «у» loses
    "Wu (language)"). Letter names go, dated and rare senses go last, and if
    the first sense still says nothing our gloss does, the sense that matches
    our first sense moves up («стать»: "to become" above "to stand") — and if
    none does, our first sense is put in front as sense 1, because the entry
    must open on the meaning the lesson taught («ничего»: Wiktionary has only
    the colloquial "so-so"; the lesson teaches "nothing").
    """
    want = POS_TO_WIKT.get(pos, ())
    ours = gloss_words(gloss)
    first_group = (gloss or "").split(";", 1)[0]
    first = gloss_words(first_group)
    # For "does the entry say what the lesson teaches?" the comparison is on
    # every word, qualifiers aside: «на» is "on (place)" and Wiktionary's "onto,
    # on" says it — "place" is a note, and "on" is the meaning, stop word or not.
    plain = lambda s: set(re.findall(r"[a-z']+", re.sub(r"\([^)]*\)", " ", s or "").lower()))
    taught = plain(first_group)

    ranked = []
    for wpos, js in by_pos.items():
        senses = [s for s in json.loads(js) if not LETTER_SENSE.search(s["g"])]
        if not senses:
            continue
        said = set().union(*(gloss_words(s["g"]) for s in senses))
        overlap = len(ours & said)
        ranked.append(((wpos in want, min(overlap, 3), len(senses)), wpos, overlap, senses))
    if not ranked:
        return [], False
    # A proper-noun entry only when it is all there is («Россия», «Москва»).
    if len(ranked) > 1:
        ranked = [r for r in ranked if r[1] != "name"] or ranked
    ranked.sort(key=lambda r: r[0], reverse=True)

    if pos in OPEN_CLASS:
        chosen = list(ranked[0][3])
    else:
        chosen = []
        for _score, wpos, overlap, senses in ranked:
            if wpos in OPEN_CLASS_WIKT and not overlap and chosen:
                continue
            chosen.extend(senses)
        chosen = chosen[:MAX_SENSES]

    late = [s for s in chosen if LATE_TAGS & set(s.get("t") or ())]
    chosen = [s for s in chosen if s not in late] + late
    # **Sense 1 must be the meaning the lesson teaches** — the owner,
    # 2026-09-22: *"make sure the topmost definition is the MOST COMMON
    # definition."* Wiktionary orders its senses historically as often as not,
    # and the test here used to be "does sense 1 touch our gloss *anywhere*",
    # which any of a long gloss's later senses could satisfy: «стол» glosses
    # "table, desk, board; diet, cooking, cuisine", so a Wiktionary sense about
    # diet counted as a match and stayed on top. Against the **first group**
    # alone — what `firstSense` returns, which is the quiz prompt and the
    # graded answer — the word's commonest meaning leads or nothing does.
    if chosen and not (gloss_words(chosen[0]["g"]) & first):
        best = max(chosen, key=lambda s: len(gloss_words(s["g"]) & first))
        if gloss_words(best["g"]) & first:
            chosen.remove(best)
            chosen.insert(0, best)
    fronted = False
    if taught and not any(plain(s["g"]) & taught for s in chosen):
        chosen.insert(0, {"g": first_group.strip()})
        fronted = True
    return chosen[:MAX_SENSES], fronted


OPEN_CLASS_WIKT = ("noun", "verb", "adj")
MAX_SENSES = 8          # ingest_wiktionary.py's cap, kept after the entries are merged


def load_senses(lemmas, stats):
    """Numbered senses for the studied words (tools/ingest_wiktionary.py).

    The owner, 2026-09-11, with a Merriam-Webster entry beside the app: *"every
    single word should have a detailed entry with multiple uses of the word"*.
    OpenRussian gives a list of translations, not senses — 89% of the studied
    lemmas had exactly one sense group — so the senses come from Wiktionary,
    which has them, under CC BY-SA 3.0.

    Matched on the folded headword; which of the spelling's entries, and in what
    order, is `pick_senses`. Shipped as its own lazily-required file: the entry
    needs them when a word is opened, and boot does not (§30i P9.24).
    """
    path = ROOT / "data" / "senses.db"
    if not path.exists():
        stats["senses"] = 0
        return {}
    db = sqlite3.connect(str(path))
    rows = {}
    for key, pos, js in db.execute("SELECT key, pos, json FROM senses"):
        rows.setdefault(key, {})[pos] = js
    credit = dict(db.execute("SELECT k, v FROM meta").fetchall())
    db.close()

    out, found, multi, fronted = {}, 0, 0, []
    for i, l in enumerate(lemmas):
        by_pos = rows.get(fold(l.get("b") or ""))
        if not by_pos:
            continue
        senses, front = pick_senses(l.get("e") or "", l.get("p"), by_pos)
        if not senses:
            continue
        out[str(i)] = senses
        found += 1
        if len(senses) > 1:
            multi += 1
        if front:
            fronted.append(l.get("b"))
    stats["senses"] = found
    stats["senses_multi"] = multi
    stats["senses_fronted"] = len(fronted)
    stats["senses_credit"] = credit
    # The words whose entry opens on our gloss rather than a Wiktionary sense —
    # a list to read after a rebuild, since each is either a synonym the word
    # match could not see or a real gap in Wiktionary.
    work = ROOT / "data" / "_work"
    work.mkdir(parents=True, exist_ok=True)
    (work / "senses_fronted.txt").write_text("\n".join(fronted), encoding="utf-8")
    return out


def load_scripts(stats):
    """The written lesson passages (CLAUDE.md 30l).

    One file per chapter under data/curated/scripts/, merged into a single map
    keyed "unitId:lessonIndex". These are authored rather than harvested, which
    is the whole reason tools/check_scripts.mjs exists — that tool is what
    proves each passage stays inside the vocabulary its lesson has taught, and
    it runs on the built payload, so it must be run after this. Small enough
    (tens of kilobytes) to ride in data.json and be there at boot.
    """
    out = {}
    sdir = ROOT / "data" / "curated" / "scripts"
    if not sdir.exists():
        stats["written"] = 0
        return out
    for path in sorted(sdir.glob("*.json")):
        obj = json.loads(path.read_text(encoding="utf-8"))
        for key, entry in (obj.get("lessons") or obj).items():
            if key in out:
                raise SystemExit(f"{path.name}: {key} is written twice")
            # Who is in it, what they say, and the questions about the
            # situation. Only the fields the app reads are shipped.
            out[key] = {
                "title": entry["title"],
                "cast": [{"id": c["id"], "ru": c["ru"], "en": c["en"]}
                         for c in entry["cast"]],
                "lines": [{"s": l["s"], "ru": l["ru"], "en": l["en"]}
                          for l in entry["lines"]],
                "questions": [{"ask": q["ask"], "options": list(q["options"]),
                               "answer": int(q["answer"])}
                              for q in entry["questions"]],
            }
    stats["written"] = len(out)
    stats["written_lines"] = sum(len(e["lines"]) for e in out.values())
    return out


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
    # from one generation of the data — in four files, not one: the dictionary,
    # the sentence pool and the video library are most of the bytes and none of
    # the first screen, so the app requires each on first use (P9.24). The
    # tools read them back together (tools/payload.mjs).
    native_assets = ROOT / "native" / "assets"
    if native_assets.exists():
        parts = {k: payload[k] for k in NATIVE_PARTS}
        parts["data"] = {k: v for k, v in payload.items() if k not in NATIVE_PARTS}
        sizes = []
        for name in ["data"] + NATIVE_PARTS:
            text = json.dumps(parts[name], ensure_ascii=False, separators=(",", ":"))
            (native_assets / f"{name}.json").write_text(text, encoding="utf-8")
            sizes.append(f"{name}.json {len(text.encode('utf-8'))/1_048_576:.2f} MB")
        print(f"  native data  : {', '.join(sizes)}")
        print(f"  records      : {payload['stats'].get('lemmas_with_record', 0):,} of "
              f"{len(payload['lemmas']):,} studied rows carry their own paradigm record, "
              f"{payload['stats'].get('lemmas_twinned', 0)} a twin's; none needs the dictionary at boot")

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
    v = st.get("examples_variety") or {}
    if v.get("plain_words"):
        n = v["plain_words"]
        print(f"  examples     : {n:,} words with 2+ sentences; shown in one form only "
              f"{v['plain_one_form']:,} → {v['varied_one_form']:,}, "
              f"near-duplicate pairs {v['plain_near']:,} → {v['varied_near']:,}")
    # The pools are cut by curriculum coverage (measure_sentences); the difficulty
    # histogram is the wider picture of how much of the corpus resolves at all.
    if st.get("sentences_measured"):
        print(f"  sentences    : {st['sentences_measured']:,} measured, "
              f"{st['sentences_with_unit']:,} placed in a unit, "
              f"{st['sentences_with_audio']:,} with a recording")
        print("  difficulty   : " + "  ".join(f"{lab} {n:,}" for lab, n in st["difficulty_hist"]))
    # Pool sizes per unit. A unit below the floor is named: a speaking activity that
    # keeps asking the same five sentences is worse than none.
    if st.get("speech_rows") is not None:
        print(f"  speech rows  : {st['speech_rows']:,} sentences; "
              f"{st['speech_folded']:,} second spellings of one folded through to it")
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
    # The written lesson passages. `node tools/check_scripts.mjs --strict` is what
    # says they are at level and complete; this line only says how many shipped.
    print(f"  passages     : {st.get('written', 0)} lessons written, "
          f"{st.get('written_lines', 0)} sentences")
    # Numbered senses, from Wiktionary (tools/ingest_wiktionary.py). The share
    # with more than one is the number that matters: OpenRussian's glosses gave
    # 11% of the curriculum a second sense and this is what replaced that.
    if st.get("senses"):
        cr = st.get("senses_credit") or {}
        print(f"  senses       : {st['senses']:,} words, {st.get('senses_multi', 0):,} "
              f"with more than one ({st['senses_multi']*100//max(1, st['senses'])}%), "
              f"{st.get('senses_fronted', 0):,} opening on our gloss (data/_work/senses_fronted.txt)"
              f"; {cr.get('source', '?')}, {cr.get('licence', '?')}")
    print(f"  scripts      : {', '.join(js_files)}")
    print(f"  page         : {(args.outdir / 'index.html').stat().st_size/1_048_576:.2f} MB")

    # Reported after the summary so the rest of the numbers are still readable,
    # but the exit code is non-zero: a curriculum that teaches a preposition as a
    # noun must not reach a build anyone deploys.
    for line in st.get("closed_class_taught") or ():
        print(f"  !! {line}")
    return 1 if st.get("closed_class_taught") else 0


if __name__ == "__main__":
    raise SystemExit(main())

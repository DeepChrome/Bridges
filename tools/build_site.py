"""Generate the standalone app: lookup, flashcards, learning path, status.

Bakes the lexicon subset, the study units and the path layout into one
self-contained HTML file. No server, no external requests.

    python tools/build_site.py --lemmas 4000
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import sys
import unicodedata
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


VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
WORD_RE = re.compile(r"[а-яёА-ЯЁ́̀]+")


def _stressed(word):
    """Vowel indices (from the start) carrying an acute, read in NFC — a
    Cyrillic vowel has no precomposed acute, so the mark is its own character
    after it, and NFC keeps й and ё whole where NFD would split them."""
    out, v = [], -1
    for ch in word:
        if ch in VOWELS:
            v += 1
            if ch in "ёЁ":
                out.append(v)
        elif ch == "́":
            out.append(v)
    return out


def stress_table(db):
    """fold(form) -> every vowel index the lexicon stresses in that spelling,
    from each paradigm form and headword that carries exactly one stress."""
    table = {}
    for (acc,) in db.execute("select accented from paradigm union select accented from lemmas"):
        for w in WORD_RE.findall(unicodedata.normalize("NFC", acc or "")):
            sv = sorted(set(_stressed(w)))
            if len(sv) == 1:
                table.setdefault(fold(w), set()).add(sv[0])
    return table


def yo_table(db):
    """fold(form) -> the one spelling with ё, for every form the lexicon only
    ever writes with ё. «Сколько молока дает эта корова?» showed «дает» beside
    options «даёшь», «даём» read off the tables, and the voice — reading the
    word right — sounded wrong against the text (the owner, 2026-10-09). The
    collection often drops the dots. **Only where there is no choice**: «все»
    and «всё» are two words, and a key the lexicon also spells with е, or with
    ё in two places, is left as written (check_scripts.mjs YO_ONLY, the same
    rule for the authored scripts)."""
    yo, ambiguous = {}, set()
    for (acc,) in db.execute("select accented from paradigm union select accented from lemmas"):
        for w in WORD_RE.findall(unicodedata.normalize("NFC", acc or "")):
            plain = unicodedata.normalize("NFC", unicodedata.normalize("NFD", w).replace("́", "").replace("̀", "")).lower()
            k = fold(plain)
            if "ё" in plain:
                if yo.get(k, plain) != plain:
                    ambiguous.add(k)
                yo.setdefault(k, plain)
            elif "е" in plain:
                ambiguous.add(k)
    for k in ambiguous:
        yo.pop(k, None)
    return yo


def restore_yo(ru, table, tally):
    """The sentence with ё put back where `yo_table` leaves no choice. Letter
    for letter: the stress marks and the capitals stay as they were."""
    def word(m):
        w = m.group(0)
        if "ё" in w.lower():
            return w
        target = table.get(fold(w))
        if not target:
            return w
        out, letters = [], iter(target)
        for ch in unicodedata.normalize("NFD", w):
            if unicodedata.combining(ch):
                out.append(ch)
                continue
            t = next(letters, None)
            if t == "ё" and ch in "еЕ":
                out.append("Ё" if ch == "Е" else "ё")
            else:
                out.append(ch)
        tally["yo"] += 1
        return unicodedata.normalize("NFC", "".join(out))
    return re.sub(r"[а-яёА-ЯЁ́̀]+", word, ru)


def tidy_quotes(ru):
    """No space just inside a pair of straight quotes: «Давай на "ты ".» in
    the Languages on Fire deck. Quotes are paired left to right."""
    if ru.count('"') < 2 or ru.count('"') % 2:
        return ru
    parts = ru.split('"')
    for n in range(1, len(parts), 2):          # the quoted spans
        parts[n] = parts[n].strip()
    return '"'.join(parts)


def fix_stress(ru, table, tally):
    """A shown sentence's stress marks, kept only where they can be right.

    (a) An acute on a consonant is a typing slip in the source — and NFC
    composes г + ◌́ into one letter, «ѓ», which no token pattern matches, so
    the word fell out of its sentence's tokens altogether. It is removed.
    (b) A mark on a vowel the lexicon never stresses in that spelling —
    «со́товой», «две́рей», «контро́ля» — teaches a wrong stress to the one
    person who cannot tell. The word's marks are removed rather than moved:
    where the right stress is a guess, no mark says "unknown", which is true
    (§26). A spelling the lexicon does not know, or knows with no stress,
    keeps its mark — and so does a spelling it stresses two ways: «мо́ю» is
    "I wash" and «мою́» "my", and only the sentence can say which was meant.
    (c) A mark typed twice on one vowel («него́́») is one mark.
    Returns the sentence; counts what it did in `tally`."""
    if "́" not in ru and "ѓ" not in ru and "ќ" not in ru:
        return ru
    d = unicodedata.normalize("NFD", ru)
    out = []
    for ch in d:
        if ch == "́":
            if out and out[-1] == "́":
                tally["doubled"] += 1           # «него́́»: one mark typed twice
                continue
            base = next((c for c in reversed(out) if not unicodedata.combining(c)), "")
            if not base or base.lower() not in "аеиоуыэюяё":
                tally["consonant"] += 1
                continue
        out.append(ch)
    s = unicodedata.normalize("NFC", "".join(out))

    def word(m):
        w = m.group(0)
        if "́" not in w:
            return w
        fixed = []
        for p in w.split("-"):
            # Only the acutes: an ё in the word is the source's spelling, not a mark.
            acute = set(_stressed(p.replace("ё", "е").replace("Ё", "Е")))
            known = table.get(fold(p))
            if acute and known and not (acute & known):
                tally["contradicted"] += 1
                p = p.replace("́", "")
            fixed.append(p)
        return "-".join(fixed)

    s = re.sub(r"[а-яёА-ЯЁ́̀]+(?:-[а-яёА-ЯЁ́̀]+)*", word, s)
    if s != ru:
        tally["sentences"] += 1
    return s


# Examples shown per word, on the entry and the cards.
N_EXAMPLES = 4
# Two sentences sharing this many studied words (the word's own forms aside)
# are the same sentence twice as far as a learner is concerned.
NEAR_DUPLICATE = 2
# A word is "common" when its lemma is among this many by corpus frequency —
# the size of vocabulary that covers most of everyday speech. An example built
# from them is one a learner can use tomorrow (the owner, 2026-09-28: "focus on
# using the most common words if there's a choice").
COMMON_RANK = 1500
# Difficulty tiers, by words and by how many uncommon words a sentence carries.
# The first four examples aim for one of each (EXAMPLE_TIERS), so the entry
# reads easy → medium → hard rather than four of a kind. Past LONG_WORDS a
# sentence is shown only when nothing shorter exists: «говорить» opened on a
# twenty-word sentence, and nobody learns a word from one.
EASY_WORDS, MEDIUM_WORDS, LONG_WORDS = 6, 10, 15
EXAMPLE_TIERS = (0, 1, 2, 0)


def example_tier(words, rare):
    """0 easy, 1 medium, 2 hard, 3 too long or too rare to lead with."""
    if words <= EASY_WORDS and rare == 0:
        return 0
    if words <= MEDIUM_WORDS and rare <= 1:
        return 1
    if words <= LONG_WORDS and rare <= 3:
        return 2
    return 3


ARCHAIC_EN = re.compile(r"\b(abide|abideth|thee|thou|thy|thine|hath|hast|shalt|doth|dost|unto|ye|wherefore|whither|whence|thence|o'er|'tis)\b", re.I)


def load_rejected():
    """The sentences a reader judged not worth learning from (the owner,
    2026-10-03: "he watches television, football… doesnt seem like a normal
    sentence"): tools/review_sentences.mjs writes the verdicts to
    data/curated/sentence_review.json, keyed by the folded sentence, and every
    one with a reason is left out of the pools, the video lines, the
    dictionary examples and the sense examples."""
    path = ROOT / "data" / "curated" / "sentence_review.json"
    # A build with every sentence in, for tools/review_sentences.mjs --recheck
    # to read the dropped ones again.
    if not path.exists() or os.environ.get("BRIDGES_IGNORE_REVIEW"):
        return frozenset()
    reviewed = json.loads(path.read_text(encoding="utf-8")).get("reviewed", {})
    return frozenset(k for k, why in reviewed.items() if why)


REJECTED = load_rejected()


def load_off_sense():
    """Example sentences that use a word in a meaning it is not taught in
    (the owner, 2026-10-05: «вилка» is taught as "fork", and its gap-fill was
    a sentence about a plug). tools/review_example_sense.mjs writes the
    verdicts to data/curated/example_sense.json keyed "fold(word)|fold(
    sentence)"; one with a reason is left out of that word's examples only —
    the sentence stays everywhere else, where it is not about this word."""
    path = ROOT / "data" / "curated" / "example_sense.json"
    if not path.exists():
        return frozenset()
    checked = json.loads(path.read_text(encoding="utf-8")).get("checked", {})
    return frozenset(k for k, why in checked.items() if why)


OFF_SENSE = load_off_sense()


def load_stress_review():
    """Which stress a two-way spelling takes in a shown sentence
    (tools/review_stress.py): {fold(sentence): {fold(word): vowel index}}, and
    for a pick that moves the deck's mark, whether a second reading agreed. The
    owner found «Прихо́дите в субботу» ("Come on Saturday" — «приходи́те»);
    Russian Core 5000 had stressed hundreds of sentences that way, «большой» as
    «бо́льший» throughout."""
    path = ROOT / "data" / "curated" / "stress_review.json"
    if not path.exists():
        return {}, {}
    s = json.loads(path.read_text(encoding="utf-8"))
    return s.get("picked", {}), s.get("agreed", {})


STRESS_PICKED, STRESS_AGREED = load_stress_review()


def apply_stress_review(s, tally):
    """Move a deck's mark to the reviewed stress; where the two readings
    disagreed, drop it — no mark says "unknown", which is true (§26)."""
    picks = STRESS_PICKED.get(fold(s))
    if not picks:
        return s
    agreed = STRESS_AGREED.get(fold(s), {})

    def word(m):
        w = m.group(0)
        k = fold(w)
        if k not in picks or "́" not in unicodedata.normalize("NFD", w):
            return w
        v = picks[k]
        if v in _stressed(w.replace("ё", "е").replace("Ё", "Е")):
            return w
        plain = unicodedata.normalize("NFC", unicodedata.normalize("NFD", w).replace("́", ""))
        if not agreed.get(k):
            tally["stress_dropped"] += 1
            return plain
        tally["stress_moved"] += 1
        n, out = -1, []
        for ch in plain:
            out.append(ch)
            if ch in VOWELS:
                n += 1
                if n == v and ch not in "ёЁ":
                    out.append("́")
        return unicodedata.normalize("NFC", "".join(out))

    return WORD_RE.sub(word, unicodedata.normalize("NFC", s))


def rank_examples(cands, sentences, sent_tokens, studied_keys, own_keys=(), tally=None,
                  key_rank=None):
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

    Then the owner, 2026-09-28: examples should be *useful*, *vary in
    difficulty*, and prefer *common words*. So difficulty is no longer "words
    outside the curriculum" — every word is in the curriculum somewhere — but
    how many words fall outside the commonest COMMON_RANK (`key_rank`, the
    word's own forms excepted) and how long the sentence is, read into three
    tiers (example_tier). The four shown aim for EXAMPLE_TIERS in turn, nearest
    tier when one is empty, and are shown easiest first.

    `tally`, when given, counts what the plain order would have shown against
    what this shows, so the build can print the difference rather than claim it.
    """
    key_rank = key_rank or {}
    best = {}
    for iid in cands:
        ru, en, _deck, has_audio = sentences[iid]
        # A vocabulary card's bare headword («читать — to read») is an item in
        # the corpus and, being the shortest and wholly known, was the first
        # "example" of every verb it had a card for. One word is not a sentence.
        if len(re.findall(r"[а-яёА-ЯЁ]+", ru)) < 2:
            continue
        # Nor is a one-word translation an example of anything: «У телефона.» —
        # "Speaking." is a telephone idiom, and as the first example of «у» it
        # read as a mistranslation (the owner, 2026-09-24). A sentence whose
        # English is a single word is an idiom or a fragment either way.
        if len(re.findall(r"[A-Za-z']+", en or "")) < 2:
            continue
        # Nor a translation in an older English than anyone speaks: «Останься
        # со мной» — "Abide with me", a hymn title, was the second example on
        # the second card of the course (the walkthrough, 2026-09-30). The
        # learner reads the English to learn what the Russian means today.
        if ARCHAIC_EN.search(en or ""):
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
        # `rest` is every other token of the sentence, not only the studied
        # ones: «Я уснул читая» and «Читая книгу, я уснул» share «читая», which
        # the lexicon has no key for, and counting studied keys alone saw them
        # share one word and showed both (the owner, 2026-09-24).
        rest = [k for k in toks if k not in own]
        # A token with no known lemma (a name, a rare form) counts as uncommon.
        rare = sum(1 for k in rest if key_rank.get(k, COMMON_RANK + 1) > COMMON_RANK)
        words = len(re.findall(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*", sentences[iid][0]))
        info[iid] = (rare, words, frozenset(k for k in toks if k in own), frozenset(rest),
                     example_tier(words, rare),
                     sum(1 for k in toks if k not in studied_keys))

    # The order this replaced, kept only to be measured against.
    plain = sorted(kept, key=lambda i: (info[i][5], len(sentences[i][0]), i))[:N_EXAMPLES]
    pool = sorted(kept, key=lambda i: (info[i][4], info[i][0], info[i][1], i))
    # Too long or too rare to teach from: shown only when it is all there is.
    # Three short examples beat three and a paragraph, and a slot left empty
    # is filled from Tatoeba, whose sentences are short (build_dictionary).
    if pool and info[pool[0]][4] < 3:
        pool = [i for i in pool if info[i][4] < 3]

    chosen, forms_seen = [], set()
    for target in EXAMPLE_TIERS:
        if not pool:
            break

        def choice(iid):
            rare, words, forms, rest, tier, _ = info[iid]
            repeat = bool(forms) and forms <= forms_seen
            # How much of this sentence is a sentence already chosen: the most
            # words shared with any of them. A threshold alone let the third
            # example be the near-copy when nothing crossed it; a graded overlap
            # prefers the sentence that shares least.
            overlap = max((len(rest & info[c][3]) for c in chosen), default=0)
            # …and a short sentence that is one already chosen with a word
            # swapped («Мы — люди» / «Они — люди»): counting only the words
            # outside the headword, two two-word sentences never overlapped.
            swapped = any(
                min(words, info[c][1]) <= 4
                and len((rest | forms) & (info[c][3] | info[c][2])) >= min(words, info[c][1]) - 1
                for c in chosen)
            near = overlap >= NEAR_DUPLICATE or swapped
            # The nearest tier to the target, a too-long sentence last of all;
            # within it a new form, then no near copy, then common and short.
            return (tier == 3, abs(tier - target), near, repeat, overlap, rare, words, iid)
        pick = min(pool, key=choice)
        chosen.append(pick)
        pool.remove(pick)
        forms_seen |= info[pick][2]
    chosen.sort(key=lambda i: (info[i][4], info[i][0], info[i][1]))

    if tally is not None and len(kept) > 1:
        for name, shown in (("plain", plain), ("varied", chosen)):
            forms = {f for i in shown for f in info[i][2]}
            tally[name + "_words"] += 1
            tally[name + "_one_form"] += len(forms) <= 1
            tally[name + "_near"] += sum(
                1 for a in range(len(shown)) for b in range(a)
                if len(info[shown[a]][3] & info[shown[b]][3]) >= NEAR_DUPLICATE)
            tally[name + "_long"] += any(info[i][1] > LONG_WORDS for i in shown)
            tally[name + "_rare"] += sum(info[i][0] for i in shown)
            tally[name + "_spread"] += len({min(info[i][4], 2) for i in shown}) >= 2
    return chosen + pool


def build_dictionary(db, sentences, items_of_key, keys_of, stats,
                     ext_sentences=None, ext_items_of_key=None,
                     resolver=None, sent_tokens=None, studied_keys=frozenset(),
                     key_rank=None):
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
        # …and never in a meaning the word is not taught in (OFF_SENSE).
        off = (lambda ru: f"{fold(bare)}|{fold(ru)}" in OFF_SENSE) if OFF_SENSE else (lambda ru: False)
        cands = {i for k in keys for i in items_of_key.get(k, ())
                 if i in sentences and not off(sentences[i][0])}
        ranked = (rank_examples(cands, sentences, sent_tokens or {}, studied_keys, keys, tally,
                                key_rank)
                  if sent_tokens is not None else sorted(cands))
        refs = [str(sentence_ref(iid)) for iid in ranked[:N_EXAMPLES]]
        own = len(refs)
        if ext_items_of_key and len(refs) < N_EXAMPLES:
            spare = N_EXAMPLES - len(refs)
            ext = {x for k in keys for x in ext_items_of_key.get(k, ())
                   if x in ext_sentences and not off(ext_sentences[x][0])}
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
NATIVE_PARTS = ["deep", "sent", "videos", "senses", "deepforms"]


def unit_info_of(units, path):
    """{unit index: (chapter, spine?, optional?)} read off the path, where a
    spine row opens each chapter."""
    info, chapter = {}, -1
    for row in path:
        u = units[row["u"]]
        if u["kind"] == "spine":
            chapter += 1
        info[row["u"]] = (max(chapter, 0), u["kind"] == "spine", bool(u.get("opt")))
    return info


def guaranteed_matrix(info, order):
    """g[t][u]: a learner standing at unit u has certainly been taught unit t.
    The spine of this chapter and every earlier one, the required side quests
    of earlier chapters, and u itself — never an optional quest but u, and
    never a sibling quest, which may be done in any order (§30e, §30ap)."""
    g = {}
    for t in order:
        ct, st, ot = info.get(t, (0, True, False))
        g[t] = {}
        for u in order:
            cu = info.get(u, (0, True, False))[0]
            g[t][u] = (t == u or (st and ct <= cu) or (not st and not ot and ct < cu))
    return g


def measure_sentences(sentences, sent_tokens, index, key_units, lemmas, unit_pos,
                      audio, src_of, stats, unit_info=None):
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

    "Latest unit teaching one of its words" was not enough once side quests
    became a mix of required and optional (§30ap): a sentence whose latest
    word came from an optional quest, or from a sibling quest the learner may
    not have done yet, landed in a pool asked of learners who were never
    taught it. So a sentence's unit is the earliest unit on the route at which
    every one of its words is *guaranteed* (`guaranteed`, from `unit_info`).
    """
    order = sorted(unit_pos, key=unit_pos.get)
    guaranteed = guaranteed_matrix(unit_info or {}, order)
    out = []
    for iid, (ru, en, _deck, _has) in sentences.items():
        toks = sent_tokens.get(iid)
        if not toks:
            continue
        n = len(toks)
        studied = sum(1 for k in toks if k in index)
        unit, covered, need = None, True, []
        for k in toks:
            taught = key_units.get(k)
            if taught:
                need.append(taught)
                continue
            hit = index.get(k)
            fr = lemmas[hit[0]].get("fr") if hit else None
            if not (fr and fr <= COVERAGE_FREE_RANK):
                covered = False
                break
        if covered and need:
            unit = next((u for u in order
                         if all(any(guaranteed[t][u] for t in ts) for ts in need)), None)
            covered = unit is not None
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
            "googletts": "g", "other": "o", "video": "v"}


# The transcript panel's lines (2026-09-29, the owner: *"a transcript button
# below the videos that will display an autoscrolling transcript that
# highlights the word being said"*). A line ends at a pause long enough to be
# one, or once it is long enough to read at a glance.
LINE_PAUSE_MS = 700
LINE_WORDS = 10


def video_transcripts(ids):
    """{video: [[start ms, "words", [each word's offset from the start, in
    centiseconds], (the positions in the line of sound tags)], …]} from the
    auto-captions (build_transcripts words_with_times, which already collapses
    a rolling caption's repeats). Offsets rather than times, and centiseconds
    rather than milliseconds, because the file is mostly numbers and these are
    the short ones. The fourth field is only there when a line has a sound tag
    — «[музыка]» — and the words stay as they were, so the English keyed on
    them still matches."""
    from build_transcripts import words_with_times, SUBS
    out = {}
    for vid in ids:
        tags = []
        stream = words_with_times(SUBS / f"{vid}.ru-orig.json3", tags)
        if not stream:
            continue
        tagged = set(tags)
        stream = [(w, at, k in tagged) for k, (w, at) in enumerate(stream)]
        # A pause is long *for this video*. A slow beginner episode leaves
        # most of a second between every word, so a fixed 0.7 s cut every
        # word onto its own line ("Добро / пожаловать / в / ресторан", seen
        # on the emulator 2026-09-30). The cut is a few times this video's
        # own typical gap, never less than LINE_PAUSE_MS.
        gaps = sorted(b[1] - a[1] for a, b in zip(stream, stream[1:]))
        typical = gaps[len(gaps) // 2] if gaps else 0
        pause = max(LINE_PAUSE_MS, int(typical * 2.5))
        # Where the captions capitalise a sentence's first word, that is the
        # best cut there is; a proper noun mid-sentence costs one early break.
        # Only trusted when capitals are common, i.e. the captions do mark
        # sentences rather than just names.
        caps = sum(1 for w, _, _ in stream if w[:1].isupper()) / len(stream)
        by_capital = caps >= 0.08
        lines, cur = [], []
        for item in stream:
            w, at, _ = item
            if cur and (at - cur[-1][1] >= pause or (by_capital and w[:1].isupper() and len(cur) >= 2)):
                lines.append(cur)
                cur = []
            elif len(cur) >= LINE_WORDS:
                # Full: cut where the speaker paused longest (never before the
                # third word), not at exactly LINE_WORDS — captions carry no
                # punctuation, and a hard cut split «такос и / начос».
                k = max(range(3, len(cur)), key=lambda i: cur[i][1] - cur[i - 1][1])
                lines.append(cur[:k])
                cur = cur[k:]
            cur.append(item)
        if cur:
            lines.append(cur)
        rows = []
        for ln in lines:
            row = [ln[0][1], " ".join(w for w, _, _ in ln), [(at - ln[0][1]) // 10 for _, at, _ in ln]]
            sounds = [k for k, (_, _, tag) in enumerate(ln) if tag]
            if sounds:
                row.append(sounds)
            rows.append(row)
        out[vid] = rows
    return out


# Words that open a spoken line without changing what it says.
NEAR_DUP_FILLER = {"а", "и", "но", "ну", "вот", "да", "так", "вон"}


def merge_near_duplicates(speech, units, stats):
    """One sentence where the pools held two a word apart (the owner,
    2026-10-05: "I shouldn't see sentences that are like... a single word off.
    Like this is my sister... and then the next sentence is 'and this is my
    sister'"). A video says the same line several times with a word changed,
    and the decks repeat themselves too, so the flashcards dealt both.

    Two rows are one when, with an opening filler word (а, и, ну, вот…) set
    aside, their words are the same, or — at three words or more — one word
    apart. Rows are never renumbered; only the listings that point at them
    thin out."""
    rows = speech["rows"]

    def words(ru):
        w = [fold(x) for x in re.findall(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*", ru)]
        return w[1:] if len(w) > 1 and w[0] in NEAR_DUP_FILLER else w

    # Lookups by signature rather than a comparison of every pair: the same
    # words, the words with one swapped for a wildcard, the words with one
    # left out. Two sentences one word apart share one of them.
    canon, full, subs, dels = {}, {}, {}, {}
    for k, r in enumerate(rows):
        w = tuple(words(r[0]))
        same = full.get(w)
        if same is None and len(w) >= 3:
            for i in range(len(w)):
                same = subs.get(w[:i] + ("*",) + w[i + 1:])
                if same is not None:
                    break
        if same is None and len(w) - 1 >= 3:
            for i in range(len(w)):
                same = full.get(w[:i] + w[i + 1:])
                if same is not None:
                    break
        if same is None and len(w) >= 3:
            same = dels.get(w)
        canon[k] = k if same is None else same
        if same is None:
            full.setdefault(w, k)
            for i in range(len(w)):
                subs.setdefault(w[:i] + ("*",) + w[i + 1:], k)
                dels.setdefault(w[:i] + w[i + 1:], k)
    # Each sentence stays itself — a twin may use a word its unit has not
    # taught (check_pools_guaranteed caught «Ты как Том» standing in for a
    # chapter-1 line) — and a later one is dropped when its twin is already
    # listed in this unit or one before it on the route.
    dropped = 0
    for pool in ("speak", "listen"):
        groups = set()
        for u in units:
            lst = speech[pool].get(u["id"])
            if not lst:
                continue
            out = []
            for k in lst:
                g = canon.get(k, k)
                if g in groups:
                    dropped += 1
                    continue
                groups.add(g)
                out.append(k)
            speech[pool][u["id"]] = out
    for u in units:
        v = u.get("v")
        if v and v.get("lines"):
            groups, out = set(), []
            for row, t in v["lines"]:
                g = canon.get(row, row)
                if g in groups:
                    dropped += 1
                    continue
                groups.add(g)
                out.append([row, t])
            v["lines"] = out
    stats["near_duplicates"] = dropped
    print(f"  near-dupes   : {dropped:,} listings dropped, each a word apart from one already listed")


def add_video_lines(speech, units, measure, stats):
    """Sentences from each unit's goal video (tools/build_video_lines.py) into
    the pools, and onto the unit as `v.lines` — [row, ms] — so a lesson can
    show the video's own sentences and play the moment each is said (the
    owner, 2026-09-29: *"for those sentences, we should only use the ones in
    the video"*).

    A line joins the speaking and listening pools at the unit where every word
    in it has been taught, like any corpus sentence (measure_sentences); it is
    on its own unit's `v.lines` regardless, since there it is shown, not asked.
    It has no recording from the collection: tools/build_word_audio.mjs buys
    one for every pool row that lacks it, in the voice the lessons use."""
    path = ROOT / "data" / "video_lines.json"
    if not path.exists():
        return
    lines = json.loads(path.read_text(encoding="utf-8")).get("lines", {})
    rows = speech["rows"]
    at = {fold(r[0]): k for k, r in enumerate(rows)}
    sents, toks, meta = {}, {}, {}
    for u in units:
        v = u.get("v")
        for n, ln in enumerate(lines.get(v["id"], []) if v else []):
            if fold(ln["ru"]) in REJECTED:
                stats["rejected"] = stats.get("rejected", 0) + 1
                continue
            sid = f"v:{v['id']}:{n}"
            sents[sid] = (ln["ru"], ln["en"], None, None)
            toks[sid] = [fold(w) for w in re.findall(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*", ln["ru"])]
            meta[sid] = (u, ln["t"])
    measured = {rec_id: rec for rec_id, rec in zip(sents, measure(sents, toks))}
    shown = pooled = 0
    for sid, (u, t) in meta.items():
        ru, en, n, diff, unit, _fname, _src = measured[sid]
        k = fold(ru)
        if k not in at:
            at[k] = len(rows)
            rows.append([ru, en, n, round(diff, 2), SRC_CODE["video"]])
        u["v"].setdefault("lines", []).append([at[k], t])
        shown += 1
        if unit is None:
            continue
        uid = units[unit]["id"]
        for pool, (lo, hi) in (("speak", SPEAK_TOKENS), ("listen", LISTEN_TOKENS)):
            if lo <= n <= hi:
                got = speech[pool].setdefault(uid, [])
                if at[k] not in got:
                    got.append(at[k])
                    pooled += 1
    stats["video_lines"] = shown
    stats["video_lines_pooled"] = pooled

# The video library (build_videos.py): how many curriculum words a video lists to
# listen for, how many moments each, and the frequency rank below which a word is
# a function word rather than something to listen for.
VIDEO_WORDS = 20
VIDEO_MOMENTS = 3
VIDEO_SKIP_TOP = 150
# Before a unit's video (2026-09-29): how many words to review, how many of
# those may be words the path has not taught yet, and which word classes
# count as something to listen for.
PREP_WORDS = 24
PREP_OWN = 14
PREP_NEW = 10
PREP_POS = ("noun", "verb", "adjective", "adverb")

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


WIKT_RAW = ROOT / "data" / "raw" / "wiktionary" / "russian.jsonl"
WIKT_FORMS_CACHE = ROOT / "data" / "_work" / "wiktionary_forms.json"


def wiktionary_forms(wanted):
    """Which Wiktionary headword lists each of `wanted` (folded forms) among
    its forms: {form: headword}. The raw dump is 900 MB, so what has been
    asked is cached (data/_work, a derived file) and the dump read again only
    for forms not asked before. A form no entry lists is cached as "" so it is
    not looked for twice. Without the dump, nothing is found."""
    cache = {}
    if WIKT_FORMS_CACHE.exists():
        cache = json.loads(WIKT_FORMS_CACHE.read_text(encoding="utf-8"))
    todo = {k for k in wanted if k not in cache}
    if todo and WIKT_RAW.exists():
        found = {}
        with WIKT_RAW.open(encoding="utf-8") as f:
            for line in f:
                e = json.loads(line)
                word = e.get("word") or ""
                if not word or e.get("lang_code", "ru") != "ru":
                    continue
                for fm in e.get("forms") or ():
                    k = fold(fm.get("form") or "")
                    if k in todo and k not in found and fold(word) != k:
                        found[k] = word
        for k in todo:
            cache[k] = found.get(k, "")
        WIKT_FORMS_CACHE.parent.mkdir(parents=True, exist_ok=True)
        WIKT_FORMS_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return {k: cache[k] for k in wanted if cache.get(k)}


def build_deep_forms(resolver, index, speech, sent_pool, senses, scripts, units, video_ids, stats,
                     studied_heads=frozenset()):
    """Every word form in the app's own Russian that is not a course word, to
    the dictionary headword it belongs to (the owner, 2026-10-03: "some words
    dont appear in our dictionary. Any word used in the videos, sentences, or
    anywhere in the app should be available").

    The studied index (`index`) has every form of the 4,000 course lemmas; the
    deep dictionary is headwords only (§30), so «палатку» in a sentence was
    plain text — not a link — though «палатка» has a full entry. Indexing all
    567,526 lexicon forms would cost megabytes for words nobody meets, so only
    the forms the app actually shows are indexed: the pools, the dictionary's
    sentences, the sense examples, the conversations, the grammar cards and the
    videos' transcripts. A shared form goes to the lemma the resolver names
    (§23: a form key is not a lemma); one it cannot settle stays unlinked.
    Value: "bare|pos", which the app resolves as it does a searched word."""
    texts = [r[0] for r in speech["rows"]]
    texts += [r[0] for r in sent_pool]
    for lst in senses.values():
        for s in lst:
            texts += [x.get("ru") or "" for x in s.get("x", ())]
    for entry in scripts.values():
        texts += [ln.get("ru") or "" for ln in entry.get("lines", ())]
    for u in units:
        texts += [e[0] for e in ((u.get("g") or {}).get("examples") or [])]
    for lines in video_transcripts(video_ids).values():
        texts += [ln[1] for ln in lines]
    out, unsettled, seen_n = {}, {}, Counter()
    for text in texts:
        for tok in re.findall(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*", text or ""):
            k = fold(tok)
            seen_n[k] += 1
            if k in index or k in out or k in unsettled:
                continue
            c, ambiguous = resolver.owner(k)
            if c and c["glossed"] and not c["stub"]:
                out[k] = f"{c['bare']}|{c['pos']}"
            else:
                unsettled[k] = ("shared" if ambiguous else "not in the lexicon" if not resolver.candidates(k)
                                else "no gloss")
    # What OpenRussian's tables do not list, Wiktionary's often do (the owner,
    # 2026-10-04: "Every word should always have a reference throughout our
    # entire app"): «говоря» is a form of говорить, «какие-то» of какой-то.
    # Taken only where the headword it names is one the dictionary has.
    def headword(word):
        c, _amb = resolver.owner(fold(word))
        return f"{c['bare']}|{c['pos']}" if c and c["glossed"] and not c["stub"] else None
    for k, word in wiktionary_forms(set(unsettled)).items():
        h = headword(word)
        if h:
            out[k] = h
            del unsettled[k]
    # …and a pronoun or adverb with a particle hyphened on («какая-нибудь»,
    # «кого-то», «кое-где») is that word: linked to it when nothing names the
    # compound itself.
    for k in list(unsettled):
        m = re.fullmatch(r"(?:кое-)?([а-яё]+?)(?:-(?:то|нибудь|либо|ка|таки))?", k)
        if not m or m.group(1) == k:
            continue
        base = m.group(1)
        h = headword(base)
        if h:
            out[k] = h
            del unsettled[k]
    # A key in the studied index that is the dictionary form of a noun nobody
    # studies: «кружка» is the mug before it is the genitive of the course's
    # «кружок», and the tap on «Моя кружка зелёная» opened "circle, ring"
    # (the owner, 2026-10-05). The corpus cannot settle it — it says «кружок»
    # six times and the mug never — and frequency would get «мира» wrong the
    # other way, so a person reads the candidates (data/_work/
    # link_candidates.txt) and the decision is data/curated/link_overrides.json.
    # Mapped here, where the app looks first (words.js entryOf); the studied
    # index is left alone, so grading and the curriculum do not move.
    link_path = ROOT / "data" / "curated" / "link_overrides.json"
    links = ({k: v for k, v in json.loads(link_path.read_text(encoding="utf-8")).items()
              if not k.startswith("_")} if link_path.exists() else {})
    claimed, candidates = [], []
    for k in [k for k in seen_n if k in index and k not in studied_heads]:
        for c in resolver.candidates(k):
            if c["head"] and c["pos"] == "noun" and c["glossed"] and not c["stub"]:
                candidates.append(f"{k}  →  {c['bare']}: {c['en'][:50]}")
    for k, target in links.items():
        bare_, _, pos = target.partition("|")
        hit = next((c for c in resolver.candidates(k)
                    if c["bare"] == bare_ and (not pos or c["pos"] == pos)), None)
        if not hit:
            raise SystemExit(f"link_overrides.json: «{k}» → {target} is not one of its lemmas")
        out[k] = f"{hit['bare']}|{hit['pos']}"
        claimed.append(k)
    stats["deep_forms_claimed"] = len(claimed)
    (ROOT / "data" / "_work").mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "_work" / "link_candidates.txt").write_text(
        "\n".join(sorted(candidates)) + "\n", encoding="utf-8")
    stats["deep_forms"] = len(out)
    stats["deep_forms_unsettled"] = len(unsettled)
    # What stays unlinked, commonest first, for a person to read after a build.
    work = ROOT / "data" / "_work"
    work.mkdir(parents=True, exist_ok=True)
    (work / "unlinked_forms.txt").write_text("\n".join(
        f"{seen_n[k]:6d}  {k}  ({why})" for k, why in sorted(unsettled.items(), key=lambda kv: -seen_n[kv[0]])),
        encoding="utf-8")
    return out


def check_grammar_cards(units, path, lemmas, index, unit_info):
    """Every Russian word in a unit's grammar card — the examples *and* the
    body, which is read first — is a word a learner at that unit was certainly
    taught (guaranteed_matrix: never an optional or sibling quest), or is
    within COVERAGE_FREE_RANK. A word the curriculum never teaches at all
    counts too: «пол» in Home's body and «по-русски» in Speech's were never
    taught anywhere, and only the examples were read. Prints what is not;
    returns the count."""
    order = [row["u"] for row in path]
    g = guaranteed_matrix(unit_info, order)
    owner = {}
    for n, u in enumerate(units):
        for i in u["w"]:
            owner.setdefault(i, set()).add(n)
    bad = 0
    for ui in order:
        u = units[ui]
        card = u.get("g")
        if not card:
            continue
        texts = [card.get("body") or ""] + [ru for ru, _en in card.get("examples", [])]
        for ru in texts:
            # A -ending or a lone letter in the body names a spelling, not a word.
            for m in re.finditer(r"(?<![-а-яёА-ЯЁ́])[а-яёА-ЯЁ́]+(?:-[а-яёА-ЯЁ́]+)*", ru):
                word = m.group(0)
                key = fold(word)
                if len(key) == 1:
                    continue                      # к, г, х: a letter the rule names
                hit = index.get(key)
                if not hit and word[:1].isupper():
                    continue                      # a name («Те́дди»), not a word to teach
                if hit and any(g[t][ui] for i in hit for t in owner.get(i, ())):
                    continue
                fr = lemmas[hit[0]].get("fr") if hit else None
                if fr and fr <= COVERAGE_FREE_RANK:
                    continue
                where = "/".join(sorted({units[t]["id"] for i in (hit or ()) for t in owner.get(i, ())}))
                print(f"  !! card {u['id']}: «{word}» is " + (f"taught only in {where}" if where else "never taught"))
                bad += 1
    return bad


def check_pools_guaranteed(speech, units, key_units, unit_info, unit_pos):
    """The shipped pools read back: every word of a sentence in a unit's pool is
    one a learner at that unit was certainly taught (guaranteed_matrix), or is
    within COVERAGE_FREE_RANK. Prints each breach; returns the count. Re-derived
    from the rows rather than trusted from measure_sentences, so a second path
    into the pools (add_video_lines) is held to the same rule."""
    g = guaranteed_matrix(unit_info, sorted(unit_pos, key=unit_pos.get))
    uidx = {u["id"]: n for n, u in enumerate(units)}
    bad, shown = 0, 0
    for pool in ("speak", "listen"):
        for uid, rows in speech[pool].items():
            u = uidx[uid]
            for r in rows:
                ru = speech["rows"][r][0]
                for k in re.findall(r"[а-яё]+(?:-[а-яё]+)*", fold(ru)):
                    ts = key_units.get(k)
                    if ts is None:
                        continue
                    if not any(g[t][u] for t in ts):
                        bad += 1
                        if shown < 8:
                            shown += 1
                            print(f"  !! {pool} {uid}: «{ru}» uses «{k}», taught only in "
                                  + "/".join(units[t]["id"] for t in ts))
                        break
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

    # Every sentence a learner is shown passes fix_stress on the way in: the
    # pools, the dictionary's examples (his decks and Tatoeba alike).
    # A recording is found by fold(text), so a sentence whose text is tidied
    # keeps its recording under the new key too (`retexted`, applied below).
    stresses, stress_tally = stress_table(db), Counter()
    yos = yo_table(db)
    sentences, retexted = {}, {}
    for iid, ru, en_s, deck, audio in db.execute(
            "select i.id, i.ru, i.en, d.name, i.audio from c.items i"
            " left join c.decks d on d.id=i.deck_id"
            " where i.kind='sentence' and i.en is not null"):
        shown = restore_yo(apply_stress_review(fix_stress(tidy_quotes(ru), stresses, stress_tally), stress_tally),
                           yos, stress_tally)
        if fold(shown) in REJECTED:
            stats["rejected"] = stats.get("rejected", 0) + 1
            continue
        if fold(shown) != fold(ru):
            retexted[fold(shown)] = fold(ru)
        sentences[iid] = (shown, en_s, (deck or "?").split("::")[0], audio is not None)

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
            # Tatoeba carries Bible verses in the King James register ("hath
            # eaten me up"); the rule rank_examples applies to his own decks.
            if ARCHAIC_EN.search(en_s or "") or fold(ru) in REJECTED:
                continue
            ext_sentences[xid] = (restore_yo(apply_stress_review(fix_stress(ru, stresses, stress_tally), stress_tally),
                                             yos, stress_tally), en_s, src)
        for k, xid in ex.execute("select key, item_id from item_tokens"):
            ext_items_of_key.setdefault(k, []).append(xid)
        row = ex.execute("select v from meta where k='licence'").fetchone()
        stats["ext_licence"] = row[0] if row else ""
        stats["ext_source"] = (ex.execute(
            "select v from meta where k='source'").fetchone() or [""])[0]
        ex.close()
    stats["ext_sentences"] = len(ext_sentences)
    stats["stress_fixed"] = dict(stress_tally)

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
    #
    # …but the resolver reads frequency in the decks, with no context, and a
    # learner meets a shared form inside the course: «семью» in a lesson that
    # teaches «семья» opened "seven times", «устал» opened the adjective
    # «усталый» while the course teaches «устать», «черепах» the skull. So where
    # the course teaches one of a form's candidates and the resolver's pick is
    # not taught, the taught one goes first — the word the learner was given is
    # the word the tap opens, with the form named (the data review,
    # 2026-10-01). A key a person settled in lemma_overrides.json is left as
    # they settled it: that is where «бегу» stays «бежать» against the taught
    # noun «бег».
    # (A form that is the dictionary form of a noun the course does not teach
    # — «кружка» the mug — is sent to that noun by the link map instead:
    # build_deep_forms and data/curated/link_overrides.json.)
    taught_idx = {pos_of[l] for l in unit_of if l in pos_of}
    reordered = taught_first = 0
    for k, ids in index.items():
        if len(ids) < 2:
            continue
        lid = resolver.owner_id(k)
        i = pos_of.get(lid)
        if (i is None or i not in taught_idx) and k not in resolver.overrides:
            t = next((j for j in ids if j in taught_idx), None)
            if t is not None:
                i = t
                taught_first += ids[0] != t
        if i is not None and ids[0] != i:
            ids.remove(i)
            ids.insert(0, i)
            reordered += 1
    stats["index_reordered"] = reordered
    stats["index_taught_first"] = taught_first

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

    # Which of a video's moments are a studied row's word. The transcript index
    # (build_transcripts.py) is keyed by the resolved lemma's bare form only,
    # and joining it to the studied rows by that string listed «голубое» under
    # «голубой» "gay", «пеки» under «печь» "oven" and «английские» under the
    # noun "English language" — the curriculum carries the noun row, the video
    # said the adjective or the verb. A moment belongs to a row when its form
    # is one of the row's own forms and the resolver gives the form to that
    # row, or to a twin of it (the same headword with the same forms: OpenRussian
    # lists «мой» as possessive and again as adjective).
    lid_at = {i: lid for lid, i in pos_of.items()}
    twins_memo = {}

    def twins(lid, bare):
        if lid not in twins_memo:
            mine = keys_of.get(lid, set())
            # A twin that is itself a studied row is a word of its own to the
            # app («есть» "there is" and «есть» "to eat" share every form).
            twins_memo[lid] = {o for (o,) in db.execute("select id from lemmas where bare=?", (bare,))
                               if o == lid or (o not in pos_of and keys_of.get(o, set()) == mine)}
        return twins_memo[lid]

    def said_as(i, occ):
        # The lists are keyed by the bare string and the app opens the first
        # studied row of that spelling, so only that row can be listed: a
        # moment of «есть» "to eat" would open «есть» "there is".
        if rows_of_bare[lemmas[i]["b"]][0] != i:
            return []
        lid = lid_at[i]
        mine, own = keys_of.get(lid, set()), twins(lid, lemmas[i]["b"])
        out = []
        for o in occ or ():
            k = fold(o.get("w") or "")
            if k in mine and resolver.owner_id(k) in own:
                out.append(o)
        return out

    rows_of_bare = {}
    for i, e in enumerate(lemmas):
        rows_of_bare.setdefault(e["b"], []).append(i)

    def row_said(bare, occ):
        """(row, its moments) for a spoken bare form, or None when no studied
        row is the word the video said."""
        rows = rows_of_bare.get(bare)
        m = said_as(rows[0], occ) if rows else []
        return (rows[0], m) if m else None

    units = []
    uidx = {}
    for tid, name, kind, n, opt in db.execute(
            "select id, name, kind, n, opt from topics order by ord"):
        rows = [(pos_of[l], k) for l, k in db.execute(
            "select lemma_id, lesson from t.unit_words where topic_id=? order by ord", (tid,))
            if l in pos_of]
        words = [i for i, _ in rows]
        uidx[tid] = len(units)
        u = {"id": tid, "name": name, "kind": kind, "w": words}
        # Each lesson's size, in order (build_topics.py cut_lessons): lessons end
        # where a group of related words ends, so they are not all one length.
        # core/questions.js lessonWordsOf is the one reader.
        sizes = []
        for _, k in rows:
            if k >= len(sizes):
                sizes += [0] * (k + 1 - len(sizes))
            sizes[k] += 1
        u["ls"] = [m for m in sizes if m]
        # The unit's words in their groups of related words, in reading order
        # (build_topics.py `grouped`): [name, section, [lemma index…]]. Every
        # word list in the app draws from this, so the four seasons are one
        # group wherever they are listed (the owner, 2026-09-30).
        groups = {}
        for l, grp, gkind, gord in db.execute(
                "select lemma_id, grp, gkind, gord from t.unit_words where topic_id=? and grp is not null "
                "order by ord", (tid,)):
            if l in pos_of:
                groups.setdefault((gord, grp, gkind), []).append(pos_of[l])
        if groups:
            u["gr"] = [[grp, gkind, ws] for (gord, grp, gkind), ws in sorted(groups.items())]
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
            # The chapter's grammar episode, where the library has one
            # (build_skeleton.py): played from the grammar card, not a goal.
            if v.get("lesson"):
                u["v"]["lesson"] = v["lesson"]
            spoken = heard.get(v["id"], {})
            if spoken:
                # Only this unit's own words, and at most a handful of moments each —
                # the learner replays one occurrence, not every one. A unit word
                # the video never says is not listed: what is under a video must
                # be in the video (the owner's rule, 2026-09-07).
                heard_here = {}
                for i in words:
                    m = said_as(i, spoken.get(lemmas[i]["b"]))
                    if m:
                        heard_here[lemmas[i]["b"]] = m[:4]
                u["v"]["heard"] = heard_here
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

    def rows_in(spoken):
        """{row: its moments} for every studied row a video says (row_said)."""
        out = {}
        for b, occ in spoken.items():
            hit = row_said(b, occ)
            if hit:
                out[hit[0]] = hit[1]
        return out

    # --- before the video (2026-09-29) --------------------------------------
    # Each unit works towards its video (build_videos.py, the skeleton), and
    # the words to review before watching are chosen off the video itself:
    # the unit's own words it says, most-said first; then the content words
    # it leans on that the path has not taught yet — the video shaping what
    # the lesson brings in; then earlier words it says often. PREP_WORDS in
    # all. The same list is what the library shows under the video, so the
    # lesson and Immerse cannot disagree about what to listen for.
    route = []
    for (tid,) in db.execute("select topic_id from t.path order by row, col"):
        if tid in uidx and uidx[tid] not in route:
            route.append(uidx[tid])
    taught_before = set()
    prep_of_video = {}
    for ui in route:
        u = units[ui]
        v = u.get("v")
        spoken = heard.get(v["id"], {}) if v else {}
        if spoken:
            said = rows_in(spoken)
            for i in u["w"]:          # the unit's own row, where it shares a headword
                m = said_as(i, spoken.get(lemmas[i]["b"]))
                if m:
                    said[i] = m
            # Content words before function words, then most-said: «хотеть»
            # is something to listen for, «и» is not, though both are taught.
            own = sorted((i for i in u["w"] if i in said),
                         key=lambda i: (lemmas[i]["p"] not in PREP_POS, -len(said[i])))
            own_all = set(own)       # the unit's own words beyond the first few are not "new"
            own = own[:PREP_OWN]
            new, review = [], []
            for i in sorted(said, key=lambda i: (-len(said[i]), lemmas[i]["b"])):
                if i < VIDEO_SKIP_TOP or i in own_all:
                    continue
                if lemmas[i]["p"] not in PREP_POS:
                    continue
                (review if i in taught_before else new).append(i)
            prep = (own + new[:PREP_NEW] + review)[:PREP_WORDS]
            # `heard` is the list, in order: the words and where each is said.
            v["heard"] = {lemmas[i]["b"]: said[i][:4] for i in prep}
            prep_of_video[v["id"]] = (prep, said)
        taught_before |= set(u["w"])
    stats["prep_words"] = [len((units[ui].get("v") or {}).get("heard") or {}) for ui in route]
    # A fingerprint of which words each unit teaches, in order. Lesson progress
    # is stored by lesson index, so when this changes the app re-derives it
    # from what the learner has studied (native data.js reconcileCurriculum).
    stats["curriculum"] = hashlib.sha1(json.dumps(
        [[u["id"], [lemmas[i]["b"] for i in u["w"]]] for u in units],
        ensure_ascii=False).encode("utf-8")).hexdigest()[:12]
    for v in library:
        spoken = heard.get(v["id"])
        if not spoken:
            continue
        tid = unit_of_video.get(v["id"])
        prepped = tid and prep_of_video.get(v["id"], ([], {}))[0]
        if prepped:
            # A unit's goal video lists exactly its prep list, as the lesson does.
            chosen, said = prep_of_video[v["id"]]
        else:
            said = rows_in(spoken)
            chosen = []
            if tid:
                for i in unit_words_of.get(tid, []):
                    m = said_as(i, spoken.get(lemmas[i]["b"]))
                    if m:
                        said[i] = m
                chosen = [i for i in unit_words_of.get(tid, []) if i in said]
        moments = {lemmas[i]["b"]: said[i] for i in chosen}
        pool = []
        for i, occ in said.items():
            if i < VIDEO_SKIP_TOP or lemmas[i]["b"] in moments:
                continue
            if lemmas[i]["p"] not in ("noun", "verb", "adjective"):
                continue
            pool.append((-len(occ), i))
        pool.sort()
        if not prepped:
            for _, i in pool[:max(0, VIDEO_WORDS - len(moments))]:
                moments[lemmas[i]["b"]] = said[i]
        entry = {"id": v["id"], "title": v["title"], "ch": v.get("ch"), "dur": v.get("dur"),
                 "kw": v.get("kw", ""), "topics": v.get("topics", []),
                 "words": {b: occ[:VIDEO_MOMENTS] for b, occ in moments.items()}}
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
    # Read back: every moment listed under a word is a form of the row the app
    # opens for that word (the first studied row of the spelling).
    bad_moments = 0
    for words in [e["words"] for e in video_list] + [(u.get("v") or {}).get("heard") or {} for u in units]:
        for b, occ in words.items():
            mine = keys_of.get(lid_at[rows_of_bare[b][0]], set()) if b in rows_of_bare else set()
            bad_moments += sum(1 for o in occ if fold(o.get("w") or "") not in mine)
    stats["video_moments_off"] = bad_moments

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
    unit_info = unit_info_of(units, path)
    stats["card_words_untaught"] = check_grammar_cards(units, path, lemmas, index, unit_info)
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
    # How common each sentence token is: the corpus rank of the lemma that owns
    # it, so an example can prefer words a learner will meet again (rank_examples).
    lemma_rank = {lid: r for r, (lid, _) in enumerate(
        sorted(corpus_n.items(), key=lambda x: (-x[1], x[0])), 1)}
    # Every form of every ranked lemma; a spelling two lemmas share takes the
    # commoner one's rank, since what is asked is how often the string is met.
    key_rank = {}
    for lid, r in lemma_rank.items():
        for k in keys_of.get(lid, ()):
            if r < key_rank.get(k, 10 ** 9):
                key_rank[k] = r

    # Adjective → noun pairs the corpus actually says (an adjective token
    # immediately before a noun token, each resolved to a studied lemma), for
    # the agreement drill: it paired any adjective with any noun and asked for
    # «половая ягода» — "sexual berry" (the owner, 2026-09-24). Keyed by the
    # adjective's index; a noun listed once per adjective.
    pairs = {}
    for iid, toks in sent_tokens.items():
        for a, b in zip(toks, toks[1:]):
            ia = (index.get(a) or [None])[0]
            ib = (index.get(b) or [None])[0]
            if ia is None or ib is None or ia == ib:
                continue
            if lemmas[ia].get("p") == "adjective" and lemmas[ib].get("p") == "noun":
                lst = pairs.setdefault(ia, [])
                if ib not in lst:
                    lst.append(ib)
    stats["adjective_noun_pairs"] = sum(len(v) for v in pairs.values())
    stats["adjectives_with_pairs"] = len(pairs)

    deep, shapes, slot_names, sent_pool, tsample, rec_of = build_dictionary(
        db, sentences, items_of_key, keys_of, stats, ext_sentences, ext_items_of_key,
        resolver=resolver, sent_tokens=sent_tokens, studied_keys=studied_keys,
        key_rank=key_rank)

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
        for new, old in retexted.items():
            if old in audio:
                audio.setdefault(new, audio[old])
        stats["audio_files"] = len(set(audio.values()))
        stats["audio_utterances"] = len(audio)

    # Where each shipped recording came from, per file, from the same manifest.
    src_of = {}
    if apath.exists():
        src_of = json.loads(apath.read_text(encoding="utf-8")).get("src", {})
    measured = measure_sentences(sentences, sent_tokens, index, key_units, lemmas,
                                 unit_pos, audio, src_of, stats, unit_info)
    speech = build_pools(measured, units, stats)
    add_video_lines(speech, units, lambda s, t: measure_sentences(
        s, t, index, key_units, lemmas, unit_pos, {}, {}, {}, unit_info), stats)
    merge_near_duplicates(speech, units, stats)
    stats["pool_unguaranteed"] = check_pools_guaranteed(speech, units, key_units, unit_info, unit_pos)

    # The written conversations (data/curated/scripts/, §30l), keyed by lesson.
    scripts = load_scripts(stats)

    senses = load_senses(lemmas, stats, key_rank)
    distinct_examples(lemmas, senses, sent_pool, stats)

    deep_forms = build_deep_forms(resolver, index, speech, sent_pool, senses, scripts, units,
                                  [v["id"] for v in video_list], stats,
                                  frozenset(fold(l.get("b") or "") for l in lemmas))

    return {"stats": stats, "lemmas": lemmas, "index": index, "deepforms": deep_forms,
            "units": units, "path": path, "audio": {"files": audio},
            "deep": deep, "shapes": shapes, "slots": slot_names,
            "sent": sent_pool, "tsample": tsample, "speech": speech,
            "videos": video_list, "channels": creators,
            "scripts": scripts, "senses": senses,
            "pairs": {str(k): v for k, v in pairs.items()}}


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


# A sense that is only a label («[with prepositional]») or only an editor's
# note in brackets («(With prepositions and pronouns не actually is a prefix…)»).
LABEL_ONLY = re.compile(r"^\s*(\[[^\]]*\]|\([^)]*\))\s*\.?\s*$")


def tidy_senses(senses):
    """Wiktionary's senses as a reader should see them: a line that is only a
    grammatical label or an editor's bracketed note is not a meaning — «в»
    listed "[with prepositional]" and "[with nominative]" as senses 2 and 8,
    «не» a sentence about spelling as sense 5 — and a meaning listed twice
    («где» "where", sense 1 and 3, one per construction) is one sense with
    both sets of examples (the data review, 2026-10-01)."""
    out, at = [], {}
    for s in senses:
        g = (s.get("g") or "").strip()
        if not g or LABEL_ONLY.match(g):
            continue
        k = re.sub(r"\W+", " ", g.lower()).strip()
        if k in at:
            first = out[at[k]]
            extra = [x for x in s.get("x") or () if x not in (first.get("x") or [])]
            if extra:
                first = out[at[k]] = dict(first, x=(first.get("x") or []) + extra)
            continue
        at[k] = len(out)
        out.append(s)
    return out


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

    chosen = tidy_senses(chosen)
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


PRE_REFORM = re.compile(r"[ѣіѳѵ]|ъ(?![а-яё])", re.I)


def not_a_translation(x):
    """A Wiktionary example the reader cannot use (the definitions read,
    2026-10-01). For a literary quotation the extract often keeps the
    attribution where the translation belongs — «…» = "Boris Akunin",
    "Zemfira", "Bi-2" — so an English side with no lower-case word in it is a
    name, not a sentence. Pre-1918 spelling (ѣ, і, a final ъ) and wiki-link
    debris go too."""
    en = (x.get("en") or "").strip()
    if not en or "Wikipedia" in en or PRE_REFORM.search(x.get("ru") or ""):
        return True
    words = re.findall(r"[A-Za-z][A-Za-z'’-]*", en)
    return not any(w[0].islower() for w in words)


def sense_examples(examples, own, key_rank):
    """A sense's examples, useful first (the owner, 2026-09-28).

    Wiktionary's examples are whatever an editor quoted, and for «говорить»
    sense 1 opened on a 22-word verse from the Gospels. Same measure as the
    dictionary's (rank_examples): a sentence over LONG_WORDS is dropped — the
    sense keeps its gloss, and a quotation nobody can read teaches nothing —
    and the rest go easiest first, by tier, uncommon words, then length."""
    out = []
    for x in examples or ():
        toks = [fold(t) for t in re.findall(r"[а-яёА-ЯЁ́̀]+(?:-[а-яёА-ЯЁ́̀]+)*", x.get("ru") or "")]
        if not toks or len(toks) > LONG_WORDS:
            continue
        if not_a_translation(x) or fold(x.get("ru") or "") in REJECTED:
            continue
        rare = sum(1 for k in toks if not k.startswith(own)
                   and key_rank.get(k, COMMON_RANK + 1) > COMMON_RANK)
        out.append(((example_tier(len(toks), rare), rare, len(toks)), x))
    out.sort(key=lambda p: p[0])
    return [x for _, x in out]


SENSE_OVERRIDES_PATH = ROOT / "data" / "curated" / "sense_overrides.json"


def apply_sense_override(senses, rule, key):
    """A reader's correction to one word's Wiktionary senses (the definitions
    read, 2026-10-01): `drop` removes a sense whose gloss contains any of the
    given strings (a sense from another word — «небо»'s "palate" is «нёбо» —
    slang no beginner's card should carry, a proper name); `rename` rewrites
    a sense's gloss; `examples` removes an example whose Russian or English
    contains one; `first` moves the sense containing that string to the top;
    `lead` puts a sense of the given text above everything. Every string must match something,
    or the build stops: a correction that no longer applies is a correction
    nobody can see has gone stale."""
    low = lambda s: (s or "").lower()
    # "=front" matches a sense that is exactly "front", where "front" alone
    # would also take "in front of".
    has = lambda d, g: low(d[1:]) == low(g).strip() if d.startswith("=") else low(d) in low(g)
    for d in rule.get("drop", ()):
        hit = [s for s in senses if has(d, s.get("g"))]
        if not hit:
            raise SystemExit(f"sense_overrides.json {key}: no sense contains {d!r}")
        senses = [s for s in senses if s not in hit]
    for old, new in (rule.get("rename") or {}).items():
        hit = [s for s in senses if has(old, s.get("g"))]
        if not hit:
            raise SystemExit(f"sense_overrides.json {key}: no sense contains {old!r}")
        for s in hit:
            s["g"] = new
    for d in rule.get("examples", ()):
        found = False
        for s in senses:
            keep = [x for x in s.get("x") or () if low(d) not in low(x.get("ru")) + "\n" + low(x.get("en"))]
            if len(keep) != len(s.get("x") or ()):
                found = True
                s["x"] = keep
                if not keep:
                    s.pop("x", None)
        if not found:
            raise SystemExit(f"sense_overrides.json {key}: no example contains {d!r}")
    f = rule.get("first")
    if f:
        hit = [s for s in senses if low(f) in low(s.get("g"))]
        if not hit:
            raise SystemExit(f"sense_overrides.json {key}: no sense contains {f!r}")
        senses = [hit[0]] + [s for s in senses if s is not hit[0]]
    # `lead` puts the meaning the lesson teaches on top where Wiktionary has
    # no sense that says it («больше» "more", «пасха» "Easter").
    if rule.get("lead"):
        senses = [{"g": rule["lead"]}] + senses
    return senses


def _example_words(ru):
    return frozenset(fold(t) for t in re.findall(r"[а-яёА-ЯЁ́̀]+(?:-[а-яёА-ЯЁ́̀]+)*", ru or ""))


def same_use(a, b):
    """Two example sentences that show the word the same way: the same sentence,
    or one that is nearly all the other («Я говорю по-русски» beside «Я не
    говорю по-русски», «Я горжусь тобой» beside «Я тобой горжусь»)."""
    if not a or not b:
        return False
    if a == b:
        return True
    small = min(len(a), len(b))
    if small >= 2 and len(a & b) / small >= 0.75:
        return True
    # Two short sentences a word apart are one use: «Мы — люди» beside «Они —
    # люди» showed the same form twice on «человек»'s card (the owner,
    # 2026-10-13: "ensure all words have a variety of example sentences").
    # At four words or fewer, all but one shared is the same sentence with a
    # pronoun swapped.
    return small <= 4 and len(a & b) >= small - 1


def distinct_examples(lemmas, senses, sent_pool, stats):
    """One use, one sentence, across everything a card and an entry show.

    The card's back lists a sentence under each meaning (Wiktionary's) and then
    the dictionary's examples, and each list was de-duplicated only against
    itself: «Которы́й час?» stood under two senses, and a dictionary example
    could repeat a sense's word for word (the owner, 2026-10-07: "the same
    sentence used twice… we're supposed to have distinct uses when possible").
    So, per word: the dictionary's examples are kept first — they are the
    recorded sentences, and a word must keep at least one — less any that
    repeat one already kept; then a sense's example goes when it repeats or
    nearly copies anything kept so far. A sense left with no example keeps
    its gloss."""
    dropped_sense = dropped_refs = 0
    for k, ss in senses.items():
        shown = []
        lemma = lemmas[int(k)]
        if lemma.get("refs"):
            kept = []
            for r in lemma["refs"].split(","):
                row = sent_pool[int(r)] if r.isdigit() and int(r) < len(sent_pool) else None
                w = _example_words(row[0]) if row else None
                if w is not None and kept and any(same_use(w, o) for o in shown):
                    dropped_refs += 1
                    continue
                kept.append(r)
                if w is not None:
                    shown.append(w)
            lemma["refs"] = ",".join(kept)
        for s in ss:
            keep = []
            for x in s.get("x") or ():
                w = _example_words(x.get("ru"))
                if any(same_use(w, o) for o in shown):
                    dropped_sense += 1
                    continue
                keep.append(x)
                shown.append(w)
            if keep:
                s["x"] = keep
            else:
                s.pop("x", None)
    stats["examples_same_use_dropped"] = dropped_sense + dropped_refs
    print(f"  same use     : {dropped_sense} sense examples and {dropped_refs} dictionary examples "
          f"dropped, each repeating or nearly copying one shown above it")


def load_senses(lemmas, stats, key_rank=None):
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

    overrides = {k: v for k, v in json.loads(SENSE_OVERRIDES_PATH.read_text(encoding="utf-8")).items()
                 if not k.startswith("_")} if SENSE_OVERRIDES_PATH.exists() else {}
    used = set()
    out, found, multi, fronted, dropped = {}, 0, 0, [], 0
    for i, l in enumerate(lemmas):
        by_pos = rows.get(fold(l.get("b") or ""))
        if not by_pos:
            continue
        senses, front = pick_senses(l.get("e") or "", l.get("p"), by_pos)
        key = f"{l.get('b')}|{l.get('p')}"
        if key in overrides and senses:
            used.add(key)
            senses = apply_sense_override([dict(s) for s in senses], overrides[key], key)
        if not senses:
            continue
        # The word's own forms never count against a sentence: a stem match is
        # enough here, since all it decides is which example reads easiest.
        head = fold(l.get("b") or "")
        own = head[:max(2, len(head) - 3)]
        for s in senses:
            if s.get("x"):
                before = len(s["x"])
                s["x"] = sense_examples(s["x"], own, key_rank or {})
                dropped += before - len(s["x"])
                if not s["x"]:
                    del s["x"]
        out[str(i)] = senses
        found += 1
        if len(senses) > 1:
            multi += 1
        if front:
            fronted.append(l.get("b"))
    stale = sorted(set(overrides) - used)
    if stale:
        raise SystemExit(f"sense_overrides.json names words with no senses shipped: {', '.join(stale)}")
    stats["senses"] = found
    stats["senses_multi"] = multi
    stats["senses_fronted"] = len(fronted)
    stats["sense_examples_dropped"] = dropped
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


# American English in everything the app shows (the owner, 2026-10-05: "Try
# and avoid British English… I see mum used from time to time"). The English
# comes from OpenRussian, Wiktionary, Tatoeba and the decks, much of it
# British; it is converted on the way out rather than in the sources, so a
# re-ingest cannot bring it back. Only spellings and words with one American
# reading are here: "flat", "holiday", "lift", "queue" and "rubbish" each have
# a second sense that a swap would get wrong, and "mummy" is also «мумия».
AMERICAN = {
    "mum": "mom", "mums": "moms",
    "colour": "color", "colours": "colors", "coloured": "colored", "colourful": "colorful",
    "colouring": "coloring", "favourite": "favorite", "favourites": "favorites",
    "neighbour": "neighbor", "neighbours": "neighbors", "neighbourhood": "neighborhood",
    "neighbourhoods": "neighborhoods", "behaviour": "behavior", "behaviours": "behaviors",
    "honour": "honor", "honours": "honors", "honoured": "honored", "humour": "humor",
    "labour": "labor", "flavour": "flavor", "flavours": "flavors", "harbour": "harbor",
    "harbours": "harbors", "rumour": "rumor", "rumours": "rumors", "odour": "odor",
    "vapour": "vapor", "armour": "armor", "savour": "savor", "endeavour": "endeavor",
    "centre": "center", "centres": "centers", "theatre": "theater", "theatres": "theaters",
    "metre": "meter", "metres": "meters", "kilometre": "kilometer", "kilometres": "kilometers",
    "centimetre": "centimeter", "centimetres": "centimeters", "millimetre": "millimeter",
    "litre": "liter", "litres": "liters", "fibre": "fiber", "calibre": "caliber", "sabre": "saber",
    "organise": "organize", "organised": "organized", "organising": "organizing",
    "organisation": "organization", "organisations": "organizations",
    "realise": "realize", "realised": "realized", "realising": "realizing",
    "recognise": "recognize", "recognised": "recognized", "apologise": "apologize",
    "apologised": "apologized", "criticise": "criticize", "emphasise": "emphasize",
    "memorise": "memorize", "summarise": "summarize", "specialise": "specialize",
    "civilisation": "civilization", "analyse": "analyze", "analysed": "analyzed",
    "travelled": "traveled", "travelling": "traveling", "traveller": "traveler",
    "travellers": "travelers", "cancelled": "canceled", "cancelling": "canceling",
    "programme": "program", "programmes": "programs", "cheque": "check", "grey": "gray",
    "jewellery": "jewelry", "pyjamas": "pajamas", "tyre": "tire", "tyres": "tires",
    "aeroplane": "airplane", "aeroplanes": "airplanes", "maths": "math", "learnt": "learned",
    "whilst": "while", "defence": "defense", "offence": "offense", "licence": "license",
    "practise": "practice", "practised": "practiced", "catalogue": "catalog",
    "mould": "mold", "plough": "plow", "cosy": "cozy", "moustache": "mustache",
    "sceptical": "skeptical", "enrol": "enroll", "fulfil": "fulfill", "storey": "story",
    "draught": "draft", "kerb": "curb", "lorry": "truck", "lorries": "trucks",
    "petrol": "gas", "motorway": "highway", "motorways": "highways", "pavement": "sidewalk",
    "biscuit": "cookie", "biscuits": "cookies", "trousers": "pants",
    "mobile phone": "cell phone", "mobile phones": "cell phones",
}
# Football is soccer, except where it is already the American game.
AMERICAN_RE = re.compile(
    r"\b(" + "|".join(sorted(map(re.escape, AMERICAN), key=len, reverse=True)) + r")\b"
    r"|(?<!American )\b(football|footballer|footballers)\b", re.IGNORECASE)
SOCCER = {"football": "soccer", "footballer": "soccer player", "footballers": "soccer players"}


def americanize_text(s):
    if not s or "://" in s or not re.search(r"[A-Za-z]", s):
        return s

    def swap(m):
        word = m.group(0)
        out = AMERICAN.get(word.lower()) or SOCCER[word.lower()]
        if word.isupper() and len(word) > 1:
            return out.upper()
        return out[0].upper() + out[1:] if word[0].isupper() else out
    return AMERICAN_RE.sub(swap, s)


def americanize(node, counts):
    """Every English string in the payload, walked in place. Keys are left
    alone; a URL is never touched."""
    if isinstance(node, dict):
        for k, v in node.items():
            node[k] = americanize(v, counts)
        return node
    if isinstance(node, list):
        for k, v in enumerate(node):
            node[k] = americanize(v, counts)
        return node
    if isinstance(node, str):
        out = americanize_text(node)
        if out != node:
            counts[0] += 1
        return out
    return node


VIDEO_QUIZ_LINES = 600   # tools/build_video_quiz.mjs MAX_LINES: what the questions were written from


def attach_video_quiz(videos, transcripts, units=()):
    """Five questions about a video (data/video_quiz.json, from
    tools/build_video_quiz.mjs) ride on its library entry as `quiz` —
    [question, [right, wrong, wrong, wrong], ms] — only while the transcript
    still hashes as it did when they were written: questions about lines a
    re-harvest has changed would ask about something the video may not say."""
    store = ROOT / "data" / "video_quiz.json"
    held = json.loads(store.read_text(encoding="utf-8"))["videos"] if store.exists() else {}
    shipped = stale = 0
    for v in videos:
        q = held.get(v["id"])
        lines = transcripts.get(v["id"])
        if not q or not lines:
            continue
        h = hashlib.sha1("\n".join(f"{l[0]}|{l[1]}" for l in lines[:VIDEO_QUIZ_LINES])
                         .encode("utf-8")).hexdigest()[:16]
        if h != q["hash"]:
            stale += 1
            continue
        v["quiz"] = [[americanize_text(x["q"]), [americanize_text(o) for o in x["options"]], x["at"]]
                     for x in q["questions"]]
        shipped += 1
    # A unit whose video has questions says so on its own row (`v.quiz`), so
    # the lesson can list the step without opening the video library.
    asked = {v["id"] for v in videos if v.get("quiz")}
    for u in units:
        if u.get("v") and u["v"].get("id") in asked:
            u["v"]["quiz"] = True
    print(f"  video quiz   : {shipped} of {len(videos)} videos carry five questions"
          + (f"; {stale} stale (transcript changed), rerun build_video_quiz" if stale else ""))


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
    changed = [0]
    americanize(payload, changed)
    print(f"  American     : {changed[0]:,} strings respelled (AMERICAN)")
    if args.public:
        stripped = strip_captions(payload)
        print(f"  public build : {stripped:,} caption snippets stripped from the video moments")
    # The deep forms are the native app's (the web app is on hold) and would
    # only weigh down the page.
    blob = json.dumps({k: v for k, v in payload.items() if k != "deepforms"},
                      ensure_ascii=False, separators=(",", ":"))

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
    tr = video_transcripts([v["id"] for v in payload["videos"]]) if native_assets.exists() else {}
    if native_assets.exists():
        attach_video_quiz(payload["videos"], tr, payload["units"])
        parts = {k: payload[k] for k in NATIVE_PARTS}
        parts["data"] = {k: v for k, v in payload.items() if k not in NATIVE_PARTS}
        sizes = []
        for name in ["data"] + NATIVE_PARTS:
            text = json.dumps(parts[name], ensure_ascii=False, separators=(",", ":"))
            (native_assets / f"{name}.json").write_text(text, encoding="utf-8")
            sizes.append(f"{name}.json {len(text.encode('utf-8'))/1_048_576:.2f} MB")
        print(f"  native data  : {', '.join(sizes)}")
        # The videos' transcripts, for the player's transcript panel — native
        # only (the web app is on hold) and never in a public build, which ships
        # no caption text (P8.8). Loaded when a transcript is first opened.
        tpath = native_assets / "transcripts.json"
        epath = native_assets / "transcripts_en.json"
        if args.public:
            # Empty rather than absent: the app requires the file, and Metro
            # resolves a require at bundle time, not at run time.
            tpath.write_text("{}", encoding="utf-8")
            epath.write_text("{}", encoding="utf-8")
        else:
            text = json.dumps(tr, ensure_ascii=False, separators=(",", ":"))
            tpath.write_text(text, encoding="utf-8")
            print(f"  transcripts  : {len(tr)} videos, {sum(len(v) for v in tr.values()):,} lines, "
                  f"{len(text.encode('utf-8'))/1_048_576:.2f} MB")
            # Their English, line for line (tools/build_transcript_en.py),
            # "" where a line has none — a line re-cut since the translation
            # was bought keeps its Russian and simply shows no English.
            store = ROOT / "data" / "transcript_en.json"
            held = json.loads(store.read_text(encoding="utf-8"))["lines"] if store.exists() else {}
            en, have, total = {}, 0, 0
            for vid, lines in tr.items():
                row = [americanize_text(held.get(hashlib.sha1(f"{vid}|{ln[0]}|{ln[1]}".encode("utf-8")).hexdigest()[:16], ""))
                       for ln in lines]
                have += sum(1 for x in row if x)
                total += len(row)
                if any(row):
                    en[vid] = row
            etext = json.dumps(en, ensure_ascii=False, separators=(",", ":"))
            epath.write_text(etext, encoding="utf-8")
            print(f"  transcript EN: {have:,} of {total:,} lines ({100 * have / max(1, total):.1f}%), "
                  f"{len(etext.encode('utf-8'))/1_048_576:.2f} MB")
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
    sf = st.get("stress_fixed") or {}
    print(f"  stress marks : {sf.get('sentences', 0):,} shown sentences corrected — "
          f"{sf.get('consonant', 0):,} marks on a consonant removed, {sf.get('doubled', 0):,} doubled, "
          f"{sf.get('contradicted', 0):,} words "
          "whose mark the lexicon never gives that spelling left unmarked; "
          f"{sf.get('stress_moved', 0):,} two-way marks moved to the reviewed stress, "
          f"{sf.get('stress_dropped', 0):,} dropped where the readings disagreed (stress_review.json)")
    v = st.get("examples_variety") or {}
    if v.get("plain_words"):
        n = v["plain_words"]
        print(f"  examples     : {n:,} words with 2+ sentences; shown in one form only "
              f"{v['plain_one_form']:,} → {v['varied_one_form']:,}, "
              f"near-duplicate pairs {v['plain_near']:,} → {v['varied_near']:,}")
        print(f"  examples     : a sentence over {LONG_WORDS} words shown for "
              f"{v['plain_long']:,} → {v['varied_long']:,}; uncommon words shown "
              f"{v['plain_rare']:,} → {v['varied_rare']:,}; two tiers or more "
              f"{v['plain_spread']:,} → {v['varied_spread']:,}")
    # The pools are cut by curriculum coverage (measure_sentences); the difficulty
    # histogram is the wider picture of how much of the corpus resolves at all.
    if st.get("sentences_measured"):
        print(f"  sentences    : {st['sentences_measured']:,} measured, "
              f"{st['sentences_with_unit']:,} placed in a unit, "
              f"{st['sentences_with_audio']:,} with a recording")
        print("  difficulty   : " + "  ".join(f"{lab} {n:,}" for lab, n in st["difficulty_hist"]))
    if st.get("deep_forms") is not None:
        print(f"  deep forms   : {st['deep_forms']:,} forms in the app's text linked to a dictionary "
              f"headword; {st['deep_forms_unsettled']:,} not (no glossed owner, or shared and unsettled)")
    if REJECTED:
        print(f"  reviewed     : {len(REJECTED):,} sentences judged not worth learning from, "
              f"{st.get('rejected', 0):,} of them left out here (data/curated/sentence_review.json)")
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
    print(f"  video words  : {st.get('video_moments_off', 0)} moment(s) listed under a word whose "
          "forms do not include what was said (must be 0)")
    print(f"  pool words   : {st.get('pool_unguaranteed', 0)} pool sentence(s) using a word "
          "the learner at that unit may not have been taught (optional or sibling quest; must be 0)")
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
        print(f"  senses       : {st.get('sense_examples_dropped', 0):,} examples over "
              f"{LONG_WORDS} words dropped, the rest easiest first")
    print(f"  scripts      : {', '.join(js_files)}")
    print(f"  page         : {(args.outdir / 'index.html').stat().st_size/1_048_576:.2f} MB")

    # Reported after the summary so the rest of the numbers are still readable,
    # but the exit code is non-zero: a curriculum that teaches a preposition as a
    # noun must not reach a build anyone deploys.
    for line in st.get("closed_class_taught") or ():
        print(f"  !! {line}")
    # …and so must a pool that asks a learner for a word they were never
    # guaranteed, or a video list that opens a different word from the one said.
    if st.get("pool_unguaranteed") or st.get("video_moments_off"):
        print("  !! pool sentences or video moments break their rule (above)")
    return 1 if (st.get("closed_class_taught") or st.get("pool_unguaranteed")
                 or st.get("video_moments_off")) else 0


if __name__ == "__main__":
    raise SystemExit(main())

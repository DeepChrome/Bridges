"""Word-panel resolution: form -> lemma candidates, paradigm tables, your own examples.

Shared by the CLI (tools/lookup.py) and the site generator (tools/build_site.py), so
the terminal and the app can never disagree about what a word means.

Output is plain JSON-able dicts:

    {
      "query": "себе", "key": "себе",
      "candidates": [ {lemma, accented, pos, en, matched: [...], tables: [...]} ],
      "examples":   [ {ru, en, deck, audio, key} ]
    }
"""

import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ACUTE = "́"
ROOT = Path(__file__).resolve().parent.parent

CASES = [("nom", "Nominative"), ("gen", "Genitive"), ("dat", "Dative"),
         ("acc", "Accusative"), ("inst", "Instrumental"), ("prep", "Prepositional")]

PERSONS = [("sg1", "я"), ("sg2", "ты"), ("sg3", "он / она"),
           ("pl1", "мы"), ("pl2", "вы"), ("pl3", "они")]

# Slot -> human label, for the flat tables (verbs, short forms).
PAST = [("past_m", "он"), ("past_f", "она"), ("past_n", "оно"), ("past_pl", "они")]
SHORT = [("short_m", "m"), ("short_f", "f"), ("short_n", "n"), ("short_pl", "pl")]


def fold(s: str) -> str:
    d = unicodedata.normalize("NFD", s).replace(ACUTE, "").replace("̀", "")
    return unicodedata.normalize("NFC", d).lower().replace("ё", "е").strip()


# --- which lemma a form belongs to -------------------------------------------
#
# 8,404 of the lexicon's form keys belong to more than one lemma, and they carry
# 18 % of the corpus: «нет» is a form of «житься», «лет» of «лёт», «уже» of
# «узкий», «тут» of the mulberry. Every join through `forms.key` — the pool
# count that cuts the spine, the order of the app's lookup index, which
# sentences illustrate a word, which lemma a video credits — has to settle the
# same question the same way, so the rule lives here (it grew up in
# build_transcripts.py, CLAUDE.md §23) and everything imports it.

# A lemma whose gloss only names it as a form of another word ("dative of I") is a
# stub row, not a word: it must not win a form from the word it is a form of.
STUB_GLOSS = re.compile(r"^\s*(\w+\s+)?(form|case|plural|singular|dative|accusative|genitive|"
                        r"genetive|instrumental|prepositional|nominative|short form|comparative)\b.*\bof\b", re.I)
# How clearly a lemma must own a form to be credited with it: the best candidate's
# independent frequency against the runner-up's.
MARGIN = 3.0
# A form that is also a lemma's own dictionary form («том», «дома») weighs more
# than the same form as somebody else's inflection.
HEADWORD_BONUS = 3.0
# The closed class: particles, adverbs, conjunctions, numerals, pronouns. A form
# that is the headword of one of these («просто», «конечно», «уже», «нет») is that
# word when spoken, not the adjective or noun it could also inflect — the adverb in
# -о is the classic case, and the corpus cannot settle it because the tokens are
# counted under both.
CLOSED = {"other", "pronoun", "possessive", "numeral"}
# …except against a personal pronoun: «его» is "his" or "him", «их» "their" or
# "them", and neither reading owns the form. Those are dropped.
PERSONAL = {"я", "ты", "он", "она", "оно", "мы", "вы", "они", "себя"}
POSSESSIVE = {"его", "её", "их"}
# What the rule cannot settle, a person did: form key -> "bare" or "bare|pos".
OVERRIDES_PATH = ROOT / "data" / "curated" / "lemma_overrides.json"


def load_owners(db):
    """form key -> its candidate lemmas, each {lid, bare, pos, glossed, stub,
    head, n}, from a lexicon connection with the corpus attached as `c`.

    `n` is the lemma's *independent* frequency: corpus tokens of forms that
    belong to it alone. Counting shared forms under every owner is what made
    «лёт» look twice as common as «год» — every «лет» was credited to both."""
    key_owners = defaultdict(set)
    for key, lid in db.execute("select key, lemma_id from forms"):
        key_owners[key].add(lid)
    indep = Counter()
    for key, n in db.execute("select key, count(*) from c.item_tokens group by key"):
        ids = key_owners.get(key)
        if ids and len(ids) == 1:
            indep[next(iter(ids))] += n
    lemma = {}
    for lid, bare, pos, en in db.execute("select id, bare, pos, en from lemmas"):
        lemma[lid] = {"lid": lid, "bare": bare, "pos": pos or "other",
                      "glossed": bool(en and en.strip()),
                      "stub": bool(en and STUB_GLOSS.match(en)), "n": indep.get(lid, 0)}
    cands = {}
    for key, ids in key_owners.items():
        rows = []
        for lid in ids:
            c = dict(lemma[lid])
            c["head"] = fold(c["bare"]) == key
            rows.append(c)
        rows.sort(key=lambda c: (-c["n"], c["lid"]))
        cands[key] = rows
    return cands, indep


def load_overrides(path=OVERRIDES_PATH):
    if not path.exists():
        return {}
    return {k: v for k, v in json.loads(path.read_text(encoding="utf-8")).items()
            if not k.startswith("_")}


def _matches(c, spec):
    bare, _, pos = spec.partition("|")
    return c["bare"] == bare and (not pos or c["pos"] == pos)


def resolve(cands, override=None):
    """-> (candidate or None, ambiguous?) for a form's candidate lemmas.

    A candidate is the dict load_owners builds; callers read ["bare"] or
    ["lid"]. `override` is the curated "bare" or "bare|pos" for this key."""
    if not cands:
        return None, False
    if override:
        hit = next((c for c in cands if _matches(c, override)), None)
        if hit:
            return hit, True
    if len(cands) == 1:
        return cands[0], False
    live = [c for c in cands if not c["stub"]] or cands
    glossed = [c for c in live if c["glossed"]]
    live = glossed or live
    # OpenRussian lists «весь», «мой», «свой» twice, as adjective and possessive, and
    # «пора» twice as a noun: one headword is one word, whichever row it came from.
    # The row that owns the most forms of its own stands for it.
    if len({c["bare"] for c in live}) == 1:
        return max(live, key=lambda c: (c["n"], c["pos"] != "other")), True
    closed_head = [c for c in live if c["head"] and c["pos"] in CLOSED]
    if closed_head:
        rivals = [c for c in live if c not in closed_head]
        personal = [c for c in rivals if c["bare"] in PERSONAL]
        if personal:
            # «нас», «тебя», «ему» are listed as headwords of their own; they are
            # forms of the pronoun. «его», «её», «их» are also possessives, and
            # nothing in a transcript says which reading was meant.
            if any(c["bare"] in POSSESSIVE for c in closed_head):
                return None, True
            return max(personal, key=lambda c: c["n"]), True
        return max(closed_head, key=lambda c: (c["n"], "ё" in c["bare"])), True
    weighed = sorted(((c["n"] + 1.0) * (HEADWORD_BONUS if c["head"] else 1.0), c["lid"], c)
                     for c in live)
    weighed.reverse()
    if weighed[0][0] >= MARGIN * weighed[1][0]:
        return weighed[0][2], True
    return None, True


class Resolver:
    """The rule with its data: owner(key) -> (candidate or None, ambiguous)."""

    def __init__(self, db, overrides=None):
        self.cands, self.indep = load_owners(db)
        self.overrides = load_overrides() if overrides is None else overrides
        self._memo = {}

    def candidates(self, key):
        return self.cands.get(key, [])

    def owner(self, key):
        if key not in self._memo:
            self._memo[key] = resolve(self.cands.get(key), self.overrides.get(key))
        return self._memo[key]

    def owner_id(self, key):
        c, _ = self.owner(key)
        return c["lid"] if c else None


def _cells(par, slot):
    """All accepted forms for one paradigm slot, in insertion order."""
    return par.get(slot, [])


def _table(title, columns, rows):
    rows = [r for r in rows if any(c for c in r[1:])]
    return {"title": title, "columns": columns, "rows": rows} if rows else None


def build_tables(pos, par):
    """Turn a lemma's slot->forms mapping into renderable tables."""
    tables = []

    if pos == "noun":
        t = _table("Declension", ["Case", "Singular", "Plural"],
                   [[label, _cells(par, f"sg_{c}"), _cells(par, f"pl_{c}")]
                    for c, label in CASES])
        if t:
            tables.append(t)

    elif pos in ("adjective", "possessive", "numeral"):
        t = _table("Declension",
                   ["Case", "Masculine", "Feminine", "Neuter", "Plural"],
                   [[label] + [_cells(par, f"decl_{g}_{c}") for g in ("m", "f", "n", "pl")]
                    for c, label in CASES])
        if t:
            tables.append(t)
        t = _table("Short form", ["", "Form"],
                   [[label, _cells(par, s)] for s, label in SHORT])
        if t:
            tables.append(t)
        t = _table("Comparison", ["", "Form"],
                   [["Comparative", _cells(par, "comparative")],
                    ["Superlative", _cells(par, "superlative")]])
        if t:
            tables.append(t)

    elif pos == "verb":
        t = _table("Present / Future", ["Person", "Form"],
                   [[label, _cells(par, f"presfut_{p}")] for p, label in PERSONS])
        if t:
            tables.append(t)
        t = _table("Past", ["Subject", "Form"],
                   [[label, _cells(par, s)] for s, label in PAST])
        if t:
            tables.append(t)
        t = _table("Imperative", ["", "Form"],
                   [["ты", _cells(par, "imperative_sg")],
                    ["вы", _cells(par, "imperative_pl")]])
        if t:
            tables.append(t)

    elif pos == "pronoun":
        t = _table("Declension", ["Case", "Form"],
                   [[label, _cells(par, c)] for c, label in CASES])
        if t:
            tables.append(t)

    # Anything the shaped tables did not consume (e.g. preposition variants).
    leftovers = {s: v for s, v in par.items() if s == "variant"}
    if leftovers:
        tables.append({"title": "Variants", "columns": ["", "Form"],
                       "rows": [["before consonant clusters", v]
                                for v in leftovers.values()]})
    return tables


class Panel:
    def __init__(self, lexicon_path, corpus_path):
        self.db = sqlite3.connect(f"file:{lexicon_path}?mode=ro", uri=True)
        self.db.execute("attach database ? as c", (str(corpus_path),))

    def resolve(self, word, example_limit=8):
        key = fold(word)
        out = {"query": word, "key": key, "candidates": [], "examples": []}

        hits = self.db.execute(
            "select lemma_id, group_concat(slot) from forms where key=? group by lemma_id",
            (key,)).fetchall()
        if not hits:
            return out

        # Rank candidates: a lemma whose own headword is the typed form comes first,
        # then by how common the lemma is in the collection.
        lemma_ids = [h[0] for h in hits]
        matched = {lid: slots.split(",") for lid, slots in hits}

        rows = self.db.execute(
            "select id, bare, key, accented, pos, gender, animate, aspect, partner, en, de"
            " from lemmas where id in (%s)" % ",".join("?" * len(lemma_ids)),
            lemma_ids).fetchall()

        for (lid, bare, lkey, accented, pos, gender, animate, aspect,
             partner, en, de) in rows:
            par = {}
            for slot, acc in self.db.execute(
                    "select slot, accented from paradigm where lemma_id=? ", (lid,)):
                par.setdefault(slot, [])
                if acc not in par[slot]:
                    par[slot].append(acc)

            n_forms = sum(len(v) for v in par.values())
            out["candidates"].append({
                "lemma_id": lid, "lemma": bare, "accented": accented or bare,
                "pos": pos, "gender": gender, "animate": animate,
                "aspect": aspect, "partner": partner, "en": en, "de": de,
                "matched": sorted(set(matched[lid])),
                "is_headword": lkey == key,
                "tables": build_tables(pos, par),
                "n_forms": n_forms,
                # others.csv carries bare stubs for inflected forms (себе, него) with no
                # translation and no paradigm. They match first but explain nothing, so
                # they must never outrank the real lemma they belong to.
                "is_stub": pos == "other" and n_forms == 0 and not en,
            })

        out["candidates"].sort(
            key=lambda c: (c["is_stub"], not c["is_headword"], -c["n_forms"]))

        # Lemma-aware examples: every sentence using ANY form of the best candidate.
        best = out["candidates"][0]
        keys = [r[0] for r in self.db.execute(
            "select distinct key from forms where lemma_id=?", (best["lemma_id"],))]
        if keys:
            q = ("select distinct i.ru, i.en, d.name, i.audio, t.key"
                 " from c.item_tokens t join c.items i on i.id=t.item_id"
                 " left join c.decks d on d.id=i.deck_id"
                 " where t.key in (%s) and i.kind='sentence'"
                 " order by length(i.ru) limit ?" % ",".join("?" * len(keys)))
            for ru, en, deck, audio, k in self.db.execute(q, keys + [example_limit]):
                out["examples"].append({
                    "ru": ru, "en": en,
                    "deck": (deck or "?").split("::")[0],
                    "audio": audio, "key": k})

        # Is it a headword in the user's own vocab decks?
        vocab = self.db.execute(
            "select i.ru, i.en, i.freq_rank, i.ipm, d.name from c.items i"
            " left join c.decks d on d.id=i.deck_id"
            " where i.kind='vocab' and i.ru_key=? order by i.freq_rank limit 3",
            (fold(best["lemma"]),)).fetchall()
        out["in_decks"] = [
            {"ru": r, "en": e, "rank": f, "ipm": i, "deck": (n or "?").split("::")[0]}
            for r, e, f, i, n in vocab]
        return out

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

import sqlite3
import unicodedata

ACUTE = "́"

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

"""Generate the standalone app: lookup, flashcards, learning path, status.

Bakes the lexicon subset, the study units and the path layout into one
self-contained HTML file. No server, no external requests.

    python tools/build_site.py --lemmas 4000
"""

import argparse
import hashlib
import io
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from panel import build_tables, fold  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent


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

    keys_of = {}
    for lid, k in db.execute("select lemma_id, key from forms"):
        if lid in seen:
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

        par = {}
        for slot, acc in db.execute(
                "select slot, accented from paradigm where lemma_id=?", (lid,)):
            par.setdefault(slot, [])
            if acc not in par[slot]:
                par[slot].append(acc)

        keys = keys_of.get(lid, set())
        cand = {i for k in keys for i in items_of_key.get(k, ())}
        ex = [{"ru": sentences[i][0], "en": sentences[i][1],
               "d": sentences[i][2], "au": sentences[i][3]}
              for i in sorted(cand, key=lambda i: len(sentences[i][0]))[:n_examples]]

        e = {"w": accented or bare, "b": bare, "p": pos, "e": en or "",
             "t": build_tables(pos, par), "x": ex, "n": corpus_n.get(lid, 0)}
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

    videos = {}
    vpath = ROOT / "data" / "videos.json"
    if vpath.exists():
        videos = json.loads(vpath.read_text(encoding="utf-8")).get("units", {})

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
            u["v"] = {"id": v["id"], "title": v["title"], "dur": v.get("dur")}
        units.append(u)

    path = [{"r": r, "c": c, "u": uidx[tid], "req": uidx.get(req)}
            for r, c, tid, req in db.execute(
                "select row, col, topic_id, requires from t.path order by row, col")
            if tid in uidx]

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

    return {"stats": stats, "lemmas": lemmas, "index": index,
            "units": units, "path": path, "audio": {"files": audio}}


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
    ap.add_argument("--examples", type=int, default=2)
    args = ap.parse_args()

    payload = gather(args.lexicon, args.corpus, args.topics, args.lemmas, args.examples)
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    css = (args.src / "app.css").read_text(encoding="utf-8")
    shell = (args.src / "shell.html").read_text(encoding="utf-8")
    # Order matters: everything is concatenated into one script, so top-level consts
    # must be evaluated before app.js's boot IIFE reaches them. Function declarations
    # hoist across the whole script, so only const/let evaluation order is at stake.
    js_files = []
    for f in ("fsrs.js", "accounts.js", "lessons.js", "drills.js", "app.js"):
        if (args.src / f).exists():
            js_files.append(f)
    js = "const DATA = " + blob + ";\n" + "\n".join(
        (args.src / f).read_text(encoding="utf-8") for f in js_files)

    args.outdir.mkdir(parents=True, exist_ok=True)
    (args.outdir / "index.html").write_text(
        assemble(HEAD, FONTS, css, shell, js), encoding="utf-8")
    (args.outdir / "artifact.html").write_text(
        assemble(ARTIFACT, FONTS, css, shell, js), encoding="utf-8")

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
    print(f"  scripts      : {', '.join(js_files)}")
    print(f"  page         : {(args.outdir / 'index.html').stat().st_size/1_048_576:.2f} MB")


if __name__ == "__main__":
    main()

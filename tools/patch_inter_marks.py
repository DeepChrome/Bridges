"""Make Inter place a stress mark on a Cyrillic vowel.

The owner, 2026-11-23: "a lot of the words appear slightly clipped (like how
they're written on the front of the card is slightly cropped)". They were not
clipped: every stress mark in the app was drawn over the *next* letter
(«пожа́луйста» with the mark on the л). Inter carries a mark anchor on every
Cyrillic vowel, but registers its `mark` and `mkmk` features under the Latin
and default scripts only; under `cyrl` it lists `kern` alone. A shaper reads
the Cyrillic script's list for Cyrillic text, so it never positions the
combining acute (U+0301) and the mark falls where its advance leaves it.

This adds the default script's GPOS features to every Cyrillic language system,
in place, so the anchors already in the font are used. Nothing else changes.

    py tools/patch_inter_marks.py native/assets/fonts/Inter-*.ttf

Needs fontTools, which the pipeline does not (rule 20.5): run it from a scratch
venv when new Inter files are dropped in, and check with --check. It is
idempotent.
"""
import argparse
import sys

from fontTools.ttLib import TTFont


def features_of(table, langsys):
    return {table.FeatureList.FeatureRecord[i].FeatureTag for i in langsys.FeatureIndex}


"""Two vowels have no anchor at all — я and Ю — and я takes the stress often
(«моя́», «меня́»). Each gets the anchors of a letter shaped like it (а, О),
moved over by half the difference in width so the mark sits on its middle."""
TEMPLATES = {0x44F: 0x430, 0x42E: 0x41E}


def add_anchors(font):
    import copy
    cmap = font.getBestCmap()
    gid = font.getGlyphID
    hmtx = font["hmtx"].metrics
    added = 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            st = getattr(st, "ExtSubTable", st)
            if not (hasattr(st, "BaseCoverage") and hasattr(st, "BaseArray")):
                continue
            bases = st.BaseCoverage.glyphs
            records = st.BaseArray.BaseRecord
            for cp, tp in TEMPLATES.items():
                glyph, template = cmap.get(cp), cmap.get(tp)
                if not glyph or not template or glyph in bases or template not in bases:
                    continue
                rec = copy.deepcopy(records[bases.index(template)])
                shift = (hmtx[glyph][0] - hmtx[template][0]) // 2
                for a in rec.BaseAnchor:
                    if a is not None:
                        a.XCoordinate += shift
                at = 0
                while at < len(bases) and gid(bases[at]) < gid(glyph):
                    at += 1
                bases.insert(at, glyph)
                records.insert(at, rec)
                st.BaseArray.BaseCount = len(records)
                added += 1
    return added


def patch(path, check):
    font = TTFont(path)
    gpos = font["GPOS"].table
    scripts = {sr.ScriptTag: sr.Script for sr in gpos.ScriptList.ScriptRecord}
    if "DFLT" not in scripts or "cyrl" not in scripts:
        return f"{path}: no DFLT or cyrl script; nothing to do"
    want = list(scripts["DFLT"].DefaultLangSys.FeatureIndex)
    cyrl = scripts["cyrl"]
    systems = [cyrl.DefaultLangSys] + [r.LangSys for r in cyrl.LangSysRecord]
    changed = 0
    for ls in systems:
        if ls is None:
            continue
        missing = [i for i in want if i not in ls.FeatureIndex]
        if missing:
            changed += 1
            ls.FeatureIndex = sorted(set(ls.FeatureIndex) | set(want))
            ls.FeatureCount = len(ls.FeatureIndex)
    tags = sorted(features_of(gpos, cyrl.DefaultLangSys))
    if check:
        ok = {"mark", "mkmk"} <= set(tags)
        return f"{path}: cyrl GPOS {' '.join(tags)} {'ok' if ok else 'MISSING mark'}", ok
    anchored = add_anchors(font)
    if changed or anchored:
        font.save(path)
    return f"{path}: cyrl GPOS now {' '.join(tags)} ({changed} language systems patched, {anchored} anchors added)", True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("fonts", nargs="+")
    ap.add_argument("--check", action="store_true", help="report only; exit 1 if a font lacks Cyrillic marks")
    args = ap.parse_args()
    bad = 0
    for p in args.fonts:
        line, ok = patch(p, args.check)
        print(line)
        bad += 0 if ok else 1
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

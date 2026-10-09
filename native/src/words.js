/* Word links, and the two taps behind them.
 *
 * Any Russian the app shows can be read as a web rather than as flat text: a word in
 * an example sentence is a way into that word. The interaction is deliberately in two
 * steps, because the two questions a learner has are different sizes.
 *
 *   first tap  — which word is this, and which form? A sheet, read in a second, that
 *                does not lose the sentence you were reading.
 *   second tap — the full entry: every table, every example. A screen, because that
 *                is a place you go rather than a thing you glance at.
 *
 * Tapping the same word again while its sheet is open is the second tap, so the
 * gesture is one repeated action rather than a hunt for a button — the button is
 * there too, since a gesture nobody discovers is not a feature.
 */

import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from "react";
import { View, Pressable } from "react-native";
import { createNavigationContainerRef, StackActions, CommonActions } from "@react-navigation/native";
import { useTheme, radius } from "./theme";
import { Sheet, Btn, Senses, SenseList, Text, Speaker, Flag } from "./ui";
import { L, IX, deepFormOf, resolveWord, sensesOf } from "./data";
import { fold, TOKEN } from "@core/util";
import { summarise, grammarLine } from "@core/forms";
import { wordFacts } from "@core/facts";
import { WordEntry } from "./screens/Word";
import { FactBubble } from "./rules";

export const navRef = createNavigationContainerRef();

/* How many meanings the summary sheet lists; the rest are behind More. */
const SHEET_SENSES = 2;

const Ctx = createContext(null);
export const useWords = () => useContext(Ctx);

/* Which lemma a surface form belongs to. The index is keyed by folded form, so
   «Книгу», «книгу» and «кни́гу» all arrive at the same entry. */
export function lookup(surface) {
  const hit = IX[fold(surface || "")];
  return hit && hit.length ? hit[0] : null;
}

/* The entry a surface form opens: a course word by its index, or — every
   other word the app shows (2026-10-03: "any word used… should be available
   in the dictionary") — the dictionary's own headword (`deepFormOf`). Null
   when neither knows it, and then it is not a link. */
export function entryOf(surface) {
  /* The dictionary's map first: it holds a studied key only where the build
     gave it to a noun whose dictionary form it is («кружка» the mug, not the
     genitive of «кружок» — build_deep_forms, "claimed"). */
  const deep = deepFormOf(surface);
  const i = lookup(surface);
  if (i !== null && !(deep && fold(deep.word) === fold(surface))) return { w: L[i], key: L[i].b };
  if (!deep) return null;
  const w = resolveWord(deep.word, deep.pos);
  return w ? { w, key: w.b, pos: deep.pos } : null;
}
const linkable = (surface) => lookup(surface) !== null || deepFormOf(surface) !== null;

/* Split a sentence into runs, marking the ones the lexicon recognises. A fresh
   regex per call: TOKEN is global, and a shared lastIndex silently drops matches. */
export function splitTokens(text) {
  const re = new RegExp(TOKEN.source, "g");
  const out = [];
  let last = 0, m;
  while ((m = re.exec(text || "")) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const i = lookup(m[0]);
    out.push(i !== null ? { text: m[0], i } : linkable(m[0]) ? { text: m[0], i: -1 } : { text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < (text || "").length) out.push({ text: text.slice(last) });
  return out;
}

/* Russian text whose recognised words are links. Underlined, because a link that
   only looks like a link once you press it is not discoverable. */
export function Linked({ text, style, size = 17, color, testID }) {
  const words = useWords();
  const t = useTheme();
  const parts = useMemo(() => splitTokens(text), [text]);

  return (
    <Text testID={testID} style={[{ color: color || t.ink, fontSize: size }, style]}>
      {parts.map((p, k) => (
        p.i === undefined ? (
          <Text key={k}>{p.text}</Text>
        ) : (
          <Text
            key={k}
            accessibilityRole="link"
            accessibilityLabel={`${p.text}, open word`}
            onPress={words ? () => words.open(p.text) : undefined}
            style={{ textDecorationLine: "underline", textDecorationColor: t.brand }}
          >
            {p.text}
          </Text>
        )
      ))}
    </Text>
  );
}

/* ---------------------------------------------------------- grammar line */

/* What the word is, right under it — class, gender or aspect, the aspect
   partner — and, when a form was tapped, which form it is (core/forms.js
   grammarLine). The glance, the entry and the flashcard's back all draw this,
   so a word is described in one way wherever it is met. */
/* As flags (the owner, 2026-10-04: "the case, the plurality, the first second
   or third person, the aspect all with little flags"): first what the form met
   is, brand-tinted, then what the word is, plain. */
/* A flag the word's facts explain (core/facts.js: "feminine", "imperfective")
   opens that explanation in a bubble; the label alone is what sits on the
   screen (the owner, 2026-10-04: "less verbose… details if clicked").
   The aspect partner is just the word, in brackets, and a link: beside the
   aspect flag the brackets already say "the other one". `all` adds the
   lexicon's further partners, for the entry. */
export function GrammarLine({ lemma, surface, style, center, all }) {
  const t = useTheme();
  const words = useWords();
  const [open, setOpen] = useState(null);
  const g = grammarLine(lemma, surface);
  if (!g || (!g.flags.length && !g.facts.length && !g.partner)) return null;
  const details = wordFacts(lemma);
  const detailOf = (tag) => details.find((d) => d.label.toLowerCase() === String(tag).toLowerCase());
  const partners = !g.partner ? [] : [...new Set([g.partner.word,
    ...(all ? [...String(lemma.pt || "").split(/,\s*/), ...String(lemma.pt2 || "").split(/,\s*/)] : [])]
    .filter((p) => p && p !== "-"))];
  const goTo = (word) => {
    if (words) words.open(word);
    else if (navRef.isReady()) navRef.dispatch(StackActions.push("Word", { word }));
  };
  return (
    <View testID="grammar-line"
          style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6,
                    justifyContent: center ? "center" : "flex-start" }, style]}>
      {g.flags.map((f) => <Flag key={`f${f}`} tone="form" testID="grammar-flag">{f}</Flag>)}
      {g.facts.map((f) => {
        const d = detailOf(f);
        return <Flag key={`w${f}`} testID="grammar-fact" onPress={d ? () => setOpen(d) : undefined}>{f}</Flag>;
      })}
      {partners.map((p, k) => {
        const id = k ? `grammar-partner-${k}` : "grammar-partner";
        // A link only where it leads somewhere: a partner the dictionary does
        // not carry is plain text, never a dead tap.
        if (!entryOf(p)) {
          return <Text key={p} testID={id} style={{ color: t.ink2, fontSize: 14, fontWeight: "700" }}>{`(${p})`}</Text>;
        }
        return (
          <Pressable key={p} testID={id} hitSlop={8}
                     accessibilityRole="link" accessibilityLabel={`${g.partner.label} partner ${p}, open word`}
                     onPress={() => goTo(p)}>
            <Text style={{ color: t.brandInk, fontSize: 14, fontWeight: "700",
                           textDecorationLine: "underline", textDecorationColor: t.brand }}>
              {`(${p})`}
            </Text>
          </Pressable>
        );
      })}
      {open ? <FactBubble fact={open} onClose={() => setOpen(null)}
                          onLeave={words ? words.close : undefined} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ sheet */

/* The top meanings, numbered, one to a line — the dictionary's senses where
   the word has them, the gloss's groups otherwise (the owner, 2026-10-04:
   "just grab the top two numbered definitions and leave the more button at
   the bottom"). A gloss run together on one line was a wall of synonyms. */
/* By the lemma's own place in L, never `idxOfWord(b)`: that is the first
   owner of the form key, which for «всё» or «его» is another word (§23). */
function SheetSenses({ lemma, size, style }) {
  const senses = sensesOf(L.indexOf(lemma));
  return senses
    ? <SenseList senses={senses} size={size} max={SHEET_SENSES} plain style={style} />
    : <Senses e={lemma.e} size={size} align="left" max={SHEET_SENSES} plain style={style} />;
}

function WordSheet({ state, onClose, onFull }) {
  const t = useTheme();
  if (!state) return null;
  const { entry, surface } = state;
  const lemma = entry.w;
  /* The full entry as a sheet: the second tap before there is a navigator to
     push the Word screen onto — the tour runs before the first profile exists
     (Intro.js). The same component the screen draws, so it is one entry, not
     a second one; without a navigator the "Heard in" rows are left out
     rather than left dead. */
  if (state.full) {
    return (
      <Sheet onClose={onClose} maxHeight="92%" testID="word-full-sheet">
        <WordEntry w={lemma} navigation={null} />
      </Sheet>
    );
  }
  const s = summarise(lemma, surface);
  if (!s) return null;

  return (
    <Sheet onClose={onClose} maxHeight="80%"
                 footer={<Btn block kind="pri" label="More" testID="sheet-more" style={{ marginTop: 18 }} onPress={onFull} />}>
      {/* A speaker beside the word, as on every other piece of Russian in the
          app (§30as); the glance was the one place a tapped word could not be
          heard. */}
      {/* A snapshot (the owner, 2026-10-04: "a quick organized snapshot to
          understand the word with the option to look up more"): the word as
          it was met, large, with its sound; under it, flags for what that form
          is and what the word is; then, for a form, the root word with its top
          meaning — itself a way into the entry — and for the headword its
          meanings. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text testID="sheet-word" style={{ flex: 1, color: t.ink, fontSize: 30, fontWeight: "600" }}>
          {s.surface || s.word}
        </Text>
        <Speaker text={s.surface || lemma.b} recordedOnly />
      </View>

      <GrammarLine lemma={lemma} surface={surface} style={{ marginTop: 8 }} />

      {s.surface ? (
        <Pressable testID="sheet-root" accessibilityRole="button" accessibilityLabel={`${lemma.b}, more`}
                   onPress={onFull}
                   style={({ pressed }) => ({ marginTop: 14, paddingVertical: 10, paddingHorizontal: 12,
                     borderRadius: radius.md, backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: t.ink3, fontSize: 12, fontWeight: "700" }}>Dictionary form</Text>
          <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700", marginTop: 2 }}>{s.word}</Text>
          <SheetSenses lemma={lemma} size={15} style={{ marginTop: 6 }} />
        </Pressable>
      ) : (
        <SheetSenses lemma={lemma} size={17} style={{ marginTop: 12 }} />
      )}
    </Sheet>
  );
}

/* How to reach a word's entry from wherever the learner is.
 *
 * `navigate` is right from anywhere except another entry. From an entry, React
 * Navigation 7 treats `navigate("Word")` as "update the screen you are already
 * on" — so reading from «книга» into «читать» into «прочитать» replaced one
 * screen's params three times, and Back left all of them at once for the
 * drill underneath. The owner, 2026-09-28: *"if I hit back it takes me to the
 * drill rather than to the previous page."*
 *
 * So from an entry it is a push: a new screen on the stack, which is the only
 * thing Back can return from. The push is dispatched only when the current
 * route *is* Word, which means the focused navigator is the Root stack that
 * owns it — nothing depends on an action bubbling up through the tabs.
 * Exported for the test. */
export function wordAction(current, word, pos) {
  const params = pos ? { word, pos } : { word };
  return current && current.name === "Word"
    ? StackActions.push("Word", params)
    : CommonActions.navigate("Word", params);
}

export function WordsProvider({ children }) {
  const [state, setState] = useState(null);
  const showing = useRef(null);

  /* `target` is a course word's index (the runner's bulb passes one) or an
     entry from `entryOf`, which also covers the dictionary's other words. */
  const openFull = useCallback((target) => {
    showing.current = null;
    const entry = typeof target === "number" ? { w: L[target], key: L[target].b } : target;
    if (!entry || !entry.w) return;
    /* By word, not by index — see the note in Word.js. `isReady` alone is not
       enough: the container is mounted before any navigator is (the gate, the
       tour), and a navigate then does nothing at all. With no current route
       the entry opens as a sheet instead (WordSheet). */
    if (navRef.isReady() && navRef.getCurrentRoute()) {
      setState(null);
      navRef.dispatch(wordAction(navRef.getCurrentRoute(), entry.key, entry.pos));
    } else {
      setState({ entry, surface: null, full: true });
    }
  }, []);

  const open = useCallback((surface) => {
    const entry = entryOf(surface);
    if (!entry) return;
    // The second tap on the same word is the way through to the full entry.
    if (showing.current === entry.key) { openFull(entry); return; }
    showing.current = entry.key;
    setState({ entry, surface });
  }, [openFull]);

  // `close` puts the sheet away, for a control inside it that leaves for a screen.
  const close = useCallback(() => { setState(null); showing.current = null; }, []);
  const value = useMemo(() => ({ open, openFull, lookup, close }), [open, openFull, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <WordSheet
        state={state}
        onClose={close}
        onFull={() => state && openFull(state.entry)}
      />
    </Ctx.Provider>
  );
}

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
import { View } from "react-native";
import { createNavigationContainerRef } from "@react-navigation/native";
import { useTheme } from "./theme";
import { Sheet, Btn, Senses, Text } from "./ui";
import { L, IX } from "./data";
import { fold, TOKEN } from "@core/util";
import { summarise } from "@core/forms";
import { WordEntry } from "./screens/Word";

export const navRef = createNavigationContainerRef();

/* How many sense groups the summary sheet lists before it counts the remainder;
   the same cap the vocabulary card uses (lesson.js). */
const SHEET_SENSES = 4;

const Ctx = createContext(null);
export const useWords = () => useContext(Ctx);

/* Which lemma a surface form belongs to. The index is keyed by folded form, so
   «Книгу», «книгу» and «кни́гу» all arrive at the same entry. */
export function lookup(surface) {
  const hit = IX[fold(surface || "")];
  return hit && hit.length ? hit[0] : null;
}

/* Split a sentence into runs, marking the ones the lexicon recognises. A fresh
   regex per call: TOKEN is global, and a shared lastIndex silently drops matches. */
export function splitTokens(text) {
  const re = new RegExp(TOKEN.source, "g");
  const out = [];
  let last = 0, m;
  while ((m = re.exec(text || "")) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const i = lookup(m[0]);
    out.push(i === null ? { text: m[0] } : { text: m[0], i });
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

/* ------------------------------------------------------------------ sheet */

function WordSheet({ state, onClose, onFull }) {
  const t = useTheme();
  if (!state) return null;
  const { index, surface } = state;
  const lemma = L[index];
  /* The full entry as a sheet: the second tap before there is a navigator to
     push the Word screen onto — the tour runs before the first profile exists
     (Intro.js). The same component the screen draws, so it is one entry, not
     a second one; without a navigator the "Heard in" rows are left out
     rather than left dead. */
  if (state.full) {
    return (
      <Sheet onClose={onClose} maxHeight="92%" testID="word-full-sheet">
        <WordEntry w={lemma} index={index} navigation={null} />
      </Sheet>
    );
  }
  const s = summarise(lemma, surface);
  if (!s) return null;

  return (
    <Sheet onClose={onClose} maxHeight="80%"
                 footer={<Btn kind="pri" label="Full entry" style={{ marginTop: 18 }} onPress={onFull} />}>
      <Text style={{ color: t.ink, fontSize: 30, fontWeight: "600" }}>
        {s.word}
      </Text>

      {s.surface ? (
        <Text style={{ color: t.ink3, fontSize: 14, marginTop: 4 }}>
          {s.form
            ? `${s.surface} · ${s.form.text}`
            : `${s.surface} · form not listed`}
        </Text>
      ) : s.form ? (
        <Text style={{ color: t.ink3, fontSize: 14, marginTop: 4 }}>
          {s.form.text}
        </Text>
      ) : null}

      {/* The senses numbered, as the entry, the flashcard back and the
          vocabulary card all number them — one run of prose was the odd surface
          out, and it showed `firstSense` alone, so «стол» read "table" with
          nothing to say that "diet" and "department" were also in there.
          Capped, because this is the glance: `Full entry` is in the footer, one
          press away, and that is the escape hatch `max` assumes. Four is the
          vocabulary card's cap — the app's other glance-sized surface — rather
          than a second number invented here. */}
      <Senses e={lemma.e} size={17} align="left" max={SHEET_SENSES}
              style={{ marginTop: 12 }} />

      {s.tags.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6,
                       marginTop: 12 }}>
          {s.tags.map((x) => (
            <View key={x} style={{ backgroundColor: t.surface2, borderRadius: 99,
                                   paddingHorizontal: 11, paddingVertical: 5 }}>
              <Text style={{ color: t.ink2, fontSize: 12, fontWeight: "600" }}>
                {x}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

export function WordsProvider({ children }) {
  const [state, setState] = useState(null);
  const showing = useRef(null);

  const openFull = useCallback((index) => {
    showing.current = null;
    /* By word, not by index — see the note in Word.js. `isReady` alone is not
       enough: the container is mounted before any navigator is (the gate, the
       tour), and a navigate then does nothing at all. With no current route
       the entry opens as a sheet instead (WordSheet). */
    if (navRef.isReady() && navRef.getCurrentRoute()) {
      setState(null);
      navRef.navigate("Word", { word: L[index].b });
    } else {
      setState({ index, surface: null, full: true });
    }
  }, []);

  const open = useCallback((surface) => {
    const index = lookup(surface);
    if (index === null) return;
    // The second tap on the same word is the way through to the full entry.
    if (showing.current === index) { openFull(index); return; }
    showing.current = index;
    setState({ index, surface });
  }, [openFull]);

  const value = useMemo(() => ({ open, openFull, lookup }), [open, openFull]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <WordSheet
        state={state}
        onClose={() => { setState(null); showing.current = null; }}
        onFull={() => state && openFull(state.index)}
      />
    </Ctx.Provider>
  );
}

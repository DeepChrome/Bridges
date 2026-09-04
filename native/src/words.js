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
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { createNavigationContainerRef } from "@react-navigation/native";
import { useTheme, radius } from "./theme";
import { L, IX } from "./data";
import { fold, TOKEN } from "@core/util";
import { summarise } from "@core/forms";

export const navRef = createNavigationContainerRef();

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
export function Linked({ text, style, size = 17, color }) {
  const words = useWords();
  const t = useTheme();
  const parts = useMemo(() => splitTokens(text), [text]);

  return (
    <Text style={[{ color: color || t.ink, fontSize: size }, style]}>
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

/* A single word as a link, for chips and headings where there is no sentence. */
export function WordLink({ word, style, size = 17 }) {
  const words = useWords();
  const t = useTheme();
  const known = lookup(word) !== null;
  if (!known || !words) {
    return <Text style={[{ color: t.ink, fontSize: size }, style]}>{word}</Text>;
  }
  return (
    <Text
      accessibilityRole="link"
      onPress={() => words.open(word)}
      style={[{ color: t.ink, fontSize: size, textDecorationLine: "underline",
                textDecorationColor: t.brand }, style]}
    >
      {word}
    </Text>
  );
}

/* ------------------------------------------------------------------ sheet */

function Sheet({ state, onClose, onFull }) {
  const t = useTheme();
  if (!state) return null;
  const { index, surface } = state;
  const lemma = L[index];
  const s = summarise(lemma, surface);
  if (!s) return null;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
      >
        {/* Stop the backdrop's press from closing when the sheet itself is tapped. */}
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: t.bg, borderTopLeftRadius: radius.lg,
                   borderTopRightRadius: radius.lg, padding: 18, paddingBottom: 26,
                   maxHeight: "80%" }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.line,
                         alignSelf: "center", marginBottom: 16 }} />
          <ScrollView>
            <Text style={{ color: t.ink, fontSize: 30, fontWeight: "600" }}>
              {s.word}
            </Text>

            {s.surface ? (
              <Text style={{ color: t.ink3, fontSize: 14, marginTop: 4 }}>
                {s.form
                  ? `${s.surface} · ${s.form.text}`
                  : `${s.surface} · form not in the paradigm`}
              </Text>
            ) : s.form ? (
              <Text style={{ color: t.ink3, fontSize: 14, marginTop: 4 }}>
                {s.form.text}
              </Text>
            ) : null}

            {s.gloss ? (
              <Text style={{ color: t.ink2, fontSize: 17, marginTop: 12 }}>
                {s.gloss}
              </Text>
            ) : null}

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
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onFull}
            style={({ pressed }) => ({
              marginTop: 18, backgroundColor: t.brand, borderColor: t.brandDim,
              borderWidth: 1, borderBottomWidth: pressed ? 1 : 3,
              borderRadius: radius.md, paddingVertical: 14, alignItems: "center",
            })}
          >
            <Text style={{ color: t.brandOn, fontWeight: "700", fontSize: 15 }}>
              Full entry
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function WordsProvider({ children }) {
  const [state, setState] = useState(null);
  const showing = useRef(null);

  const openFull = useCallback((index) => {
    setState(null);
    showing.current = null;
    // By word, not by index — see the note in Word.js.
    if (navRef.isReady()) navRef.navigate("Word", { word: L[index].b });
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
      <Sheet
        state={state}
        onClose={() => { setState(null); showing.current = null; }}
        onFull={() => state && openFull(state.index)}
      />
    </Ctx.Provider>
  );
}

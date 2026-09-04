/* The full dictionary entry — the second tap.
 *
 * Everything the summary sheet deliberately withholds: the paradigm in full, and
 * every sentence from the collection that uses the word. The sentences are
 * themselves linked, so reading an entry can lead to the next word rather than
 * dead-ending.
 */

import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useTheme } from "../theme";
import { Screen, Card, Pill, Speaker, Muted } from "../ui";
import { L, UN, resolveWord } from "../data";
import { Linked } from "../words";

export function Table({ table }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "700",
                     letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
        {table.title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: "row" }}>
            {table.columns.map((c, ci) => (
              <Text key={c + ci} style={{ width: 110, color: t.ink3, fontSize: 10,
                                          fontWeight: "700", textTransform: "uppercase",
                                          letterSpacing: 0.6, paddingVertical: 6 }}>
                {c}
              </Text>
            ))}
          </View>
          {table.rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: "row", borderTopWidth: 1,
                                    borderTopColor: t.lineSoft }}>
              {r.map((cell, ci) => (
                <Text
                  key={ci}
                  style={{ width: 110, paddingVertical: 6, fontSize: ci === 0 ? 13 : 15,
                           color: ci === 0 ? t.ink3 : t.ink }}
                >
                  {Array.isArray(cell) ? cell.join(" / ") : cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function Word({ route }) {
  const t = useTheme();
  /* Addressed by the word, not by an index: lemma indices are assigned by frequency
     at build time and move on every rebuild, which is the same reason learner state
     keys on the word. The index form is still accepted for older call sites. */
  const p = route.params || {};
  const w = p.word !== undefined ? resolveWord(p.word) : L[p.i];
  if (!w) {
    return (
      <Screen>
        <Muted style={{ textAlign: "center", marginTop: 40 }}>
          {`“${p.word}” is not in the dictionary.`}
        </Muted>
      </Screen>
    );
  }
  const unit = w.u ? UN.find((u) => u.id === w.u) : null;
  const examples = w.x || [];

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: t.ink, fontSize: 32, fontWeight: "600", flex: 1 }}>
            {w.w}
          </Text>
          <Speaker text={w.b} />
        </View>
        {w.e ? (
          <Text style={{ color: t.ink2, fontSize: 16, marginTop: 8 }}>{w.e}</Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {[w.p, w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
          {w.pt ? <Pill>{`pair: ${w.pt}`}</Pill> : null}
          {w.fr ? <Pill>{"#" + w.fr}</Pill> : null}
          {unit ? <Pill tone="brand">{unit.name}</Pill> : null}
        </View>
        {(w.t || []).map((tb, k) => <Table key={k} table={tb} />)}
      </Card>

      {examples.length ? (
        <>
          <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "700",
                         letterSpacing: 1, textTransform: "uppercase",
                         marginTop: 22, marginBottom: 8, marginLeft: 2 }}>
            {`In your collection · ${examples.length}`}
          </Text>
          <Card>
            {examples.map((e, k) => (
              <View
                key={k}
                style={{ paddingVertical: 10,
                         borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={e.ru} />
                  </View>
                  <Speaker text={e.ru} size={36} />
                </View>
                <Muted style={{ marginTop: 4 }}>{e.en}</Muted>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

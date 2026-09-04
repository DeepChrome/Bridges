/* Search — the dictionary. Any form, English, or Latin spelling. */

import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";
import { useTheme, radius } from "../theme";
import { Screen, Card, Pill, Speaker, Muted } from "../ui";
import { L, IX, UN } from "../data";
import { fold, translit, firstSense } from "@core/util";

function search(raw) {
  const q = fold(raw);
  if (!q) return [];
  if (IX[q]) return IX[q].slice(0, 4);
  const tr = translit(q);
  if (tr !== q && IX[tr]) return IX[tr].slice(0, 4);

  // English: whole-sense matches beat buried substrings, so "war" finds война
  // rather than к ("toward").
  const qe = q.replace(/^to /, "");
  const esc = qe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const scored = [];
  for (let i = 0; i < L.length; i++) {
    const g = L[i].e;
    if (!g) continue;
    const senses = g.toLowerCase().split(/[,;]\s*/);
    let s = 0;
    if (senses.includes(qe)) s = 3;
    else if (senses.some((x) => new RegExp("\\b" + esc + "\\b").test(x))) s = 2;
    else if (g.toLowerCase().includes(qe)) s = 1;
    if (s) scored.push([s, i]);
  }
  if (scored.length) {
    scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return scored.slice(0, 6).map((x) => x[1]);
  }
  const pre = [];
  for (const k in IX) {
    if (k.startsWith(q) || k.startsWith(tr)) {
      pre.push(...IX[k]);
      if (pre.length > 6) break;
    }
  }
  return pre.slice(0, 6);
}

function Table({ table }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600",
                     letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
        {table.title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: "row" }}>
            {table.columns.map((c) => (
              <Text key={c} style={{ width: 110, color: t.ink3, fontSize: 10,
                                     fontWeight: "600", textTransform: "uppercase",
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

function Entry({ i, onWord }) {
  const w = L[i];
  const t = useTheme();
  const unit = w.u ? UN.find((u) => u.id === w.u) : null;
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: t.ink, fontSize: 28, fontWeight: "600", flex: 1 }}>
          {w.w}
        </Text>
        <Speaker text={w.b} />
      </View>
      {w.e ? <Text style={{ color: t.ink2, fontSize: 15, marginTop: 6 }}>{w.e}</Text> : null}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {[w.p, w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
        {w.fr ? <Pill>{"#" + w.fr}</Pill> : null}
        {unit ? <Pill tone="brand">{unit.name}</Pill> : null}
      </View>
      {(w.t || []).map((tb, k) => <Table key={k} table={tb} />)}
      {(w.x || []).length ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: t.line,
                       paddingTop: 10 }}>
          {w.x.map((e, k) => (
            <View key={k} style={{ paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: t.ink, fontSize: 17, flex: 1 }}>{e.ru}</Text>
                <Speaker text={e.ru} size={36} />
              </View>
              <Muted>{e.en}</Muted>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function Search() {
  const t = useTheme();
  const [q, setQ] = useState("");
  const hits = useMemo(() => search(q), [q]);

  return (
    <Screen>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Russian, English or Latin"
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
                 fontSize: 17, color: t.ink }}
      />
      <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
        {["себе", "я", "книгу", "хочу", "война"].map((w) => (
          <Pressable
            key={w}
            onPress={() => setQ(w)}
            style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface,
                     borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10,
                     minHeight: 40, justifyContent: "center" }}
          >
            <Text style={{ color: t.ink2, fontSize: 14 }}>{w}</Text>
          </Pressable>
        ))}
      </View>
      {q.trim() && !hits.length ? (
        <Muted style={{ textAlign: "center", marginTop: 34 }}>
          {`Nothing for “${q}”.`}
        </Muted>
      ) : null}
      {hits.map((i) => <Entry key={i} i={i} />)}
    </Screen>
  );
}

/* Search — the dictionary.
 *
 * Results appear as you type, as a list of matches; choosing one opens the entry.
 * The list is the summary layer, so a search that finds six plausible words shows
 * six, rather than committing the screen to whichever one happened to rank first.
 *
 * Two tiers, marked honestly. Words from the curriculum carry study data and resolve
 * from any inflected form; the rest of the lexicon is headword and meaning only, and
 * says so rather than opening an entry that turns out to be empty.
 */

import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Pill, Speaker, Muted, List, Row } from "../ui";
import { searchWords, DEEP_COUNT } from "../data";
import { firstSense } from "@core/util";

const RECENT_MAX = 6;

export default function Search({ navigation }) {
  const t = useTheme();
  const { st, update } = useSession();
  const [text, setText] = useState("");

  const q = text.trim();
  const hits = useMemo(() => searchWords(q), [q]);
  const recent = st.recent || [];

  /* Opening an entry is what counts as having looked a word up — typing on the way
     to it is not a search worth remembering. */
  const open = (entry) => {
    update((prev) => ({
      ...prev,
      recent: [entry.b, ...(prev.recent || []).filter((w) => w !== entry.b)]
        .slice(0, RECENT_MAX),
    }));
    navigation.navigate("Word", { word: entry.b });
  };

  return (
    <Screen>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Russian, English or Latin"
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
                 fontSize: 17, color: t.ink }}
      />

      {!q && recent.length ? (
        <>
          <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "700",
                         letterSpacing: 1, textTransform: "uppercase",
                         marginTop: 16, marginBottom: 8, marginLeft: 2 }}>
            Recent
          </Text>
          <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
            {recent.map((w) => (
              <Pressable
                key={w}
                accessibilityRole="button"
                onPress={() => navigation.navigate("Word", { word: w })}
                style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface,
                         borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10,
                         minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: t.ink2, fontSize: 14 }}>{w}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {q && !hits.length ? (
        <Muted style={{ textAlign: "center", marginTop: 34 }}>
          {`Nothing for “${q}”.`}
        </Muted>
      ) : null}

      {hits.length ? (
        <View style={{ marginTop: 16 }}>
          <List>
            {hits.map((h, k) => (
              <Row key={h.b} last={k === hits.length - 1} onPress={() => open(h)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600" }}>
                    {h.w}
                  </Text>
                  <Muted size={14}>{firstSense(h)}</Muted>
                </View>
                {h.p ? <Pill>{h.p}</Pill> : null}
                <Speaker text={h.b} size={38} />
              </Row>
            ))}
          </List>
        </View>
      ) : null}

      {!q ? (
        <Muted style={{ textAlign: "center", marginTop: recent.length ? 28 : 34 }}>
          {`${DEEP_COUNT.toLocaleString("en-US")} words`}
        </Muted>
      ) : null}
    </Screen>
  );
}

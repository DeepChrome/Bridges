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
import { View, Text } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Pill, Speaker, Muted, List, Row, SearchField, SectionLabel, Chip } from "../ui";
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
      <SearchField value={text} onChangeText={setText} placeholder="Russian, English or Latin"
                   label="Search the dictionary" testID="word-search" />

      {!q && recent.length ? (
        <>
          <SectionLabel style={{ marginTop: 16 }}>Recent</SectionLabel>
          <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
            {recent.map((w) => (
              <Chip key={w} label={w} onPress={() => navigation.navigate("Word", { word: w })} />
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

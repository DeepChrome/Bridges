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
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Pill, Speaker, Muted, List, Row, SearchField, SectionLabel, Chip, Text } from "../ui";
import { searchWordsScored, DEEP_COUNT } from "../data";
import { MATCH } from "@core/search";

const RECENT_MAX = 6;
const LIMIT = 20;

/* The result list read like a dictionary (the owner, 2026-09-19: "dog" gave
   five or six words that all looked the same). They were not the same — the
   ranking was right — but each row showed only its first sense, so собака,
   пёс and кобель read as three copies of "dog". Now a row carries the whole
   gloss, and the list is cut in two where the ranking cuts it: the words that
   *are* the term, then the words whose meaning merely mentions it. */
function Hit({ h, onOpen }) {
  const t = useTheme();
  return (
    <Row onPress={() => onOpen(h)} testID={`hit-${h.b}`}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600" }}>
          {h.w}
        </Text>
        <Muted size={14} numberOfLines={2}>{h.e}</Muted>
      </View>
      {h.p ? <Pill>{h.p}</Pill> : null}
      <Speaker text={h.b} size={38} />
    </Row>
  );
}

export default function Search({ navigation }) {
  const t = useTheme();
  const { st, update } = useSession();
  const [text, setText] = useState("");

  const q = text.trim();
  const scored = useMemo(() => searchWordsScored(q, LIMIT), [q]);
  const matches = scored.filter((x) => x.score >= MATCH).map((x) => x.entry);
  const mentions = scored.filter((x) => x.score < MATCH).map((x) => x.entry);
  const hits = matches.concat(mentions);
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
      <SearchField value={text} onChangeText={setText} placeholder="Russian or English"
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

      {matches.length ? (
        <View style={{ marginTop: 16 }}>
          <List>
            {matches.map((h) => <Hit key={h.b} h={h} onOpen={open} />)}
          </List>
        </View>
      ) : null}
      {mentions.length ? (
        <>
          <SectionLabel testID="search-mentions" style={{ marginTop: matches.length ? 18 : 16 }}>
            {matches.length ? "Also" : "Mentions"}
          </SectionLabel>
          <List>
            {mentions.map((h) => <Hit key={h.b} h={h} onOpen={open} />)}
          </List>
        </>
      ) : null}

      {!q ? (
        <Muted style={{ textAlign: "center", marginTop: recent.length ? 28 : 34 }}>
          {`${DEEP_COUNT.toLocaleString("en-US")} words`}
        </Muted>
      ) : null}
    </Screen>
  );
}

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
import { searchWordsScored } from "../data";
import { MATCH } from "@core/search";

const RECENT_MAX = 6;

/* A row that never wraps and never cuts a chip in half (the owner,
   2026-09-28: "Recents under search should never exceed one line. It looks
   ugly and off balance that way"). The chips are measured off-screen and only
   as many as fit whole are drawn, most recent first — a half chip at the edge
   is the same imbalance as a second line. Until the first measurement arrives
   (and in a test, where layout never fires) it draws them all in one
   unwrapped, clipped row, which is still one line. Exported for the test. */
export function fitting(widths, avail, gap) {
  let used = 0, n = 0;
  for (const w of widths) {
    if (w === undefined) break;
    const next = used + (n ? gap : 0) + w;
    if (next > avail) break;
    used = next;
    n++;
  }
  return n;
}

function OneLine({ items, gap, render }) {
  const [avail, setAvail] = useState(0);
  const [widths, setWidths] = useState({});
  /* A chip in an unwrapped row keeps its natural width even past the edge
     (React Native's flexShrink defaults to 0), so every chip can be measured
     where it stands — the frame before the ones that do not fit are dropped.
     A word not yet measured puts the whole row back for that one frame. */
  const measured = avail > 0 && items.every((x) => widths[x] !== undefined);
  const n = measured ? Math.max(1, fitting(items.map((x) => widths[x]), avail, gap)) : items.length;
  return (
    <View onLayout={(e) => setAvail(e.nativeEvent.layout.width)} style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", gap, flexWrap: "nowrap" }}>
        {items.slice(0, n).map((x) => render(x, (e) => {
          const w = e.nativeEvent.layout.width;
          setWidths((p) => (p[x] === w ? p : { ...p, [x]: w }));
        }))}
      </View>
    </View>
  );
}
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
          <OneLine items={recent} gap={7}
                   render={(w, onLayout) => (
                     <View key={w} onLayout={onLayout}>
                       <Chip label={w} onPress={() => navigation.navigate("Word", { word: w })} />
                     </View>
                   )} />
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
      {/* "45,987 words" sat here under an empty search (the owner,
          2026-09-28: "that number doesn't matter"). It described the
          database, not anything the learner could do with it. */}
    </Screen>
  );
}

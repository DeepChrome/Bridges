/* Read anything (ROADMAP P10.7).
 *
 * Paste Russian from anywhere and the app says what you can already do with it:
 * how much of it you are scheduling, which words are new, and every word two
 * presses from its entry. The reading view is `Linked`, the same component the
 * rest of the app renders Russian prose with, so a tapped word opens the same
 * sheet with the same form named — nothing here is a second way to look a word
 * up (rule 20.8).
 *
 * **What it does not do.** A YouTube link is recognised and, if the video is in
 * the library, opens there — but a link to anything else cannot be read,
 * because fetching and captioning a video is a build-time job with a tool chain
 * behind it and this is a phone. It says so rather than failing silently, which
 * is the difference between a limit and a bug.
 */

import React, { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Muted, Pill, SectionLabel, List, Row, Speaker } from "../ui";
import { RuInput } from "../keyboard";
import { Linked } from "../words";
import { L, IX, videoById } from "../data";
import { analyse, readVerdict, youtubeId, MAX_CHARS } from "@core/read";
import { firstSense, today } from "@core/util";

export function Read({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const [text, setText] = useState("");
  const [reading, setReading] = useState(null);

  const link = youtubeId(text);
  const known = useMemo(() => (reading ? analyse(reading, { L, IX, seen: st.seen }) : null),
                        [reading, st.seen]);
  const verdict = known ? readVerdict(known) : null;

  const open = () => {
    const id = youtubeId(text);
    if (id && videoById(id)) { navigation.navigate("Video", { videoId: id }); return; }
    setReading(text);
  };

  /* Straight into the trouble bank's sibling: pinned, and scheduled from today
     so it appears in the next review rather than at some unspecified later
     point. The same route the video miner uses (P10.4). */
  const add = (i) => {
    const bare = L[i].b;
    update((prev) => ({
      ...prev,
      pinned: prev.pinned.includes(bare) ? prev.pinned : prev.pinned.concat(bare),
      seen: prev.seen[bare] ? prev.seen : {
        ...prev.seen,
        [bare]: { s: 0, d: 0, due: today(), last: 0, reps: 0, lapses: 0 },
      },
    }));
  };

  if (reading && known) {
    const tone = { good: t.good, ok: t.brand, hard: t.bad, none: t.ink3 }[verdict.tone];
    return (
      <Screen>
        <Card testID="read-verdict"
              style={{ borderLeftWidth: 4, borderLeftColor: tone, marginBottom: 16 }}>
          <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>{verdict.text}</Text>
          <Muted style={{ marginTop: 6 }}>
            {`${known.knownTokens} of ${known.content} content words are yours`}
            {known.unknown ? ` · ${known.unknown} outside the dictionary` : ""}
          </Muted>
          {known.truncated ? (
            <Muted style={{ marginTop: 4 }}>{`Only the first ${MAX_CHARS} characters were read.`}</Muted>
          ) : null}
        </Card>

        <SectionLabel>The text</SectionLabel>
        <Card>
          <Linked text={reading.slice(0, MAX_CHARS)} size={T.head + 2} />
        </Card>

        {known.newWords.length ? (
          <>
            <SectionLabel style={{ marginTop: 18 }}>
              {`${known.newWords.length} new ${known.newWords.length === 1 ? "word" : "words"}`}
            </SectionLabel>
            <List>
              {known.newWords.slice(0, 40).map((w) => (
                <Row key={w.i} testID={`read-new-${L[w.i].b}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "600" }}>
                      {L[w.i].w}
                    </Text>
                    <Muted numberOfLines={1}>{firstSense(L[w.i])}</Muted>
                  </View>
                  {w.n > 1 ? <Muted size={12}>{`${w.n}×`}</Muted> : null}
                  <Speaker text={L[w.i].b} size={36} />
                  {st.pinned.includes(L[w.i].b)
                    ? <Pill tone="good">added</Pill>
                    : <Btn label="Add" testID={`read-add-${L[w.i].b}`} onPress={() => add(w.i)} />}
                </Row>
              ))}
            </List>
          </>
        ) : null}

        <Btn kind="ghost" label="Read something else" style={{ marginTop: 18 }}
             onPress={() => { setReading(null); setText(""); }} />
      </Screen>
    );
  }

  return (
    <Screen fill>
      <Muted style={{ marginBottom: 12 }}>
        Paste Russian from anywhere. Every word becomes tappable, and the new ones
        can go straight into your review.
      </Muted>
      <RuInput
        testID="read-input"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Paste Russian text"
        style={{ minHeight: 160, textAlignVertical: "top", borderRadius: radius.md }}
      />
      {link ? (
        <Muted testID="read-link" style={{ marginTop: 10 }}>
          {videoById(link)
            ? "That video is in the library. Opening it there."
            : "A video link can only be opened if it is already in the library."}
        </Muted>
      ) : null}
      <View style={{ marginTop: "auto", paddingTop: 16 }}>
        <Btn kind="pri" testID="read-go" label="Read it"
             disabled={!text.trim() || (!!link && !videoById(link))} onPress={open} />
      </View>
    </Screen>
  );
}

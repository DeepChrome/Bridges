/* Where the material came from, and under what licence.
 *
 * **This is an obligation, not a courtesy** (rule 20.10). OpenRussian is
 * CC BY-SA 4.0, Tatoeba's sentences CC BY 2.0 FR, Wiktionary's senses
 * CC BY-SA 3.0, and every one of them requires the credit to travel with the
 * material. The web app has carried it since 2026-09-04 and the native app —
 * which is the product (§20a) — never did. Found while auditing for the store,
 * 2026-09-17.
 *
 * The sources are read from `payload.stats.credits`, which `build_site.py`
 * builds from each database's own `meta` rows, so a credit cannot drift from
 * what actually shipped. The dependency licences come from
 * `tools/build_notices.mjs`, which reads node_modules. Neither list is typed
 * by hand, and that is the point of both.
 *
 * The photographs are the exception and deliberately so: each carries its own
 * author and licence on the word it belongs to (§30h′), because a wall of 259
 * credits here would be read by nobody and the credit belongs beside the
 * picture.
 */

import React from "react";
import { View, Linking } from "react-native";
import { Screen, List, Row, Muted, SectionLabel, Text } from "../ui";
import { useTheme } from "../theme";
import { STATS } from "../data";
import { NOTICES } from "../notices";

/* The one line that is not generated: the bought scenario audio has no meta
   row to read, because it is a purchase rather than a corpus. */
const VOICES = {
  n: "Google Cloud Text-to-Speech (Chirp3-HD)",
  l: "Licensed for use in this app",
};

export default function Credits() {
  const t = useTheme();
  const sources = (STATS && STATS.credits) || [];
  return (
    <Screen>
      <SectionLabel>Language material</SectionLabel>
      <List>
        {sources.map((c) => (
          <Row key={c.n}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>{c.n}</Text>
              <Muted>{c.l}</Muted>
            </View>
          </Row>
        ))}
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15 }}>{VOICES.n}</Text>
            <Muted>{VOICES.l}</Muted>
          </View>
        </Row>
      </List>

      <SectionLabel style={{ marginTop: 22 }}>Photographs</SectionLabel>
      <List>
        <Row onPress={() => Linking.openURL("https://commons.wikimedia.org")}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15 }}>Wikimedia Commons</Text>
            <Muted>Each picture credits its author on the word</Muted>
          </View>
        </Row>
      </List>

      <SectionLabel style={{ marginTop: 22 }}>Software</SectionLabel>
      <List>
        {NOTICES.map((n) => (
          <Row key={n.l}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>{n.l}</Text>
              <Muted>{n.packages.join(", ")}</Muted>
            </View>
          </Row>
        ))}
      </List>
      <Muted size={12} style={{ marginTop: 14 }}>
        {"Russian course material © Jared Flood"}
      </Muted>
    </Screen>
  );
}

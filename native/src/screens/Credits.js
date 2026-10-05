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
 * The photographs are listed one by one, folded: since 2026-10-05 the lesson
 * card carries no credit line (the owner did not want one under every
 * picture), so this list and the word's own entry are where each author and
 * licence is shown.
 */

import React from "react";
import { View, Linking } from "react-native";
import { Screen, List, Row, Muted, SectionLabel, Text, Fold } from "../ui";
import { CREDITS as PHOTO_CREDITS } from "../images";
import { useTheme } from "../theme";
import { STATS } from "../data";
import { NOTICES } from "../notices";
import { AV_CREDIT } from "@core/avatars";
import { APP_NAME } from "../brand";
import { expo as APP } from "../../app.json";

/* The one line that is not generated: the bought scenario audio has no meta
   row to read, because it is a purchase rather than a corpus. */
const PHOTOS = Object.entries(PHOTO_CREDITS || {}).sort((a, b) => a[0].localeCompare(b[0], "ru"));

const VOICES = {
  n: "Google Cloud Text-to-Speech (Chirp3-HD)",
  l: "Licensed for use in this app",
};

export default function Credits() {
  const t = useTheme();
  const sources = (STATS && STATS.credits) || [];
  return (
    <Screen>
      {/* About, kept light (the owner, 2026-10-02): who made it, for whom. */}
      <View testID="about" style={{ alignItems: "center", paddingVertical: 18, gap: 4 }}>
        <Text style={{ color: t.ink, fontSize: 19, fontWeight: "700" }}>{APP_NAME}</Text>
        <Muted size={12}>{APP.version}</Muted>
        <Text style={{ color: t.ink2, fontSize: 15, marginTop: 10 }}>App built by Jared F.</Text>
        <Text style={{ color: t.ink2, fontSize: 15 }}>Dedicated to Teddy and Cone.</Text>
        <Text style={{ color: t.ink, fontSize: 15, marginTop: 10, fontWeight: "700" }}>Слава Україні!</Text>
      </View>

      <SectionLabel style={{ marginTop: 8 }}>Language material</SectionLabel>
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
      {/* Every photograph, its author and licence, each opening its Commons
          page — the credit CC BY and BY-SA ask for, now that the lesson card
          carries none (2026-10-05). Read off images.js, which build_images.py
          writes from the harvest's own records. Folded: it is long. */}
      <Fold testID="photo-credits" title={`Wikimedia Commons · ${PHOTOS.length}`}>
        <List>
          {PHOTOS.map(([word, c]) => (
            <Row key={word} onPress={c.u ? () => Linking.openURL(c.u) : undefined}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15 }}>{word}</Text>
                <Muted>{[c.t, c.a, c.l].filter(Boolean).join(" · ")}</Muted>
              </View>
            </Row>
          ))}
        </List>
      </Fold>

      {/* Read off core/avatars.js, which the generator writes from the style's
          own licence metadata, so the credit cannot drift from the faces. */}
      {AV_CREDIT ? <SectionLabel style={{ marginTop: 22 }}>Characters</SectionLabel> : null}
      {AV_CREDIT ? (
        <List>
          <Row onPress={AV_CREDIT.url ? () => Linking.openURL(AV_CREDIT.url) : undefined}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>
                {`${AV_CREDIT.title} by ${AV_CREDIT.creator}`}
              </Text>
              <Muted>{`${AV_CREDIT.license} · ${AV_CREDIT.via}`}</Muted>
            </View>
          </Row>
        </List>
      ) : null}

      {/* The app's typeface (theme.js), bundled as files rather than a
          package, so the notices below cannot list it. */}
      <SectionLabel style={{ marginTop: 22 }}>Typefaces</SectionLabel>
      <List>
        <Row onPress={() => Linking.openURL("https://fonts.google.com/specimen/PT+Serif")}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15 }}>PT Serif by ParaType</Text>
            <Muted>SIL Open Font License 1.1</Muted>
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

/* Grammar — the reference, and the one place the rules are gathered.
 *
 * The owner, 2026-09-27: *"We really need to focus on making the grammar more
 * digestible in general. Right now, there's no clear mechanism for
 * communicating hard vs soft stems, rules, when to use genitive, etc. We
 * really just skip a lot of the rules in general… like what letters are
 * indicating feminine, masculine, neutral."*
 *
 * Two of those three were in the app and unreachable. The 34 unit cards teach
 * gender, the plural, every case and both aspects — but a card is only ever
 * met inside the lesson that owns it and under a wrong answer, so there was
 * nowhere to go and look one up. Hard and soft stems were genuinely absent.
 *
 * So: six topics (core/grammar.js), each a list of short sections rather than
 * an essay, and each section that the course also teaches draws the course's
 * own card underneath rather than restating it — one source of truth (§22).
 *
 * It sits in Practice beside Alphabet, which is the same kind of thing: a
 * reference that is open from the first screen and never scored. The bulb on
 * a drill opens it at the topic behind the question.
 */

import React, { useState } from "react";
import { View } from "react-native";
import { useTheme, type as T } from "../theme";
import { Screen, Title, List, Row, Muted, Text } from "../ui";
import { TopicSection } from "../rules";
import { TOPICS, topicById } from "@core/grammar";
import { UN } from "../data";

/* The course's own card for a unit, or nothing when that unit has none. The
   reference names units; the payload decides what they say. */
function cardsFor(section) {
  return (section.cards || [])
    .map((id) => {
      const unit = UN.find((u) => u.id === id);
      return unit && unit.g ? { unit, note: unit.g } : null;
    })
    .filter(Boolean);
}

export default function Grammar({ route }) {
  const t = useTheme();
  const asked = route && route.params ? route.params.topic : null;
  const [open, setOpen] = useState(asked ? topicById(asked) : null);

  if (!open) {
    return (
      <Screen>
        <Title>Grammar</Title>
        <List>
          {/* No tile on these rows. Six rows of one repeated glyph marks
              nothing (§30s); the topic's name is what distinguishes it. */}
          {TOPICS.map((topic) => (
            <Row key={topic.id} testID={`topic-${topic.id}`} onPress={() => setOpen(topic)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "700" }}>
                  {topic.title}
                </Text>
                <Muted>{topic.blurb}</Muted>
              </View>
            </Row>
          ))}
        </List>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{open.title}</Title>
      {open.sections.map((s, k) => (
        <TopicSection key={k} section={s} cards={cardsFor(s)} testID={`section-${k}`} />
      ))}
      {/* Back to the list, in the list's own place rather than as a header
          control: this screen is two screens deep in one route, and the
          navigator's back arrow leaves Grammar altogether. */}
      <List>
        <Row testID="topics-back" onPress={() => setOpen(null)}>
          <Text style={{ flex: 1, color: t.brandInk, fontSize: T.body, fontWeight: "700" }}>
            All topics
          </Text>
        </Row>
      </List>
    </Screen>
  );
}

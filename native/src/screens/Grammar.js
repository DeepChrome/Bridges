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

import React from "react";
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

/* Every topic is its own screen on the stack, not a state of this one.
 *
 * It was a `useState` here: the list and a topic were one screen, so Back from
 * a topic left Grammar altogether and landed on the drill the bulb had been
 * pressed on — the owner, 2026-09-28: *"if I hit back it takes me to the drill
 * rather than to the previous page."* A place the learner can go has to be a
 * place Back can return from, so opening a topic pushes, and the topic comes
 * from the route rather than from memory that Back cannot see. */
export default function Grammar({ route, navigation }) {
  const t = useTheme();
  const asked = route && route.params ? route.params.topic : null;
  const open = asked ? topicById(asked) : null;
  const openTopic = (id) => navigation.push("Grammar", { topic: id });
  /* "All topics" returns to the list the learner came from when there is one,
     and opens it when the bulb brought them straight to a topic — so it never
     stacks a second copy of a list that is one Back away. */
  const toList = () => {
    const routes = (navigation.getState && navigation.getState().routes) || [];
    const prev = routes[routes.length - 2];
    if (prev && prev.name === "Grammar" && !(prev.params && prev.params.topic)) navigation.goBack();
    else navigation.push("Grammar", {});
  };

  if (!open) {
    return (
      <Screen>
        <Title>Grammar</Title>
        <List>
          {/* No tile on these rows. Six rows of one repeated glyph marks
              nothing (§30s); the topic's name is what distinguishes it. */}
          {TOPICS.map((topic) => (
            <Row key={topic.id} testID={`topic-${topic.id}`} onPress={() => openTopic(topic.id)}>
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

  /* A link from a fact's pill names the section that states the rule
     (FACT_REFS in core/facts.js). That section comes first, set apart by a
     brand edge, and the topic follows in its own order without it. A section
     that is a page of its own (one per case) opens as that page instead. */
  const want = route && route.params ? route.params.section : null;
  const first = want ? open.sections.findIndex((s) => s.heading === want) : -1;
  const pages = open.sections.filter((s) => s.page);
  /* `only`: a fact on an entry opened this section by itself (core/facts.js
     FACT_REFS) — the rule on its own page, with the rest of its topic a tap
     away. */
  const only = !!(route && route.params && route.params.only);
  const page = first >= 0 && (open.sections[first].page || only) ? open.sections[first] : null;
  const openPage = (heading) => navigation.push("Grammar", { topic: open.id, section: heading });

  if (page) {
    const k = pages.indexOf(page);
    const prev = k >= 0 ? pages[k - 1] : null, next = k >= 0 ? pages[k + 1] : null;
    return (
      <Screen>
        <Muted testID="page-topic">{open.title}</Muted>
        <Title>{page.heading}</Title>
        <TopicSection section={{ ...page, heading: "" }} cards={cardsFor(page)} testID="page-section" />
        {/* The case before and the case after, so the six read as a set. */}
        <List>
          {prev ? (
            <Row testID="page-prev" onPress={() => navigation.replace("Grammar", { topic: open.id, section: prev.heading })}>
              <Text style={{ flex: 1, color: t.brandInk, fontSize: T.body, fontWeight: "700" }}>{`‹ ${prev.heading}`}</Text>
            </Row>
          ) : null}
          {next ? (
            <Row testID="page-next" onPress={() => navigation.replace("Grammar", { topic: open.id, section: next.heading })}>
              <Text style={{ flex: 1, color: t.brandInk, fontSize: T.body, fontWeight: "700", textAlign: "right" }}>{`${next.heading} ›`}</Text>
            </Row>
          ) : null}
          {k < 0 ? (
            <Row testID="page-topic-all" onPress={() => navigation.push("Grammar", { topic: open.id })}>
              <Text style={{ flex: 1, color: t.brandInk, fontSize: T.body, fontWeight: "700" }}>{`All of ${open.title}`}</Text>
            </Row>
          ) : null}
        </List>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{open.title}</Title>
      {first >= 0 ? (
        <View testID="asked-section" style={{ borderLeftWidth: 3, borderLeftColor: t.brand, paddingLeft: 12,
                                               marginBottom: 8 }}>
          <TopicSection section={open.sections[first]} cards={cardsFor(open.sections[first])}
                        testID={`section-${first}`} />
        </View>
      ) : null}
      {open.sections.map((s, k) => {
        if (k === first) return null;
        /* The pages, as one list where the first of them stands, each with
           its one-line rule under its name. */
        if (s.page) {
          if (s !== pages[0]) return null;
          return (
            <List key={k}>
              {pages.map((p) => (
                <Row key={p.heading} testID={`page-${p.heading}`} onPress={() => openPage(p.heading)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "700" }}>{p.heading}</Text>
                    <Muted numberOfLines={2}>{p.rule}</Muted>
                  </View>
                </Row>
              ))}
            </List>
          );
        }
        return <TopicSection key={k} section={s} cards={cardsFor(s)} testID={`section-${k}`} />;
      })}
      {/* Back to the list, in the list's own place rather than as a header
          control: this screen is two screens deep in one route, and the
          navigator's back arrow leaves Grammar altogether. */}
      <List>
        <Row testID="topics-back" onPress={toList}>
          <Text style={{ flex: 1, color: t.brandInk, fontSize: T.body, fontWeight: "700" }}>
            All topics
          </Text>
        </Row>
      </List>
    </Screen>
  );
}

/* Sounds — the writing system, and how to say it (ROADMAP P10.2).
 *
 * Four things, in the order they matter to a beginner: the vowel chart, because
 * a picture of where the mouth is beats a paragraph; the five vowel pairs,
 * because that one fact explains most of Russian spelling; the letters that look
 * Latin and are not, because they are what stops someone reading at all; then
 * the whole alphabet as a reference to come back to.
 *
 * Content lives in core/alphabet.js. This screen only draws it.
 */

import React from "react";
import { View, Pressable } from "react-native";
import Svg, { Line, Circle, Text as SvgText, Polygon } from "react-native-svg";
import { useTheme, radius } from "../theme";
import { Screen, List, Row, Card, Muted, SectionLabel, Speaker, Chip, Btn, Text } from "../ui";
import { LETTERS, VOWEL_PAIRS, VOWEL_CHART, TRAPS } from "@core/alphabet";

/* The vowel trapezoid: across is where the tongue sits, down is how far the jaw
   opens. Drawn rather than described — this is the chart the owner learned from. */
function VowelChart() {
  const t = useTheme();
  const W = 300, H = 210, pad = 34;
  const px = (x) => pad + x * (W - pad * 2);
  const py = (y) => pad * 0.6 + y * (H - pad * 1.4);
  // The axis words live outside the frame: at the top left "close" and the и
  // circle were landing on each other, so the viewBox is widened rather than the
  // vowels moved, which would have made the chart itself wrong.
  const gut = 46;
  return (
    <Card>
      <Svg width="100%" height={H + 26} viewBox={`${-gut} 0 ${W + gut} ${H + 26}`}>
        {/* The frame: narrower at the bottom, as the mouth's own space is. */}
        <Polygon
          points={`${px(0)},${py(0)} ${px(1)},${py(0)} ${px(0.82)},${py(1)} ${px(0.2)},${py(1)}`}
          fill={t.surface2} stroke={t.line} strokeWidth="1"
        />
        <SvgText x={px(0)} y={py(0) - 12} fontSize="10" fill={t.ink3}>front</SvgText>
        <SvgText x={px(1)} y={py(0) - 12} fontSize="10" fill={t.ink3} textAnchor="end">back</SvgText>
        <SvgText x={-gut + 4} y={py(0) + 4} fontSize="10" fill={t.ink3}>closed</SvgText>
        <SvgText x={-gut + 4} y={py(1) + 4} fontSize="10" fill={t.ink3}>open</SvgText>
        <Line x1={px(0.5)} y1={py(0)} x2={px(0.5)} y2={py(1)}
              stroke={t.lineSoft} strokeWidth="1" strokeDasharray="3 4" />
        {VOWEL_CHART.map((v) => (
          <React.Fragment key={v.v}>
            <Circle cx={px(v.x)} cy={py(v.y)} r="15" fill={t.brandBg} stroke={t.brand} strokeWidth="1.5" />
            <SvgText x={px(v.x)} y={py(v.y) + 6} fontSize="17" fontWeight="700"
                     fill={t.brandInk} textAnchor="middle">{v.v}</SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <Muted style={{ textAlign: "center" }}>
        Across is where the tongue sits. Down is how far the jaw drops.
      </Muted>
    </Card>
  );
}

export default function Sounds({ navigation }) {
  const t = useTheme();
  return (
    <Screen>
      {/* Practice, at the top, because the reference below it is what you come
          back to and this is what you came to do (ROADMAP P10.8). It lives here
          rather than as a twelfth row on Practice: a drill on the letters
          belongs with the letters (rule 20.8). */}
      <Btn kind="pri" testID="sound-drill" label="Practise these sounds"
           onPress={() => navigation.navigate("SoundDrill")} />
      {/* Word building used to be a second button here and nowhere else, which
          is how the owner came to be studying for a week without meeting it.
          It is a row under Practice → Speaking now, with the rest of the mouth
          work, and one home is all it gets (rule 20.8). */}
      <View style={{ marginBottom: 20 }} />

      <SectionLabel>The six vowel sounds</SectionLabel>
      <VowelChart />
      <List>
        {VOWEL_CHART.map((v) => (
          <Row key={v.v}>
            <Text style={{ color: t.ink, fontSize: 22, fontWeight: "700", width: 34 }}>{v.v}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>{v.like}</Text>
              <Muted>{v.ipa}</Muted>
            </View>
            <Speaker text={v.v} size={36} />
          </Row>
        ))}
      </List>

      {/* The one fact that explains most of Russian spelling. */}
      <SectionLabel style={{ marginTop: 22 }}>Five pairs, one sound each</SectionLabel>
      <Muted style={{ marginBottom: 10 }}>
        Each pair is the same vowel. The letter tells you whether the consonant
        before it is hard or soft, so you never have to guess.
      </Muted>
      <List>
        {VOWEL_PAIRS.map((p) => (
          <Row key={p.hard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: 76 }}>
              <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{p.hard}</Text>
              <Muted size={12}>hard</Muted>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: 74 }}>
              <Text style={{ color: t.brandInk, fontSize: 20, fontWeight: "700" }}>{p.soft}</Text>
              <Muted size={12}>soft</Muted>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>
                {`${p.example[0]} · ${p.example[1]}`}
              </Text>
              <Muted numberOfLines={1}>{`${p.gloss[0]} · ${p.gloss[1]}`}</Muted>
            </View>
          </Row>
        ))}
      </List>

      {/* What stops a beginner reading at all. */}
      <SectionLabel style={{ marginTop: 22 }}>Looks Latin, is not</SectionLabel>
      <List>
        {TRAPS.map((row) => (
          <Row key={row.l}>
            <Text style={{ color: t.bad, fontSize: 22, fontWeight: "700", width: 46 }}>
              {row.l.split(" ")[0]}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>{row.like}</Text>
              <Muted numberOfLines={2}>{row.note}</Muted>
            </View>
          </Row>
        ))}
      </List>

      <SectionLabel style={{ marginTop: 22 }}>{`All ${LETTERS.length} letters`}</SectionLabel>
      <List>
        {LETTERS.map((row) => (
          <Row key={row.l}>
            <Text style={{ color: row.trap ? t.bad : t.ink, fontSize: 20, fontWeight: "700",
                           width: 52 }}>
              {row.l}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>{row.like}</Text>
              {row.note ? <Muted numberOfLines={2}>{row.note}</Muted> : null}
            </View>
            <Muted size={12}>{row.ipa}</Muted>
          </Row>
        ))}
      </List>
    </Screen>
  );
}

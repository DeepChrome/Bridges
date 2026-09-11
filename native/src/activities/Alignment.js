/* What was said or typed against what was meant, one chip per word.
 *
 * Shared by the speech activities and the STT lab so a substitution looks the same
 * everywhere: green for a word that landed, red for a wrong or missing one, grey for
 * an extra. The shape comes straight from core/compare.js. */

import React from "react";
import { View } from "react-native";
import { Text } from "../ui";
import { useTheme, radius } from "../theme";

function Word({ a }) {
  const t = useTheme();
  const styles = {
    ok: { color: t.good, backgroundColor: t.goodBg },
    sub: { color: t.bad, backgroundColor: t.badBg },
    // A word that was not said: outlined rather than filled, so the gap reads as
    // a gap. No dash in front of it — the owner's rule for every verdict.
    del: { color: t.bad, backgroundColor: "transparent", borderWidth: 1,
           borderColor: t.bad, borderStyle: "dashed" },
    ins: { color: t.ink3, backgroundColor: t.surface2 },
  };
  const label = a.status === "ok" ? a.said
    : a.status === "sub" ? `${a.said} → ${a.expected}`
    : a.status === "del" ? a.expected
    : `+ ${a.said}`;
  const spoken = a.status === "ok" ? a.said
    : a.status === "sub" ? `${a.said}, should be ${a.expected}`
    : a.status === "del" ? `${a.expected}, not said`
    : `${a.said}, extra`;
  return (
    <Text
      testID={`align-${a.status}`}
      accessibilityLabel={spoken}
      style={[{ fontSize: 15, paddingVertical: 3, paddingHorizontal: 7,
                borderRadius: radius.sm, overflow: "hidden", marginRight: 6,
                marginBottom: 6 }, styles[a.status]]}
    >
      {label}
    </Text>
  );
}

export function Alignment({ alignment, style }) {
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap" }, style]}>
      {alignment.map((a, k) => <Word key={k} a={a} />)}
    </View>
  );
}

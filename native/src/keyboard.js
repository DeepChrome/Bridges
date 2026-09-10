/* An on-screen Russian keyboard for typed answers (the owner, 2026-09-07).
 *
 * A phone without a Russian layout installed can still answer in Cyrillic — the
 * activities transliterate Latin, but seeing the letters is how a learner learns
 * to type them. Off by default; the setting (You → Settings → Russian keyboard)
 * turns it on for every typed answer, and the key beside any input flips it for
 * the moment. When it is up the system keyboard stays down.
 *
 *   <RuInput value onChangeText onSubmit … />   a TextInput with the toggle
 *   <RuKeyboard onKey onBackspace onSubmit />   the keys alone
 */

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useSession } from "./session";
import { useTheme, radius } from "./theme";

/* The standard ЙЦУКЕН layout, as on every Russian phone. */
export const ROWS = ["йцукенгшщзхъ", "фывапролджэё", "ячсмитьбю"];

/* Rule 20.12's minimum, and it applies to a key as much as to a button — the
   keys were 42 (ROADMAP P11.9). Height is the axis that is ours to set: the
   widest row is twelve keys, so at the 390 px design width each is about 27 px
   across and 44 would need a 528 px screen. Every phone keyboard makes the same
   trade, and a key still clears WCAG 2.5.8's 24 px in both axes. `flex` shares
   whatever width there is, so raising this cannot push a row off the screen. */
export const KEY_H = 44;
const KEY_GAP = 1.5;      // each side, so a row of n keys spends 2·n·KEY_GAP

function Key({ label, onPress, wide, tone, testID, children }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: wide || 1, height: KEY_H, marginHorizontal: KEY_GAP, borderRadius: 7,
        alignItems: "center", justifyContent: "center",
        backgroundColor: pressed ? t.surface3 : tone === "brand" ? t.brandBg : t.surface,
        borderWidth: 1, borderColor: tone === "brand" ? t.brand : t.line,
      })}
    >
      {children || <Text style={{ color: t.ink, fontSize: 18 }}>{label}</Text>}
    </Pressable>
  );
}

export function RuKeyboard({ onKey, onBackspace, onSubmit }) {
  const t = useTheme();
  return (
    <View testID="ru-keyboard" style={{ marginTop: 10, gap: 5 }}>
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {r === 2 ? <View style={{ flex: 0.5 }} /> : null}
          {row.split("").map((ch) => (
            <Key key={ch} label={ch} onPress={() => onKey(ch)} />
          ))}
          {r === 2 ? (
            <Key label="Backspace" wide={1.5} onPress={onBackspace} testID="key-backspace">
              <Svg width={22} height={18} viewBox="0 0 24 20" fill="none" stroke={t.ink}
                   strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M8 3h13v14H8l-6-7zM12 7l6 6M18 7l-6 6" />
              </Svg>
            </Key>
          ) : null}
        </View>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Key label="Space" wide={5} onPress={() => onKey(" ")} testID="key-space">
          <Text style={{ color: t.ink3, fontSize: 13 }}>пробел</Text>
        </Key>
        {onSubmit ? (
          <Key label="Check" wide={2} tone="brand" onPress={onSubmit} testID="key-submit">
            <Text style={{ color: t.brandInk, fontSize: 15, fontWeight: "600" }}>✓</Text>
          </Key>
        ) : null}
      </View>
    </View>
  );
}

/* The keyboard toggle: a small keyboard glyph, lit while the keys are up. */
function Toggle({ on, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button"
               accessibilityLabel={on ? "Hide the Russian keyboard" : "Show the Russian keyboard"}
               accessibilityState={{ selected: on }} testID="osk-toggle"
               style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none"
           stroke={on ? t.brandInk : t.ink3} strokeWidth={1.8} strokeLinecap="round">
        <Rect x="3" y="6" width="18" height="12" rx="2" />
        <Path d="M7 10h1M11 10h1M15 10h1M7 14h10" />
      </Svg>
    </Pressable>
  );
}

export function RuInput({ value, onChangeText, onSubmit, editable = true, style, testID,
                          placeholder = "Cyrillic or Latin", autoFocus }) {
  const { st } = useSession();
  const t = useTheme();
  const [show, setShow] = useState(!!st.osk);
  // The setting arrives with the profile, after the first render.
  useEffect(() => { setShow(!!st.osk); }, [st.osk]);
  const keys = show && editable;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={t.ink3}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          showSoftInputOnFocus={!keys}
          onSubmitEditing={onSubmit}
          style={[{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                    borderBottomWidth: 3, borderRadius: radius.md, paddingHorizontal: 14,
                    paddingVertical: 13, fontSize: 20, color: t.ink }, style]}
        />
        {editable ? <Toggle on={keys} onPress={() => setShow(!show)} /> : null}
      </View>
      {keys ? (
        <RuKeyboard
          onKey={(ch) => onChangeText((value || "") + ch)}
          onBackspace={() => onChangeText((value || "").slice(0, -1))}
          onSubmit={onSubmit}
        />
      ) : null}
    </View>
  );
}

/* Shared UI primitives, matching the web app's visual language.
 *
 * The web app leans on CSS classes; here the same shapes are components so the
 * spacing, radii and colours stay in one place instead of being retyped per screen.
 */

import React, { useEffect, useState } from "react";
import {
  View, Pressable, ScrollView, ActivityIndicator, StyleSheet, Modal, Animated,
} from "react-native";
/* Renamed on the way in: the app's own `Text` and `TextInput` are defined below
   and are what everything else imports (font.test.js). */
import { Text as RNText, TextInput as RNTextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";
import { iconFor } from "@core/icons";
import { AV, AV_IDS } from "@core/avatars";
import { useTheme, radius, space, faceFor, useShadow } from "./theme";
import { useFill, usePress, useEnter } from "./motion";
import { say, hasRealAudio, hasRussianVoice, probeVoices, onVoicesChanged, onAudioFailure } from "./audio";

/* The app's `Text`, and the only one anything may import.
 *
 * React Native has no global font: a `Text` that names a size and not a family
 * silently falls back to the system one, and two typefaces on a screen read as a
 * bug rather than as a choice. So every piece of text in the app comes through
 * here, `font.test.js` asserts that nothing imports `Text` from react-native,
 * and the typeface is set in exactly one place.
 *
 * It also turns a weight into a **face**. Android does not synthesise weights
 * for a named family — `fontWeight: "700"` on the regular file is ignored and
 * the text comes out light while the code says bold — so the weight asked for
 * picks the file that has it. A caller writes `fontWeight` as it always did.
 *
 * `flatten` because a style may be an array, and the weight can be in any of
 * its entries. */
export function Text({ style, children, ...rest }) {
  const flat = StyleSheet.flatten(style) || {};
  return (
    <RNText {...rest} style={[style, { fontFamily: faceFor(flat.fontWeight) }]}>
      {children}
    </RNText>
  );
}

/* Typed answers are text too, and a Cyrillic keyboard's output in Roboto beside
   Nunito everywhere else was the most visible half of the old mix. */
export function TextInput({ style, ...rest }) {
  const flat = StyleSheet.flatten(style) || {};
  return <RNTextInput {...rest} style={[style, { fontFamily: faceFor(flat.fontWeight) }]} />;
}

/* `fill` makes the content container grow to the height of the screen, which is what
   lets a step's primary action sit at the foot of it with marginTop:"auto" instead of
   floating wherever the card happens to end. Opt-in per screen: a list does not want
   its last row shoved to the bottom. */
export function Screen({ children, scroll = true, fill = false }) {
  const t = useTheme();
  const Body = scroll ? ScrollView : View;
  /* Every screen's content arrives rather than appearing. The stack already
     slides the screen in (App.js `withMe`); this is the half-step *inside* it
     that makes the arrival read as one movement instead of a slide followed by
     a snap. Content only — the ground does not move, or the whole app swims.
     Reduced motion is the end state, and under test it lands on the first frame
     (§30n′), so nothing has to settle before it can be pressed or found. */
  const enter = useEnter();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Animated.View style={[{ flex: 1 }, enter]}>
      <Body
        testID="screen-body"
        style={{ flex: 1 }}
        contentContainerStyle={scroll
          ? { padding: space.pad, paddingBottom: 40, ...(fill ? { flexGrow: 1 } : null) }
          : null}
        // With the keyboard up, a ScrollView's default is to spend the first touch
        // dismissing it and deliver nothing. Every typed answer's Check, the gate's
        // Continue and a tapped search result needed two presses; found on the
        // emulator walkthrough. "handled" lets the button take the press.
        {...(scroll ? { keyboardShouldPersistTaps: "handled" } : null)}
      >
        {children}
      </Body>
      </Animated.View>
    </SafeAreaView>
  );
}

export function Title({ children, sub }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "700",
                     letterSpacing: -0.4 }}>{children}</Text>
      {sub ? <Text style={{ color: t.ink3, fontSize: 14, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

/* `testID` is forwarded deliberately: a wrapper that quietly drops the prop it
   was given has now cost time on Row, Btn and Muted (see the note in §23 about
   props that vanish), and a test then fails on a thing that is plainly drawn. */
export function Card({ children, style, testID }) {
  const t = useTheme();
  const raised = useShadow();
  return (
    <View testID={testID}
          style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                    borderRadius: radius.lg, padding: 16 }, raised, style]}>
      {children}
    </View>
  );
}

/* Where the hairlines go is the List's business, not each row's.
 *
 * Every call site used to work it out for itself — `last={k === xs.length - 1}`,
 * or a bare `last` on whichever row happened to be written down last — and the
 * moment a row is inserted *after* the one carrying it, the group loses a
 * hairline in its middle and nothing fails. That is exactly what happened to
 * Settings when "Show the tour" landed under "Right-answer sound", both rows
 * then claiming `last={!st.dev}` (ROADMAP P11.9).
 *
 * The List already knows which of its children renders last, so it says so.
 * `Children.toArray` drops the ones that rendered nothing, which is why a
 * trailing `{cond ? <Row/> : null}` no longer needs the row above it to
 * second-guess the condition. A row nested inside a wrapper is out of reach and
 * keeps its own `last`, as before. */
export function List({ children }) {
  const t = useTheme();
  const raised = useShadow();
  const rows = React.Children.toArray(children);
  return (
    <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                    borderRadius: radius.lg, overflow: "hidden" }, raised]}>
      {rows.map((row, k) => (
        React.isValidElement(row)
          ? React.cloneElement(row, { last: k === rows.length - 1 })
          : row
      ))}
    </View>
  );
}

export function Row({ children, onPress, disabled, last, testID }) {
  const t = useTheme();
  /* A row presses less than a button does: it sits in a group, and a row that
     shrinks as much as a standalone control makes the whole list look loose. */
  const press = usePress({ to: 0.985 });
  const live = !disabled && !!onPress;
  /* The scale lives on a wrapper, not on the Pressable. Making the Pressable
     itself animated hid its resolved style from the render tree, and §20a says
     a native visual contract is held there — three tests that read a hairline
     and a fill colour went blind in the same commit that added the animation. */
  return (
    <Animated.View style={live ? press.style : null}>
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        onPressIn={live ? press.onPressIn : undefined}
        onPressOut={live ? press.onPressOut : undefined}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingVertical: 13, paddingHorizontal: 15,
          borderBottomWidth: last ? 0 : 1, borderBottomColor: t.lineSoft,
          backgroundColor: pressed && !disabled ? t.surface2 : "transparent",
          opacity: disabled ? 0.5 : 1,
          minHeight: 56,
        })}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function Btn({ label, onPress, kind = "plain", disabled, style, testID }) {
  const t = useTheme();
  const tone = {
    plain: { bg: t.surface, border: t.line, fg: t.ink },
    pri: { bg: t.brand, border: t.brandDim, fg: t.brandOn },
    good: { bg: t.good, border: t.goodDim, fg: t.goodOn },
    bad: { bg: t.bad, border: t.badDim, fg: t.badOn },
    ghost: { bg: "transparent", border: "transparent", fg: t.ink2 },
  }[kind];
  /* The three-pixel bottom border is the button's weight; pressing takes it to
     one and drops the button by two, which is the shape of something being
     pushed down. That part was already right — what was missing is that it
     happened in one frame. The scale spring is what makes it read as physical
     rather than as a redraw. */
  const press = usePress();
  /* A disabled button stops looking like the button it is. Fading a filled
     primary to 45 % still reads as a filled primary with pale text — on the
     way-in screen (§30p) the Continue looked live until you pressed it. A
     disabled control takes the neutral tone whatever kind it was asked for,
     which is the difference between "not yet" and "broken". */
  const shown = disabled ? { bg: t.surface2, border: t.line, fg: t.ink3 } : tone;
  /* The caller's `style` is always layout — a margin, or `flex: 1` in a row of
     two buttons — so it goes on the wrapper with the transform, and the
     Pressable keeps only what it looks like. That split is also what keeps the
     button's own style readable in the render tree (§20a). */
  /* The one control that is the point of the screen sits above it. Only `pri`,
     and only when it is live: a shadow under a button nobody may press says the
     opposite of what it is for. */
  const lift = useShadow("lift");
  return (
    <Animated.View style={[style, disabled ? null : press.style,
                           kind === "pri" && !disabled ? lift : null]}>
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : press.onPressIn}
        onPressOut={disabled ? undefined : press.onPressOut}
        style={({ pressed }) => ({
          backgroundColor: shown.bg, borderColor: shown.border,
          borderWidth: 1, borderBottomWidth: pressed || disabled ? 1 : 3,
          marginBottom: pressed || disabled ? 2 : 0,
          borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 18,
          alignItems: "center", minHeight: 48,
          justifyContent: "center",
        })}
      >
        <Text style={{ color: shown.fg, fontWeight: "600", fontSize: 15 }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* A bottom sheet — the one shape for a word's summary, a question's table, the
   Study picker and Settings, which each used to carry the same backdrop, handle
   and radius in their own words (P9.16). A press on the backdrop closes it;
   `title` (a string) or `header` (a node) sits above the scrolling body and
   `footer` below it, off the scroll, so the sheet's action never scrolls away. */
export function Sheet({ visible = true, onClose, title, header, children, footer,
                        maxHeight = "85%", testID }) {
  const t = useTheme();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
      >
        {/* The sheet itself swallows the press, so only the backdrop closes. */}
        <Pressable
          onPress={() => {}}
          testID={testID}
          style={{ backgroundColor: t.bg, borderTopLeftRadius: radius.lg,
                   borderTopRightRadius: radius.lg, padding: 16, paddingBottom: 22, maxHeight }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.line,
                         alignSelf: "center", marginBottom: 14 }} />
          {header ? header : title ? (
            <Text style={{ color: t.ink, fontSize: 17, fontWeight: "600", marginBottom: 14 }}>
              {title}
            </Text>
          ) : null}
          <ScrollView>{children}</ScrollView>
          {footer || null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* A section's heading: one style, used everywhere a screen groups things
   under a label (it was retyped inline two dozen times). */
export function SectionLabel({ children, style, testID }) {
  const t = useTheme();
  return (
    <Text testID={testID} style={[styles.sectionLabel, { color: t.ink3 }, style]}>{children}</Text>
  );
}

/* A chip in a row of choices, lit when chosen. One size for every screen, and
   that size is a thumb's: three screens had their own at 34, 36 and 40 px. */
export function Chip({ on, label, onPress, testID }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button"
               accessibilityState={{ selected: !!on }}
               style={{ borderWidth: 1, borderColor: on ? t.brand : t.line,
                        backgroundColor: on ? t.brandBg : t.surface, borderRadius: 99,
                        paddingHorizontal: 14, paddingVertical: 10, minHeight: 44,
                        justifyContent: "center" }}>
      <Text style={{ color: on ? t.brandInk : t.ink2, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/* A row of chips, one lit. */
export function Choice({ options, value, onPick, testID, style }) {
  return (
    <View testID={testID} style={[{ flexDirection: "row", flexWrap: "wrap", gap: 6 }, style]}>
      {options.map((o) => (
        <Chip key={o.id} on={o.id === value} label={o.name} onPress={() => onPick(o.id)} />
      ))}
    </View>
  );
}

/* A search box with a way to clear it on every platform — TextInput's own clear
   button is iOS-only. */
export function SearchField({ value, onChangeText, placeholder, label, testID, style, autoFocus }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel={label}
        style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
                 paddingRight: value ? 44 : 14, fontSize: 16, color: t.ink }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button"
                   accessibilityLabel="Clear" testID={testID ? testID + "-clear" : undefined}
                   style={{ position: "absolute", right: 6, width: 36, height: 36, borderRadius: 18,
                            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* Done, drawn one way: a green disc with a tick. */
export function Tick({ on, size = 26 }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2,
                   borderColor: on ? t.good : t.line,
                   backgroundColor: on ? t.goodBg : "transparent",
                   alignItems: "center", justifyContent: "center" }}>
      {on ? (
        <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={t.good}
             strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m5 13 4 4 10-10" />
        </Svg>
      ) : null}
    </View>
  );
}

export function Pill({ children, tone }) {
  const t = useTheme();
  const c = tone === "good" ? { bg: t.goodBg, fg: t.good }
          : tone === "brand" ? { bg: t.brandBg, fg: t.brandInk }
          : { bg: t.surface2, fg: t.ink2 };
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 99,
                   paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

/* `animate` fills to the new value rather than jumping to it — pass it wherever
   the bar tracks discrete steps, which is the only place the movement means
   anything. It is opt-in because the video passage drives its bar from a
   position poll four times a second (Passage.js), and a 380 ms ease on top of
   that would lag behind the video instead of following it. */
export function Bar({ value, animate = false }) {
  const t = useTheme();
  const width = useFill(Math.min(1, Math.max(0, value || 0)));
  const fill = { height: "100%", backgroundColor: t.good };
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2,
                   borderWidth: 1, borderColor: t.lineSoft, overflow: "hidden" }}>
      {animate
        ? <Animated.View style={[fill, { width }]} />
        : <View style={[fill, { width: `${Math.round(value * 100)}%` }]} />}
    </View>
  );
}

/* The same icon paths the web app draws, rendered through react-native-svg. */
export function UnitIcon({ id, size = 22, color }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color || t.ink3} strokeWidth={1.6}
         strokeLinecap="round" strokeLinejoin="round">
      <Path d={iconFor(id)} />
    </Svg>
  );
}

export function Thumb({ id, done, locked, n }) {
  const t = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center",
                   justifyContent: "center",
                   backgroundColor: done ? t.goodBg : t.surface2,
                   borderWidth: done ? 2 : 0, borderColor: t.good }}>
      {locked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink3}
             strokeWidth={1.8}>
          <Path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
      ) : (
        <UnitIcon id={id} color={done ? t.good : t.ink3} />
      )}
      {n !== undefined ? (
        <View style={{ position: "absolute", right: -3, bottom: -3, minWidth: 17,
                       height: 17, borderRadius: 9, backgroundColor: t.surface,
                       borderWidth: 1, borderColor: t.line, alignItems: "center",
                       justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: t.ink2 }}>{n}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* The same ten characters the web app draws, from the same source. SvgXml renders the
   shared markup directly rather than each platform keeping its own copy of the art. */
export function Avatar({ id, size = 44 }) {
  const a = AV[id] || AV[AV_IDS[0]];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
                   backgroundColor: a.bg, overflow: "hidden" }}>
      <SvgXml
        width={size}
        height={size}
        xml={`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${a.svg}</svg>`}
      />
    </View>
  );
}

export { AV, AV_IDS };

/* A speaker that stays live when the collection has a real recording, whether or not
   the device has a Russian voice. */
/* A recording plays whatever the device can do. Without one, the button is live only
   if the device really can speak Russian — otherwise it would substitute another
   language, and offering a control that produces wrong audio is worse than offering
   none. Same rule as the web app. `disabled` is withheld from Pressable deliberately
   (see Btn): passing it makes React 19 tests drop presses. */
export function Speaker({ text, size = 40 }) {
  const t = useTheme();
  const real = hasRealAudio(text);
  const [voice, setVoice] = useState(hasRussianVoice());
  // A stream that failed with no voice to fall back on: the button says so
  // for a few seconds instead of doing nothing (audio.js onAudioFailure).
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer = null;
    probeVoices().then(() => { if (alive) setVoice(hasRussianVoice()); });
    const off = onVoicesChanged(() => { if (alive) setVoice(hasRussianVoice()); });
    const offFail = onAudioFailure((what) => {
      if (!alive || what !== text) return;
      setDown(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (alive) setDown(false); }, 4000);
    });
    return () => { alive = false; off(); offFail(); if (timer) clearTimeout(timer); };
  }, [text]);

  const live = real || voice;
  return (
    <View style={{ alignItems: "center" }}>
    <Pressable
      testID={real ? "speaker-real" : live ? "speaker-tts" : "speaker-silent"}
      accessibilityRole="button"
      accessibilityState={{ disabled: !live }}
      accessibilityLabel={real ? "Hear it"
        : live ? "Hear it (device voice)"
        : "No recording, and this device has no Russian voice"}
      onPress={live ? () => say(text) : undefined}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, borderWidth: 1,
        borderColor: real ? t.brand : t.line, alignItems: "center",
        justifyContent: "center",
        opacity: !live ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
           stroke={real ? t.brandInk : t.ink3} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11 5 6 9H3v6h3l5 4z" />
        <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </Svg>
    </Pressable>
    {down ? (
      <Text testID="speaker-down" style={{ color: t.ink3, fontSize: 10, marginTop: 2 }}>No audio right now</Text>
    ) : null}
    </View>
  );
}

/* A gloss laid out as a dictionary would: the sense groups OpenRussian separates
   with semicolons as numbered lines, each with its synonyms — «стол» is
   "1. table, desk, board  2. diet, cooking, cuisine  3. department, section",
   not one run of nine words. One group stays a single line, unnumbered. */
export function senseGroups(e) {
  return String(e || "").split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
}

/* `max` caps the list and says how many were left. A dictionary entry wants all
   of them; a teaching card does not — «в» is glossed "in; at; into; to; for; on;
   within", which is seven near-synonyms rather than seven senses, and numbering
   them down a vocabulary card turned a preposition into a wall of text. The
   entry is where the rest live, and the count says plainly that there are more
   rather than quietly dropping them. */
/* A dictionary entry's senses: numbered, labelled, with an example under the
 * ones that have one (§30q).
 *
 * `senses` is `[{ g, t?, x? }]` — gloss, labels, examples — from Wiktionary, and
 * is what the app shows whenever it has it. `Senses` below stays for the words
 * it does not cover (2% of the curriculum) and for a deck card, where all there
 * is is a translation.
 *
 * Left-aligned always. A numbered list centred on the screen is not a list, and
 * that is how the glosses used to read on a card.
 */
export function SenseList({ senses, size = 15, style, max, testID }) {
  const t = useTheme();
  if (!senses || !senses.length) return null;
  const shown = max && senses.length > max ? senses.slice(0, max) : senses;
  const rest = senses.length - shown.length;
  const many = senses.length > 1;
  return (
    <View testID={testID || "sense-list"} style={[{ alignSelf: "stretch", gap: 10 }, style]}>
      {shown.map((s, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 8 }}>
          {many ? (
            <Text style={{ color: t.ink3, fontSize: size, fontWeight: "700",
                           minWidth: 16, lineHeight: size + 6 }}>
              {k + 1}
            </Text>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink2, fontSize: size, lineHeight: size + 6 }}>
              {/* The labels read as part of the sentence, in italics, the way a
                  dictionary sets them — not as chips, which would make every
                  entry a row of badges (§25). */}
              {s.t && s.t.length ? (
                <Text style={{ color: t.ink3, fontStyle: "italic" }}>{s.t.join(", ") + " "}</Text>
              ) : null}
              {s.g}
            </Text>
            {(s.x || []).map((x, n) => (
              <View key={n} style={{ marginTop: 5, paddingLeft: 10, borderLeftWidth: 2,
                                     borderLeftColor: t.lineSoft }}>
                <Text style={{ color: t.ink, fontSize: size - 1 }}>{x.ru}</Text>
                <Text style={{ color: t.ink3, fontSize: size - 2 }}>{x.en}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {rest ? (
        <Text testID="senses-more" style={{ color: t.ink3, fontSize: size - 2 }}>
          {`+${rest} more`}
        </Text>
      ) : null}
    </View>
  );
}

export function Senses({ e, size = 15, align = "center", style, max }) {
  const t = useTheme();
  const groups = senseGroups(e);
  if (!groups.length) return null;
  const shown = max && groups.length > max ? groups.slice(0, max) : groups;
  const rest = groups.length - shown.length;
  return (
    <View testID="senses" style={[{ marginTop: 10, alignSelf: "stretch", gap: 3 }, style]}>
      {shown.map((g, k) => (
        <Text key={k} style={{ color: t.ink2, fontSize: size, textAlign: align, lineHeight: size + 6 }}>
          {groups.length > 1 ? `${k + 1}. ${g}` : g}
        </Text>
      ))}
      {rest ? (
        <Text testID="senses-more"
              style={{ color: t.ink3, fontSize: size - 2, textAlign: align, marginTop: 1 }}>
          {`+${rest} more`}
        </Text>
      ) : null}
    </View>
  );
}

/* `numberOfLines` is passed through deliberately: seven call sites hand it over
   to clamp a long caption or title, and dropping it (as this did) let a mined
   caption run to five lines on a flashcard. Same class as the testID drops. */
export function Muted({ children, size = 13, style, testID, numberOfLines }) {
  const t = useTheme();
  return (
    <Text testID={testID} numberOfLines={numberOfLines}
          style={[{ color: t.ink3, fontSize: size }, style]}>
      {children}
    </Text>
  );
}

/* A header that says where you are: what this screen is, and what it belongs to.
   "Lesson 3" over "Around Town" beats a bar that just reads "Lesson" — the same
   generic-naming problem as the units had, one level up. */
export function HeaderTitle({ title, sub }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text numberOfLines={1}
            style={{ color: t.ink, fontSize: 16, fontWeight: "700",
                     letterSpacing: -0.2 }}>
        {title}
      </Text>
      {sub ? (
        <Text numberOfLines={1}
              style={{ color: t.ink3, fontSize: 10, fontWeight: "700",
                       letterSpacing: 0.9, textTransform: "uppercase", marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                   backgroundColor: t.bg }}>
      <ActivityIndicator color={t.brand} />
    </View>
  );
}

export const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1,
                  textTransform: "uppercase", marginBottom: 9, marginLeft: 2 },
});

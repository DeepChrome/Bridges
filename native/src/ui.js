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
import Svg, { Path, SvgXml, Circle } from "react-native-svg";
import { iconFor } from "@core/icons";
import { AV, AV_IDS, avatarOf } from "@core/avatars";
import { useTheme, radius, space, type, faceFor, useShadow } from "./theme";
import { useFill, usePress, useEnter } from "./motion";
import { say, warm, hasRealAudio, hasRussianVoice, probeVoices, onVoicesChanged, onAudioFailure } from "./audio";
import { MicButton } from "./mic";

/* How deep a control's edge is, and how far it travels when pressed. One
   number, so a quiz answer and the primary button are pressed by the same
   amount. */
export const LIP = 4;

/* A control that is pressed *into its own edge*.
 *
 * Every pressable in the app already had an edge — a thicker bottom border that
 * thinned on press — and it read as flat anyway, because **the control never
 * moved**. Thinning a border changes the box; it does not look like something
 * being pushed. The owner, 2026-09-17, after a pass that only recoloured
 * things: *"I don't see any differences in the UI feel."*
 *
 * The model that works is the one the path discs already used: a container of
 * fixed height painted in the edge colour, with the face sliding down into it.
 * Height never changes, so nothing below reflows — which is the reason the
 * naive version (shrink the border, translate the view) cannot be used in a
 * flex column.
 *
 * `edge` is a darker tint of the face, never a blur: the depth here is physical.
 * The caller owns layout, so `style` goes on the container and the face keeps
 * only what it looks like — the same split `Btn` makes, and what keeps a
 * control's own style readable in the render tree (§20a). */
export function Lift({ children, edge, fill, border, r = radius.md, style, flat,
                      onPress, disabled, testID, label, hint, role = "button", state }) {
  const live = !disabled && !!onPress;
  return (
    <View style={[{ backgroundColor: flat ? "transparent" : edge, borderRadius: r,
                    paddingBottom: flat ? 0 : LIP }, style]}>
      <Pressable
        testID={testID}
        onPress={live ? onPress : undefined}
        accessibilityRole={role}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={state}
        style={({ pressed }) => ({
          backgroundColor: fill,
          borderColor: border === undefined ? edge : border,
          borderWidth: flat ? 0 : 2,
          borderRadius: r,
          transform: [{ translateY: pressed && live && !flat ? LIP : 0 }],
        })}
      >
        {children}
      </Pressable>
    </View>
  );
}

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
/* `safeTop` keeps the status-bar inset. Only the gate wants it: every other
   screen sits under a navigation header that has already taken that space, and
   taking it a second time put an empty band the height of the status bar at the
   top of every screen in the app — about 48 px of nothing under every header,
   which is most of why the screens read as floating. */
/* `footer` pins a screen's action to the bottom, off the scroll.
 *
 * `fill` puts it at the foot of the *content*, which is right when the content
 * is shorter than the screen and wrong when it is longer: the quiz builder's
 * Start sat under thirty-four chapters of unit chips, so the one thing the
 * screen is for could only be reached by scrolling past everything it offers.
 *
 * For a screen that keeps the tab bar — which is every screen long enough to
 * want this, since a run has no tab bar and its action already sits at the foot
 * via `fill`. A run that wants a pinned footer would need to add the bottom
 * safe-area inset itself; nothing does yet, and guessing at it here is how the
 * inset came to be applied twice in the first place. */
/* The three together (screen.test.js renders all eight combinations):
 *
 *   prop     | on                                    | off
 *   ---------|---------------------------------------|---------------------------
 *   fill     | content container grows to the screen | content is as tall as it is
 *   safeTop  | the status-bar inset is taken here    | a header above took it
 *   footer   | a bar off the scroll, hairline above, | nothing; scroll padding 40
 *            | scroll padding 24 to clear it         |
 */
export function Screen({ children, scroll = true, fill = false, safeTop = false, footer }) {
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
    <SafeAreaView testID="screen-root" edges={safeTop ? ["top"] : []}
                  style={{ flex: 1, backgroundColor: t.bg }}>
      <Animated.View style={[{ flex: 1 }, enter]}>
      <Body
        testID="screen-body"
        style={{ flex: 1 }}
        contentContainerStyle={scroll
          // Clear of the footer, so the last row is not sitting under it.
          ? { padding: space.pad, paddingBottom: footer ? 24 : 40,
              ...(fill ? { flexGrow: 1 } : null) }
          : null}
        // With the keyboard up, a ScrollView's default is to spend the first touch
        // dismissing it and deliver nothing. Every typed answer's Check, the gate's
        // Continue and a tapped search result needed two presses; found on the
        // emulator walkthrough. "handled" lets the button take the press.
        {...(scroll ? { keyboardShouldPersistTaps: "handled" } : null)}
      >
        {children}
      </Body>
      {footer ? (
        <View testID="screen-footer"
              style={{ borderTopWidth: 1, borderTopColor: t.line,
                       backgroundColor: t.bg,
                       paddingHorizontal: space.pad, paddingTop: 10, paddingBottom: 12 }}>
          {footer}
        </View>
      ) : null}
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
          // `at` staggers the arrival; the row decides what to do with it.
          ? React.cloneElement(row, { last: k === rows.length - 1, at: k })
          : row
      ))}
    </View>
  );
}

export function Row({ children, onPress, disabled, last, testID, at = 0 }) {
  const t = useTheme();
  /* A row presses less than a button does: it sits in a group, and a row that
     shrinks as much as a standalone control makes the whole list look loose. */
  const press = usePress({ to: 0.985 });
  const live = !disabled && !!onPress;
  /* Rows arrive one after another rather than all at once — a short stagger
     inside the screen's own arrival, so a list reads as filling in rather than
     as a block that was already there. Capped at six: beyond that the last rows
     would still be moving after the learner had started reading the first, and
     a stagger that outlasts attention is decoration (§25). Six pixels, not ten,
     because the screen is already rising underneath it. */
  const enter = useEnter([], { delay: Math.min(at, 5) * 35, distance: 6 });
  /* The scale lives on a wrapper, not on the Pressable. Making the Pressable
     itself animated hid its resolved style from the render tree, and §20a says
     a native visual contract is held there — three tests that read a hairline
     and a fill colour went blind in the same commit that added the animation. */
  /* Both transforms in one list, not two styles in an array. A style array
     merges by property, so `transform` from the second would have replaced the
     first outright: the rows would have faded in without moving, and every test
     here would still have passed. */
  const arriving = live
    ? { opacity: enter.opacity, transform: enter.transform.concat(press.style.transform) }
    : enter;
  return (
    <Animated.View style={arriving}>
      <Pressable
        testID={testID}
        /* A row that does something is a button and has to say so. Without a
           role a screen reader reads the text inside and gives no hint that
           it can be activated — the control is invisible to exactly the
           person who most needs telling. A row with no `onPress` is not a
           button and must not claim to be. */
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityState={onPress ? { disabled: !!disabled } : undefined}
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
    /* Tinted, not white. A plain button used to carry the surface colour, the
       line colour and the card radius — which is a card, and on the unit screen
       "Test out of this section" read as an empty panel somebody had forgotten
       to fill in. A control has to differ from a container somewhere, and the
       cheapest place is its fill. */
    plain: { bg: t.surface2, border: t.line, fg: t.ink },
    pri: { bg: t.brand, border: t.brandDim, fg: t.brandOn },
    good: { bg: t.good, border: t.goodDim, fg: t.goodOn },
    bad: { bg: t.bad, border: t.badDim, fg: t.badOn },
    ghost: { bg: "transparent", border: "transparent", fg: t.ink2 },
    /* A ghost that has nothing around it to say it is a control.
     *
       A `ghost` reads as a control because of where it sits — beside a row's
       text, in a sheet's footer — and the grey is deliberate restraint. On its
       own in the middle of a screen that context is gone, and it reads as a
       caption: "Show the table · counts as a hint" sat above the answer box on
       every written drill looking exactly like an instruction, so the one hint
       the runner offers was invisible. Colour is the cheapest thing that says
       "press me" without giving it a box back. */
    link: { bg: "transparent", border: "transparent", fg: t.brandInk },
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
  /* …except a ghost, which has no box to keep. Giving it the neutral fill drew
     a grey panel where there had been bare text, so "◀ Previous" on the first
     card of Study sat in a box beside a boxless "Skip ▶" — a pair of controls
     that stopped looking like a pair the moment one of them was unavailable. */
  const shown = disabled
    ? (kind === "ghost" ? { ...tone, fg: t.ink3 } : { bg: t.surface2, border: t.line, fg: t.ink3 })
    : tone;
  /* The caller's `style` is always layout — a margin, or `flex: 1` in a row of
     two buttons — so it goes on the wrapper with the transform, and the
     Pressable keeps only what it looks like. That split is also what keeps the
     button's own style readable in the render tree (§20a). */
  /* The one control that is the point of the screen sits above it. Only `pri`,
     and only when it is live: a shadow under a button nobody may press says the
     opposite of what it is for. */
  const lift = useShadow("lift");
  /* A ghost and a link have no box, so they have no edge to be pressed into;
     they keep the scale alone. Everything with a fill goes through `Lift` and
     actually travels — the border used to thin from 3 to 1, which changes the
     shape of a button without ever looking like one being pushed. */
  const flat = kind === "ghost" || kind === "link";
  /* `edge` is a darker tint of the fill, which is what makes the depth read as
     the control's own rather than as a grey line under it. `plain` and every
     disabled control take the neutral line, since their fill is already a
     neutral. */
  const edge = disabled ? t.line
    : kind === "pri" ? t.brandDim
    : kind === "good" ? t.goodDim
    : kind === "bad" ? t.badDim
    : t.line;
  return (
    <Animated.View style={[style, disabled ? null : press.style,
                           kind === "pri" && !disabled ? lift : null]}>
      <Lift
        testID={testID}
        flat={flat}
        edge={edge}
        fill={shown.bg}
        border={shown.border}
        r={radius.md}
        disabled={disabled}
        onPress={onPress}
        /* The label is read off the text inside, so it is deliberately not
           repeated as an `accessibilityLabel` — one there would *replace*
           what the button says rather than add to it. What was missing is the
           role and the state: a control that looks greyed out has to announce
           that it is, and a reader that cannot tell a button from a caption
           cannot use the app at all. */
        state={{ disabled: !!disabled }}
      >
        <View style={{ paddingVertical: 13, paddingHorizontal: 18,
                       alignItems: "center", minHeight: 48,
                       justifyContent: "center" }}>
          {/* 700, not 600. The reference sets button labels heavy and it is the
              cheapest weight a control can carry to stop reading as a caption. */}
          <Text style={{ color: shown.fg, fontWeight: "700", fontSize: 15 }}>{label}</Text>
        </View>
      </Lift>
    </Animated.View>
  );
}

/* A bottom sheet — the one shape for a word's summary, a question's table, the
   Study picker and Settings, which each used to carry the same backdrop, handle
   and radius in their own words (P9.16). A press on the backdrop closes it;
   `title` (a string) or `header` (a node) sits above the scrolling body and
   `footer` below it, off the scroll, so the sheet's action never scrolls away.

   **The backdrop is a sibling behind the sheet, not a parent around it.** It
   used to be a Pressable wrapping the sheet, with a second, do-nothing
   Pressable as the sheet itself to stop taps reaching the backdrop. A
   Pressable claims the touch responder the moment a finger lands on it, so
   every swipe that began on the sheet's content was taken by that
   press-swallower and never reached the ScrollView — the body scrolled only
   where a child happened to claim the touch first (a horizontal table, a word
   link). The owner, 2026-09-28: *"it's very hard to scroll by swiping. Seems
   like I have to click in specific places."* Stacked this way the sheet is on
   top, touches on it never reach the backdrop at all, and there is nothing
   between a finger and the scroll.

   The ScrollView also shrinks now (`flexShrink: 1`). React Native's default is
   0, so inside a sheet capped at `maxHeight` a long body grew to its content's
   height instead of scrolling within the cap, and pushed the footer down with
   it. */
export function Sheet({ visible = true, onClose, title, header, children, footer,
                        maxHeight = "85%", testID }) {
  const t = useTheme();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          testID="sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
        />
        <View
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
          <ScrollView testID="sheet-body" style={{ flexGrow: 0, flexShrink: 1 }}
                      keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer || null}
        </View>
      </View>
    </Modal>
  );
}

/* The cog that opens a screen's options — what a drill asks about, which cards
   a session deals. One drawing for both (the owner, 2026-09-26: *"let's make
   sure we have a settings cog to customize the exercises"*). It sits beside
   the progress, where the thing being configured is, rather than in the
   header with Home and the profile. */
export function CogButton({ onPress, testID = "cog", label = "Options" }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} hitSlop={6}
               accessibilityRole="button" accessibilityLabel={label}
               style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20,
                 alignItems: "center", justifyContent: "center", borderWidth: 1,
                 borderColor: t.line, backgroundColor: t.surface, opacity: pressed ? 0.6 : 1 })}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
           strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </Svg>
    </Pressable>
  );
}

/* The reference a learner can always reach for (the owner, 2026-09-27: *"when
   you're asking them to perform a specific skill, make sure there's a
   lightbulb available"*). Same 40 px disc as the cog, because they are the two
   icon controls a run screen carries and two shapes would read as two
   unrelated things; `on` lights it while its sheet is open.

   The path is here rather than in Talk.js, which drew the app's only bulb
   until now — one drawing, so the hint in a conversation and the reference in
   a drill are visibly the same offer. */
export const BULB_PATH = "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.4 1 2.5h6c0-1.1.3-1.9 1-2.5A6 6 0 0 0 12 3z";

export function BulbButton({ onPress, testID = "bulb", label = "Reference", on }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} hitSlop={6}
               accessibilityRole="button" accessibilityLabel={label}
               style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20,
                 alignItems: "center", justifyContent: "center", borderWidth: 1,
                 borderColor: on ? t.brand : t.line,
                 backgroundColor: on ? t.brandBg : t.surface, opacity: pressed ? 0.6 : 1 })}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
           stroke={on ? t.brandInk : t.ink2}
           strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d={BULB_PATH} />
      </Svg>
    </Pressable>
  );
}

/* ---- text *about* Russian: one treatment, everywhere the app writes it ---- */

/* The app writes English about Russian in four places — the verdict's
 * explanation, Say's feedback, Talk's summary, the tutor's note — and until
 * 2026-09-26 each was a flat grey paragraph. The owner, of the first
 * explanation to reach his phone: *"a large ugly verbose block of text… I'd
 * like to see it be concise, and also have some sort of consistent formatting
 * throughout the app."*
 *
 * The treatment is one rule: **the Russian in the sentence is the loud part.**
 * A form inside «guillemets» is drawn in the brand colour at weight 700 and
 * the guillemets themselves are dropped, because colour and weight are the
 * quoting. The eye lands on «книги» before it reads the clause around it,
 * which is the whole of what the learner needs from a two-line note.
 *
 * **It does not depend on the model remembering.** Every prompt asks for
 * guillemets, and a reply that forgets them still reads right: with none in
 * the string, the Cyrillic runs are marked instead. A renderer that only
 * worked when the model behaved would be a formatting rule that quietly
 * stops applying.
 */
/* Non-global sources: a `g` regex carries `lastIndex` between calls, so the
   shared constants are compiled fresh per call rather than reused. */
const MARKED = "«([^»]+)»";
const CYR_RUN = "[\\u0400-\\u04FF\\u0300\\u0301]+(?:-[\\u0400-\\u04FF\\u0300\\u0301]+)*";

/* -> [{ text, mark? }]. Exported for the test. */
export function splitMarked(text) {
  const s = text == null ? "" : String(text);
  const out = [];
  let last = 0, m;
  const re = new RegExp(new RegExp(MARKED).test(s) ? MARKED : CYR_RUN, "g");
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[1] === undefined ? m[0] : m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function Marked({ text, size = 15, color, italic, style, testID, numberOfLines,
                         accessibilityLabel }) {
  const t = useTheme();
  const parts = splitMarked(text);
  /* One label for the whole line when a caller gives one: a reader announcing
     each marked span separately would read the sentence in pieces. */
  return (
    <Text testID={testID} numberOfLines={numberOfLines} accessibilityLabel={accessibilityLabel}
          style={[{ color: color || t.ink, fontSize: size, lineHeight: Math.round(size * 1.4),
                    fontStyle: italic ? "italic" : "normal" }, style]}>
      {parts.map((p, k) => (p.mark ? (
        <Text key={k} style={{ color: t.brandInk, fontWeight: "700", fontStyle: "normal" }}>{p.text}</Text>
      ) : <Text key={k}>{p.text}</Text>))}
    </Text>
  );
}

/* Every sentence the app writes *about* Russian, one sentence to a line.
 *
 * The owner, 2026-09-27: *"One thing I really want to focus on is formatting
 * of any text blocks. We need to get away from ugly blocks of text and
 * verbose."* The caps on what the model may write were already tight — a
 * verdict's why is 24 words, a tutor's note 30 — and two short sentences run
 * together still read as a block, because nothing in a paragraph tells the eye
 * where one fact ends and the next begins.
 *
 * So a note is not a paragraph: it is its sentences, each on its own line with
 * air between them. Two facts look like two facts. `Marked` still does the
 * work inside a line, so the Russian is the loud part of each.
 *
 * Splitting on a full stop is safe here because the text is English prose
 * about Russian and the Russian inside it is never abbreviated — but a
 * decimal or an abbreviation would split wrongly, so a fragment shorter than
 * MIN_SENTENCE characters is joined back onto the one before it. */
const MIN_SENTENCE = 12;

export function sentences(text) {
  const s = (text == null ? "" : String(text)).trim();
  if (!s) return [];
  const out = [];
  for (const piece of s.split(/(?<=[.!?])\s+/)) {
    if (out.length && piece.length < MIN_SENTENCE) out[out.length - 1] += " " + piece;
    else out.push(piece);
  }
  return out;
}

export function Note({ text, size, color, italic, style, testID, gap = 8 }) {
  const lines = sentences(text);
  if (!lines.length) return null;
  return (
    <View testID={testID} style={[{ gap }, style]}>
      {lines.map((line, k) => (
        <Marked key={k} text={line} size={size === undefined ? type.body : size}
                color={color} italic={italic} />
      ))}
    </View>
  );
}

/* A small drop-down: the current choice and a caret, opening a sheet of the
   options with a tick on the chosen one.
 *
 * Immerse carried two of these built by hand (channel, sort) beside a row of
 * chips for the watched filter, and the owner wanted the three to match
 * (2026-09-28: *"make those filters look more standardized. I like the two
 * dropdowns on the right… make one for all/unwatched/watched too"*). One
 * component, so they cannot drift apart again.
 *
 *   options   [{ id, name, note? }] — `note` is a quiet count on the right
 *   testID    the trigger; the sheet is `${testID}-sheet` unless `sheetTestID`
 *             says otherwise, and each option `${optionPrefix}${id}` */
export function Dropdown({ testID, sheetTestID, optionPrefix, title, label, value, options, onPick,
                           style }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  const prefix = optionPrefix === undefined ? `${testID}-` : optionPrefix;
  return (
    <>
      <Pressable testID={testID} accessibilityRole="button"
                 accessibilityLabel={`${label}: ${current ? current.name : ""}`}
                 onPress={() => setOpen(true)} hitSlop={6}
                 style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4,
                   minHeight: 36, paddingHorizontal: 12, borderRadius: radius.lg,
                   borderWidth: 1, borderColor: t.line, backgroundColor: t.surface,
                   opacity: pressed ? 0.6 : 1 }, style]}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: t.ink2, fontSize: 13, fontWeight: "600" }}>
          {current ? current.name : ""}
        </Text>
        <Text style={{ color: t.ink3, fontSize: 11 }}>▾</Text>
      </Pressable>
      {open ? (
        <Sheet testID={sheetTestID || `${testID}-sheet`} title={title} onClose={() => setOpen(false)}>
          <List>
            {options.map((o) => (
              <Row key={o.id} testID={`${prefix}${o.id}`}
                   onPress={() => { onPick(o.id); setOpen(false); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>{o.name}</Text>
                </View>
                {o.note !== undefined ? <Muted>{String(o.note)}</Muted> : null}
                <Tick on={o.id === (current && current.id)} />
              </Row>
            ))}
          </List>
        </Sheet>
      ) : null}
    </>
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

/* A number the learner sets, with a minus, the value, and a plus.
 *
 * `Choice` handed out a fixed set of chips — 5, 10, 15, 25 — which is a menu
 * pretending to be a number: the answer a learner wants is often between two
 * of them and always invisible at a glance. The owner, 2026-09-22: *"make the
 * 'new words per day' setting a box that takes numerical input and maybe some
 * plus and minus signs instead of just 5 10 15."*
 *
 * The box is typed into as well as stepped. A half-typed value is kept as
 * text, not pushed through `Number` on every keystroke — clearing the field to
 * retype it would otherwise commit a 0 and, in the caller that owns this, deal
 * a session with no new cards. It commits on blur and on every step, clamped
 * to [min, max] so neither route can produce a value the caller must defend
 * against. */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, testID, label, style }) {
  const t = useTheme();
  const [text, setText] = useState(null);           // non-null only while typing
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const set = (n) => { setText(null); onChange(clamp(n)); };
  const commit = () => {
    const n = parseInt(String(text).replace(/[^0-9]/g, ""), 10);
    set(Number.isFinite(n) ? n : value);
  };
  const btn = (mark, to, name) => (
    <Pressable
      testID={testID ? `${testID}-${name}` : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${name === "minus" ? "Fewer" : "More"}${label ? ", " + label : ""}`}
      accessibilityState={{ disabled: to === value }}
      onPress={to === value ? undefined : () => set(to)}
      hitSlop={6}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center",
               borderRadius: radius.md, borderWidth: 1,
               borderColor: to === value ? t.lineSoft : t.line,
               backgroundColor: t.surface }}
    >
      <Text style={{ color: to === value ? t.ink3 : t.ink, fontSize: 22, fontWeight: "600",
                     lineHeight: 26 }}>{mark}</Text>
    </Pressable>
  );
  /* The targets are clamped before they are handed to the buttons, so a button
     that cannot move the number says so (`to === value`) rather than looking
     live and doing nothing. */
  return (
    <View testID={testID} style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>
      {btn("−", clamp(value - step), "minus")}
      <TextInput
        testID={testID ? `${testID}-value` : undefined}
        value={text === null ? String(value) : text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        accessibilityLabel={label}
        style={{ minWidth: 72, textAlign: "center", color: t.ink, fontSize: 17, fontWeight: "600",
                 backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 }}
      />
      {btn("+", clamp(value + step), "plus")}
    </View>
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
/* `voice` puts a small grey microphone in the bar (the owner, 2026-09-29):
   one press listens, and what is said becomes the query as it is said. Its
   value is the languages to hear — the dictionary takes Russian or English. */
export function SearchField({ value, onChangeText, placeholder, label, testID, style, autoFocus, voice,
                             voiceLang, onVoiceLang }) {
  const t = useTheme();
  const [note, setNote] = useState(null);
  /* Which language the microphone listens in, when it could hear either.
     Android's own switching between the two was tried first and leaned to
     English (the owner, 2026-09-29: *"the voice button for the search module
     seems to prioritize English"*), so the learner says which, once, and it is
     remembered (`onVoiceLang`). */
  const choose = Array.isArray(voice) && voice.length > 1;
  const [lang, setLang] = useState(voiceLang || (voice && voice[0]));
  useEffect(() => { if (voiceLang) setLang(voiceLang); }, [voiceLang]);
  const flip = () => {
    const next = voice[(voice.indexOf(lang) + 1) % voice.length];
    setLang(next);
    if (onVoiceLang) onVoiceLang(next);
  };
  const right = (voice ? 44 : 0) + (choose ? 40 : 0) + (value ? 40 : 0);
  return (
    <View style={style}>
    <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                 paddingRight: 14 + right, fontSize: 16, color: t.ink }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button"
                   accessibilityLabel="Clear" testID={testID ? testID + "-clear" : undefined}
                   style={{ position: "absolute", right: (voice ? 46 : 6) + (choose ? 40 : 0), width: 36, height: 36, borderRadius: 18,
                            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.ink3, fontSize: 16 }}>✕</Text>
        </Pressable>
      ) : null}
      {choose ? (
        <Pressable testID={testID ? testID + "-lang" : "search-lang"} onPress={flip} hitSlop={6}
                   accessibilityRole="button" accessibilityLabel={`Listen in ${lang === voice[0] ? "Russian" : "English"}`}
                   style={{ position: "absolute", right: 46, width: 36, height: 36, borderRadius: 18,
                            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.ink3, fontSize: 12, fontWeight: "700" }}>
            {lang === voice[0] ? "RU" : "EN"}
          </Text>
        </Pressable>
      ) : null}
      {voice ? (
        <View style={{ position: "absolute", right: 4 }}>
          <MicButton testID={testID ? testID + "-mic" : "search-mic"} langs={choose ? [lang] : voice}
                     onLive={(s) => { if (s) onChangeText(s); }} onText={onChangeText} onNote={setNote} />
        </View>
      ) : null}
    </View>
    {note ? <Muted testID={testID ? testID + "-note" : undefined} size={13} style={{ marginTop: 6 }}>{note}</Muted> : null}
    </View>
  );
}

/* A section that folds: its name and a chevron, the body a tap away. The
   word entry's tables, its examples and its videos all use it (2026-09-29),
   so the three open and close alike and the entry reads top to bottom as a
   list of what it holds rather than all of it at once. `open` is where it
   starts; after that it is the learner's. */
export function Fold({ title, open: start = false, testID, children, style }) {
  const t = useTheme();
  const [open, setOpen] = useState(!!start);
  return (
    <View style={style}>
      <Pressable testID={testID ? `${testID}-toggle` : undefined} onPress={() => setOpen(!open)}
                 accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}
                 style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 44,
                                            opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: t.ink3, fontSize: 16 }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/* A setting's name with a small circled "i" beside it; a tap shows one line
   under it saying what the setting does (the owner, 2026-09-29: "it's not
   clear what 'reviews a day' and 'retention' and 'learn ahead' are"). On
   demand, not always drawn — rule 20.7's tooltip, which is where explanation
   of a control is allowed to live. */
export function InfoLabel({ label, info, testID }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: t.ink, fontSize: 15 }}>{label}</Text>
        <Pressable testID={testID} onPress={() => setOpen(!open)} hitSlop={12}
                   accessibilityRole="button" accessibilityLabel={`About ${label}`}
                   accessibilityState={{ expanded: open }}
                   style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
                            borderColor: open ? t.brandInk : t.ink3,
                            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: open ? t.brandInk : t.ink3, fontSize: 12, fontWeight: "700",
                         lineHeight: 14 }}>i</Text>
        </Pressable>
      </View>
      {open ? <Muted size={13} style={{ marginTop: 4 }}>{info}</Muted> : null}
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

/* `testID` is passed through deliberately: a component that silently drops one
   is §30m's `Card` bug, and it leaves the thing untestable with nothing
   failing to say so. */
export function Pill({ children, tone, testID }) {
  const t = useTheme();
  /* `irregular`: ink on the surface inside an amber edge — the colour is
     the stroke, which is how `warn` is audited, never the text. */
  const c = tone === "good" ? { bg: t.goodBg, fg: t.good }
          : tone === "brand" ? { bg: t.brandBg, fg: t.brandInk }
          : tone === "bad" ? { bg: t.badBg, fg: t.bad }
          : tone === "irregular" ? { bg: t.surface, fg: t.ink, edge: t.warn }
          : { bg: t.surface2, fg: t.ink2 };
  return (
    <View testID={testID} style={{ backgroundColor: c.bg, borderRadius: 99,
                   borderWidth: c.edge ? 1.5 : 0, borderColor: c.edge,
                   paddingHorizontal: 8, paddingVertical: c.edge ? 1.5 : 3 }}>
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

/* The tile at the head of a row.
 *
 * `n` alone is a numbered step; `id` alone is a subject. **Not both.** A unit's
 * six lessons all belong to the same unit, so drawing its icon six times down
 * the screen and hanging a different number off each one meant six identical
 * pictures and one small digit doing all the work — decoration with a fact
 * stuck to it (§25: every visible element must earn its place). Where a row is
 * one of a numbered sequence the number is the whole tile, at a size worth
 * reading. */
/* `tone` colours the tile by what family the row belongs to — Listening,
 * Speaking, Grammar. Practice was ten rows of identical grey glyph on identical
 * grey tile, which is most of why the owner read the app as generated
 * (2026-09-17): nothing on the screen was a different colour from anything
 * else, so nothing was more important than anything else and the icons marked
 * nothing.
 *
 * The hues are the four the palette already carries, so they are contrast-
 * audited and match the web app by construction (§24, §31) — no new token, no
 * value picked by eye. `bad` is deliberately not one of them: red means wrong,
 * everywhere else in the app.
 *
 * Absent, the tile is the neutral it always was, so every existing call site is
 * unchanged. */
const TONES = { brand: "brand", good: "good", info: "info" };

export function Thumb({ id, done, locked, n, tone }) {
  const t = useTheme();
  const numbered = n !== undefined && !locked;
  const key = TONES[tone];
  const hue = done ? t.good : key ? t[key] : t.ink3;
  const face = done ? t.goodBg : key && !locked ? t[`${key}Bg`] : t.surface2;
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center",
                   justifyContent: "center",
                   backgroundColor: face,
                   borderWidth: done ? 2 : 0, borderColor: t.good }}>
      {locked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.ink3}
             strokeWidth={1.8}>
          <Path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
      ) : numbered ? (
        <Text style={{ fontSize: 17, fontWeight: "700", color: done ? t.good : t.ink2 }}>
          {n}
        </Text>
      ) : (
        <UnitIcon id={id} color={hue} />
      )}
    </View>
  );
}

/* The same characters the web app draws, from the same source. SvgXml renders the
   shared markup directly rather than each platform keeping its own copy of the art.
   `avatarOf` resolves an id from before the DiceBear faces to a face of its own. */
export function Avatar({ id, size = 44 }) {
  const a = avatarOf(id);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
                   backgroundColor: a.bg, overflow: "hidden" }}>
      <SvgXml
        width={size}
        height={size}
        xml={`<svg viewBox="${a.vb}" xmlns="http://www.w3.org/2000/svg">${a.svg}</svg>`}
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
/* Whether this phone can speak Russian, kept current as voices load. One hook
   for every control that falls back to the device voice, so a table of forms
   and the speaker above it cannot disagree about whether there is a voice. */
export function useRussianVoice() {
  const [voice, setVoice] = useState(hasRussianVoice());
  useEffect(() => {
    let alive = true;
    probeVoices().then(() => { if (alive) setVoice(hasRussianVoice()); });
    const off = onVoicesChanged(() => { if (alive) setVoice(hasRussianVoice()); });
    return () => { alive = false; off(); };
  }, []);
  return voice;
}

export function Speaker({ text, size = 40, device = false }) {
  const t = useTheme();
  /* With `device` the recording is deliberately not used, so the button must
     not claim one: `real` decides the label and the testID, and "Hear it"
     over a device voice would be §27's lie in the other direction. */
  const real = hasRealAudio(text) && !device;
  const voice = useRussianVoice();
  // A stream that failed with no voice to fall back on: the button says so
  // for a few seconds instead of doing nothing (audio.js onAudioFailure).
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const offFail = onAudioFailure((what) => {
      if (!alive || what !== text) return;
      setDown(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (alive) setDown(false); }, 4000);
    });
    return () => { alive = false; offFail(); if (timer) clearTimeout(timer); };
  }, [text]);
  /* A speaker that stays on screen fetches its recording ahead of the press
     (audio.js `warm`), so a streamed example plays at once. After a moment,
     not at mount: search results change with every letter typed. */
  useEffect(() => {
    if (!real) return undefined;
    const timer = setTimeout(() => warm(text), 500);
    return () => clearTimeout(timer);
  }, [text, real]);

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
      onPress={live ? () => say(text, { device }) : undefined}
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

/* The familiarity ring's colour at a score: red at nothing, amber halfway,
   green at 100 — `bad`, `warn`, `good`, mixed in RGB between neighbours, so
   every anchor is a token the audit has seen (§24). A stroke, never text. */
export function familiarityColor(score, t) {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, k) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * k)
    .toString(16).padStart(2, "0")).join("").toUpperCase();
  const s = Math.max(0, Math.min(100, score));
  return s < 50 ? mix(t.bad, t.warn, s / 50) : mix(t.warn, t.good, (s - 50) / 50);
}

/* A word's familiarity (core/scheduler.js `familiarity`) as a ring with the
   number inside — a gauge, read at a glance, rather than a figure the learner
   has to find a scale for. The number is `ink` on the surface; only the arc
   takes the colour. On the flashcard at 34, on the dictionary entry larger. */
/* `text` and `label` let another 0–100 gauge share the drawing (Stats'
   retention), so the app has one ring rather than two that drift apart. */
export function Familiarity({ score, size = 34, text, label, testID = "familiarity" }) {
  const t = useTheme();
  if (score === null || score === undefined) return null;
  const w = size > 60 ? 7 : size > 40 ? 5 : 3.5, r = (size - w) / 2, c = 2 * Math.PI * r;
  const color = familiarityColor(score, t);
  return (
    <View testID={testID} accessibilityLabel={label || `Familiarity ${score} of 100`}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface3} strokeWidth={w} fill="none" />
        <Circle testID="familiarity-arc" cx={size / 2} cy={size / 2} r={r} stroke={color}
                strokeWidth={w} fill="none" strokeLinecap="round"
                strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - score / 100)}
                rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      <Text testID="familiarity-score"
            style={{ color: t.ink, fontSize: size > 60 ? 19 : size > 40 ? 15 : 11, fontWeight: "700" }}>
        {text === undefined ? score : text}
      </Text>
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
/* How long an example may be before a *card* declines to show it.
 *
 * A dictionary entry may quote; a flashcard may not. Wiktionary illustrates
 * common words with literature — the owner met the back of «вы» carrying
 * twenty-five words of War and Peace (ROADMAP 13.34). The ingest now refuses
 * anything it would have had to truncate, and 391 of the 3,714 that remain are
 * still over fifteen words: real examples, fine in an entry, wrong on a card
 * you are trying to answer in three seconds.
 *
 * Twelve words, from the distribution: the median example is 4 and three
 * quarters are inside 10, so this keeps almost all of them and excludes the
 * quotations. */
export const BRIEF_EXAMPLE_WORDS = 12;
const isBrief = (x) => String((x && x.ru) || "").trim().split(/\s+/).length <= BRIEF_EXAMPLE_WORDS;

/* `brief` is a card rather than an entry: one example per sense at most, and
   only a short one. The entry passes nothing and shows everything. */
export function SenseList({ senses, size = 15, style, max, brief, testID }) {
  const t = useTheme();
  if (!senses || !senses.length) return null;
  const shown = max && senses.length > max ? senses.slice(0, max) : senses;
  const rest = senses.length - shown.length;
  const many = senses.length > 1;
  const examplesOf = (s) => {
    const xs = s.x || [];
    return brief ? xs.filter(isBrief).slice(0, 1) : xs;
  };
  return (
    <View testID={testID || "sense-list"} style={[{ alignSelf: "stretch", gap: 10 }, style]}>
      {/* The first sense is the word's primary meaning and it is set apart —
          the full ink rather than the muted one, and a little heavier (the
          owner, 2026-09-16: *"primary definitions are a different color or
          shade so they stand out from the card itself. A bit of formatting
          goes a long way"*). Everything after it is a further sense and stays
          quiet, so the eye lands on the meaning the learner is being taught
          before it reaches the ones they are not.
          Shade, not a new colour: `ink` and `ink2` are both audited against
          every surface they sit on (tools/contrast.js), and picking a fresh
          value by eye is what §31 forbids. */}
      {shown.map((s, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 8 }}>
          {many ? (
            <Text style={{ color: k === 0 ? t.brandInk : t.ink3, fontSize: size, fontWeight: "700",
                           minWidth: 16, lineHeight: size + 6 }}>
              {k + 1}
            </Text>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text testID={k === 0 ? "sense-primary" : undefined}
                  style={{ color: k === 0 ? t.ink : t.ink2, fontSize: size,
                           fontWeight: k === 0 ? "600" : "400", lineHeight: size + 6 }}>
              {/* The labels read as part of the sentence, in italics, the way a
                  dictionary sets them — not as chips, which would make every
                  entry a row of badges (§25). */}
              {s.t && s.t.length ? (
                <Text style={{ color: t.ink3, fontStyle: "italic" }}>{s.t.join(", ") + " "}</Text>
              ) : null}
              {s.g}
            </Text>
            {examplesOf(s).map((x, n) => (
              <View key={n} testID="sense-example"
                    style={{ marginTop: 5, paddingLeft: 10, borderLeftWidth: 2,
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
      {/* The same hierarchy `SenseList` draws, for the 2 % of words with no
          Wiktionary entry and for a deck card, where a translation is all
          there is. One rule, both renderers. */}
      {shown.map((g, k) => (
        <Text key={k} testID={k === 0 ? "sense-primary" : undefined}
              style={{ color: k === 0 ? t.ink : t.ink2, fontSize: size, textAlign: align,
                       fontWeight: k === 0 ? "600" : "400", lineHeight: size + 6 }}>
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

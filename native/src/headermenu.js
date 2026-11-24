/* The header's buttons, the same five on every screen, in the same places
 * (the owner, 2026-11-19: "the top menu items… should be the same for every
 * slide. Looks too chaotic that they're always changing around"; then
 * 2026-11-23: "perhaps it should just be the same exact toolbar at the top on
 * every page… maybe no longer use the plus bar. If an item doesn't appear on
 * the page maybe just gray it out").
 *
 * Left to right: the sparkle (askai.js), help for this screen (help.js; its
 * sheet also sends feedback), the screen's options, Home, and the profile.
 * Nothing moves from screen to screen: a button with nothing to do here is
 * drawn faint and does nothing (Options on a screen with none, Home on the
 * path). A screen with options registers them with `useHeaderOptions`; the
 * header subscribes, so a screen that mounts after its header drew still
 * lights its Options.
 */

import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { useTheme } from "./theme";
import { Avatar } from "./ui";
import { useSession } from "./session";
import { navRef } from "./words";
import { HelpSheet, HELP } from "./help";
import { aiOffered } from "./askai";

/* route key -> { label, open } for the screen on that route. A screen
   mounted with no route (a test renders it alone) registers under its own
   key, and `openScreenOptions` opens the newest registration — the way a
   test reaches what the header would. */
const registry = new Map();
let newest = null;
const listeners = new Set();
const changed = () => listeners.forEach((f) => f());
/* `enabled` false registers nothing: a screen holding two tabs that are both
   mounted (Study: Vocabulary · Cases) lets the one on show own the button. */
export function useHeaderOptions(route, open, label = "Options", enabled = true) {
  const key = (route && route.key) || "screen";
  useEffect(() => {
    if (!enabled) return undefined;
    const entry = { label, open };
    registry.set(key, entry);
    newest = entry;
    changed();
    return () => {
      if (registry.get(key) === entry) registry.delete(key);
      if (newest === entry) newest = null;
      changed();
    };
  }, [key, open, label, enabled]);
}
export const optionsFor = (route) => (route && route.key ? registry.get(route.key) || null : newest);
export function openScreenOptions() {
  if (newest) newest.open();
  return !!newest;
}
/* The options registered for a route, kept current. */
function useOptionsFor(route) {
  const [entry, setEntry] = useState(() => optionsFor(route));
  useEffect(() => {
    const read = () => setEntry(optionsFor(route));
    read();
    listeners.add(read);
    return () => listeners.delete(read);
  }, [route && route.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return entry;
}

const SLOT = { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginLeft: 2 };
/* One header button: a glyph in a slot of fixed size, faint and inert when
   there is nothing for it to do here. */
export function HeaderButton({ testID, label, onPress, children, off = false }) {
  return (
    <Pressable testID={testID} onPress={off ? undefined : onPress} hitSlop={6}
               accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }}
               style={({ pressed }) => [SLOT, { opacity: off ? 0.3 : pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}
const Glyph = ({ color, children }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}
       strokeLinecap="round" strokeLinejoin="round">{children}</Svg>
);

function HelpButton({ route }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const name = route && route.name;
  const has = !!HELP[name] || aiOffered();
  return (
    <>
      <HeaderButton testID="help-button" label="How to use this screen" off={!has} onPress={() => { if (has) setOpen(true); }}>
        <Glyph color={t.ink2}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01" />
        </Glyph>
      </HeaderButton>
      {open ? <HelpSheet route={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function OptionsButton({ route }) {
  const t = useTheme();
  const entry = useOptionsFor(route);
  return (
    <HeaderButton testID="options-button" label={entry ? entry.label : "No options here"} off={!entry}
                  onPress={() => entry && entry.open()}>
      <Glyph color={t.ink2}>
        <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <Circle cx="16" cy="7" r="2" />
        <Circle cx="10" cy="17" r="2" />
      </Glyph>
    </HeaderButton>
  );
}

function ProfileButton({ navigation }) {
  const { account } = useSession();
  const go = () => {
    const names = navigation && navigation.getState ? (navigation.getState() || {}).routeNames || [] : [];
    if (names.includes("You") && navigation) navigation.navigate("You");
    else if (navRef.isReady && navRef.isReady()) navRef.navigate("Tabs", { screen: "Learn", params: { screen: "You" } });
  };
  return (
    <HeaderButton testID="profile-button" label="Your profile" off={!account} onPress={() => { if (account) go(); }}>
      {account ? <Avatar id={account.avatar} size={28} /> : null}
    </HeaderButton>
  );
}

/* The header's right side, the same on every screen. */
export function HeaderTools({ navigation, route, AskButton, HomeButton }) {
  const home = !route || route.name !== "Path";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 4 }}>
      <AskButton />
      <HelpButton route={route} />
      <OptionsButton route={route} />
      <HomeButton off={!home} />
      <ProfileButton navigation={navigation} />
    </View>
  );
}

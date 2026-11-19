/* The header's third button, and the menu behind it (the owner, 2026-11-19:
 * *"The top menu items (the flag, the sparkle for ai, the home button, the
 * help button, the customize button) should be the same for every slide.
 * Looks too chaotic that they're always changing around… maybe the home and
 * the sparkle are there and then a plus sign for any other options which
 * would open the submenu"*).
 *
 * So every header is the same three: the sparkle (askai.js), Home, and this
 * "more" button. Its sheet holds what the headers used to carry each in its
 * own arrangement — the profile, the screen's options where it has any, how
 * to use this screen (help.js), and the report flag — one row each. A screen
 * with options registers them with `useHeaderOptions`; the menu reads the
 * registry when it opens, so a screen that mounts after its header drew still
 * puts its row there, and the cog that used to sit on the screen is gone.
 */

import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "./theme";
import { Sheet, List, Row, RowText, Thumb, Avatar } from "./ui";
import { useSession } from "./session";
import { navRef } from "./words";
import { HelpSheet, HELP } from "./help";
import { aiOffered } from "./askai";
import { screenAbout } from "./about";

/* route key -> { label, open } for the screen on that route. A screen
   mounted with no route (a test renders it alone) registers under its own
   key, and `openScreenOptions` opens the newest registration — the way a
   test reaches what the header's menu would. */
const registry = new Map();
let newest = null;
export function useHeaderOptions(route, open, label = "Options") {
  const key = (route && route.key) || "screen";
  useEffect(() => {
    const entry = { label, open };
    registry.set(key, entry);
    newest = entry;
    return () => {
      if (registry.get(key) === entry) registry.delete(key);
      if (newest === entry) newest = null;
    };
  }, [key, open, label]);
}
export const optionsFor = (route) => (route && route.key ? registry.get(route.key) || null : newest);
export function openScreenOptions() {
  if (newest) newest.open();
  return !!newest;
}

const GLYPH = { width: 30, height: 30, alignItems: "center", justifyContent: "center" };

export function MoreButton({ navigation, route }) {
  const t = useTheme();
  const { account } = useSession();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const name = route && route.name;
  const options = optionsFor(route);
  const hasHelp = !!HELP[name] || aiOffered();
  const profile = () => {
    setOpen(false);
    const names = navigation && navigation.getState ? (navigation.getState() || {}).routeNames || [] : [];
    if (names.includes("You") && navigation) navigation.navigate("You");
    else if (navRef.isReady && navRef.isReady()) navRef.navigate("Tabs", { screen: "Learn", params: { screen: "You" } });
  };
  const report = () => {
    setOpen(false);
    const about = screenAbout();
    if (navRef.isReady && navRef.isReady()) navRef.navigate("Feedback", { about, from: about.screen });
  };
  return (
    <>
      <Pressable testID="more-button" onPress={() => setOpen(true)} hitSlop={8}
                 accessibilityRole="button" accessibilityLabel="More" style={[GLYPH, { marginRight: 4 }]}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
             strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      </Pressable>
      {open ? (
        <Sheet testID="more-sheet" onClose={() => setOpen(false)}>
          <List>
            {account ? (
              <Row testID="more-profile" onPress={profile}>
                <Avatar id={account.avatar} size={32} />
                <RowText title={account.name} sub="Your profile" bold={false} />
              </Row>
            ) : null}
            {options ? (
              <Row testID="more-options" onPress={() => { setOpen(false); options.open(); }}>
                <Thumb id="cog" tone="brand" />
                <RowText title={options.label} bold={false} />
              </Row>
            ) : null}
            {hasHelp ? (
              <Row testID="more-help" onPress={() => { setOpen(false); setHelp(true); }}>
                <Thumb id="help" tone="info" />
                <RowText title="How to use this screen" bold={false} />
              </Row>
            ) : null}
            <Row testID="more-report" onPress={report}>
              <Thumb id="flag" />
              <RowText title="Report a problem" bold={false} />
            </Row>
          </List>
        </Sheet>
      ) : null}
      {help ? <HelpSheet route={name} onClose={() => setHelp(false)} /> : null}
    </>
  );
}

/* The header's right side, the same on every screen: the sparkle, Home (not
   on the path, which is home), and the menu. */
export function HeaderTools({ navigation, route, AskButton, HomeButton }) {
  const home = !route || route.name !== "Path";
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <AskButton />
      {home ? <HomeButton /> : null}
      <MoreButton navigation={navigation} route={route} />
    </View>
  );
}

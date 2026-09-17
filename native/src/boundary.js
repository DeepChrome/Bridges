/* The screen that stands where a white screen used to (PLAYBOOK Phase 6).
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which on a device is a blank app that has to be force-quit. There was no
 * boundary anywhere in Bridges — measured 2026-09-16 — so any bug in a render
 * path took the app out entirely, and the learner's only information was that
 * it closed.
 *
 * Two things matter here and they are easy to get backwards:
 *
 * 1. **The way out must not need the thing that broke.** "Try again" remounts
 *    the subtree; if what broke is deterministic it will break again, and then
 *    the second button has to reach somewhere that cannot be the same screen.
 *    That is why `onReset` is a prop — App.js sends the learner home, which is
 *    a different screen with different data.
 * 2. **Nothing the learner did is lost.** The store writes on a debounce and
 *    flushes on background, and a crash is neither. `onCrash` is where App.js
 *    puts that flush; the record of what broke is written at the same moment
 *    (src/crash.js) so the two cannot drift apart.
 *
 * Deliberately a class: `getDerivedStateFromError` and `componentDidCatch` have
 * no hook equivalent, and React has not shipped one.
 */

import React from "react";
import { View } from "react-native";
import { Screen, Btn, Muted, Text } from "./ui";
import { useTheme, type as T } from "./theme";
import { recordCrash } from "./crash";

function Fallback({ what, onReset, onHome }) {
  const t = useTheme();
  return (
    <Screen fill safeTop>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
        <Text testID="broke-title"
              style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
          Something broke
        </Text>
        {/* What it was, quietly. Rule 20.7 allows a failure to say what it is
            (it is one of the three reasons copy may run long), and a learner
            who can read the message can hand it over. */}
        {what ? (
          <Muted testID="broke-what" size={12} numberOfLines={3}
                 style={{ textAlign: "center", marginTop: 10 }}>
            {what}
          </Muted>
        ) : null}
        <Muted style={{ textAlign: "center", marginTop: 14 }}>
          Your progress is saved
        </Muted>
      </View>
      <Btn kind="pri" testID="broke-retry" label="Try again" onPress={onReset} />
      {onHome ? (
        <Btn kind="ghost" testID="broke-home" label="Back to the path"
             style={{ marginTop: 8 }} onPress={onHome} />
      ) : null}
    </Screen>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
    this.home = this.home.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error: error || new Error("unknown") };
  }

  componentDidCatch(error, info) {
    /* Record before anything else, and never await it: this runs during a
       commit, and a rejected promise here would be a second crash on top of
       the first. `recordCrash` swallows its own failures (src/crash.js). */
    (this.props.record || recordCrash)(error, info);
    if (this.props.onCrash) {
      try { this.props.onCrash(error, info); } catch (e) { /* the flush failed too */ }
    }
  }

  reset() {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
  }

  home() {
    /* Home first, then remount — the other order remounts the broken screen
       and throws again before the navigation lands. */
    if (this.props.onHome) this.props.onHome();
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Fallback
        what={String(this.state.error.message || this.state.error)}
        onReset={this.reset}
        onHome={this.props.onHome ? this.home : null}
      />
    );
  }
}

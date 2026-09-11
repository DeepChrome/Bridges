/* The way in.
 *
 * The owner, 2026-09-10: *"Can you work on a clean login screen and animation?"*
 *
 * Bridges has no accounts on a server and does not want any — a profile is a
 * name, a character and a learner state on this phone, and the learning data is
 * his own (§1). So the screen this asks for is not a login form; it is the
 * screen the app opens on, and its job is to say what this is and get out of the
 * way. It used to be a bare `Title` over a `List`, which is the same screen
 * every settings page in the app already is.
 *
 * What it is now, in three states that are one screen each:
 *
 *   - **Sign in** — profiles exist. The mark, then the faces, largest thing on
 *     the screen, one tap in. That is the login.
 *   - **New here** — no profile yet. The mark draws itself, Yuri waves and
 *     introduces himself (the only screen besides the end of a lesson where he
 *     says anything at all — core/guide.js), then a character and a name.
 *   - **Where to start** — the placement offer, unchanged in substance.
 *
 * The animation is stagger and nothing else: everything rises into place in
 * order, top down, about a tenth of a second apart, and the whole thing is over
 * in under half a second. Every control is pressable on the first frame (§25),
 * and with reduced motion on, the end state is what renders.
 *
 * The profile is still created by the *placement choice*, not by Continue: an
 * account existing is what the shell watches to leave the gate, so creating it
 * any earlier unmounts this screen before the question can be asked.
 */

import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, Muted, Avatar, AV, AV_IDS } from "../ui";
import { Wordmark, Mark } from "../mark";
import { Guide } from "../guide";
import { useEnter, usePress, usePop } from "../motion";
import { guideLine } from "@core/guide";
import { Intro } from "./Intro";

/* One step of the stagger. Short enough that the screen reads as one movement
   rather than as a sequence of things appearing. */
const STEP = 70;

/* A block that rises into place in its turn. */
function Rise({ n = 0, style, children, testID }) {
  const anim = useEnter([], { delay: n * STEP });
  return (
    <Animated.View testID={testID} style={[anim, style]}>{children}</Animated.View>
  );
}

/* ------------------------------------------------------------- signing in */

/* A profile, as a face with a name under it. Big, because choosing one is the
   only thing this screen asks for. */
function Face({ account, n, onPress }) {
  const t = useTheme();
  const press = usePress({ to: 0.95 });
  return (
    <Rise n={n} style={{ width: "33.333%", paddingHorizontal: 4, marginBottom: 14 }}>
      <Animated.View style={press.style}>
        <Pressable
          testID={`profile-${account.id}`}
          accessibilityRole="button"
          accessibilityLabel={account.name}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Avatar id={account.avatar} size={72} />
          <Text numberOfLines={1}
                style={{ color: t.ink, fontSize: T.body, fontWeight: "600", marginTop: 8 }}>
            {account.name}
          </Text>
        </Pressable>
      </Animated.View>
    </Rise>
  );
}

function SignIn({ accounts, onPick, onNew }) {
  const t = useTheme();
  return (
    <Screen>
      <Rise n={0} style={{ alignItems: "center", marginTop: 24, marginBottom: 28 }}>
        <Mark size={56} />
      </Rise>
      <Rise n={1}>
        <Text testID="gate-title"
              style={{ color: t.ink, textAlign: "center", fontSize: T.display,
                       fontWeight: "700", letterSpacing: -0.5, marginBottom: 24 }}>
          Who's studying?
        </Text>
      </Rise>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
        {accounts.map((a, k) => (
          <Face key={a.id} account={a} n={2 + k} onPress={() => onPick(a.id)} />
        ))}
      </View>
      <Rise n={2 + accounts.length} style={{ marginTop: 10 }}>
        <Btn label="New profile" onPress={onNew} />
      </Rise>
    </Screen>
  );
}

/* -------------------------------------------------------------- new here */

function CharacterPicker({ value, onPick }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
      {AV_IDS.map((id) => (
        <Character key={id} id={id} on={id === value} onPress={() => onPick(id)} />
      ))}
    </View>
  );
}

function Character({ id, on, onPress }) {
  const t = useTheme();
  /* The chosen one sits in a ring that pops when it is taken, so the choice has
     a moment of its own rather than a border blinking on. */
  const pop = usePop([on && id]);
  const press = usePress({ to: 0.92 });
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={AV[id].name}
        accessibilityState={{ selected: on }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={{ width: 66, height: 66, borderRadius: 33, alignItems: "center",
                 justifyContent: "center" }}
      >
        {on ? (
          <Animated.View
            style={[pop, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                           borderRadius: 33, borderWidth: 2, borderColor: t.brand,
                           backgroundColor: t.brandBg }]}
          />
        ) : null}
        <Avatar id={id} size={54} />
      </Pressable>
    </Animated.View>
  );
}

function NewProfile({ canCancel, onCancel, onDone }) {
  const t = useTheme();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AV_IDS[0]);
  /* Chosen once per arrival, not per render: a greeting that rewrites itself
     while it is being read is worse than one that never changes. */
  const hello = useRef(guideLine("hello", Math.floor(Math.random() * 100))).current;
  const ready = !!name.trim();
  /* Guarded here and not only on the button: RNTL reads a press off the
     wrapper's own props, and `Btn` withholds `onPress` rather than disabling
     its Pressable (§23), so the handler is the only place the rule is real. */
  const go = () => { if (ready) onDone({ name: name.trim(), avatar }); };
  return (
    <Screen>
      <Rise n={0} style={{ alignItems: "center", marginTop: 16 }}>
        <Wordmark size={64} />
      </Rise>
      <Rise n={1} style={{ flexDirection: "row", alignItems: "center", gap: 10,
                           marginTop: 22, marginBottom: 22 }}>
        <Guide pose="wave" size={64} />
        <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: radius.md,
                       paddingVertical: 10, paddingHorizontal: 13 }}>
          <Text testID="gate-hello" style={{ color: t.ink2, fontSize: T.body, lineHeight: T.body + 5 }}>
            {hello}
          </Text>
        </View>
      </Rise>
      <Rise n={2}>
        <CharacterPicker value={avatar} onPick={setAvatar} />
      </Rise>
      <Rise n={3} style={{ marginTop: 22 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={t.ink3}
          returnKeyType="go"
          onSubmitEditing={go}
          style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                   borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
                   fontSize: T.head, color: t.ink, textAlign: "center" }}
        />
      </Rise>
      <Rise n={4} style={{ marginTop: 14 }}>
        <Btn kind="pri" label="Continue" disabled={!ready} onPress={go} />
        {canCancel ? (
          <Btn kind="ghost" style={{ marginTop: 4 }} label="Back" onPress={onCancel} />
        ) : null}
      </Rise>
    </Screen>
  );
}

/* --------------------------------------------------------- where to start */

/* Defined here rather than inside `Placement`: a component declared in a render
   is a new type every render, so React unmounts and remounts it — which would
   restart its entry animation on every keystroke elsewhere on the screen. */
function Option({ n, title, sub, onPress, testID }) {
  const t = useTheme();
  const p = usePress({ to: 0.985 });
  return (
    <Rise n={n}>
      <Animated.View style={p.style}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          onPress={onPress}
          onPressIn={p.onPressIn}
          onPressOut={p.onPressOut}
          style={({ pressed }) => ({
            backgroundColor: pressed ? t.surface2 : t.surface,
            borderColor: t.line, borderWidth: 1, borderRadius: radius.lg,
            padding: 18, marginBottom: 10, minHeight: 64, justifyContent: "center",
          })}
        >
          <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "600" }}>{title}</Text>
          {sub ? <Muted style={{ marginTop: 2 }}>{sub}</Muted> : null}
        </Pressable>
      </Animated.View>
    </Rise>
  );
}

function Placement({ avatar, onChoose }) {
  const t = useTheme();
  return (
    <Screen>
      <Rise n={0} style={{ alignItems: "center", marginTop: 24, marginBottom: 20 }}>
        <Avatar id={avatar} size={72} />
      </Rise>
      <Rise n={1}>
        <Text style={{ color: t.ink, fontSize: T.display, fontWeight: "700",
                       letterSpacing: -0.5, textAlign: "center" }}>
          Where should we start?
        </Text>
        <Muted style={{ textAlign: "center", marginTop: 4, marginBottom: 22 }}>
          A short test can skip what you already know.
        </Muted>
      </Rise>
      <Option n={2} testID="placement-take" title="Take the placement test"
              sub="50 questions · about 10 minutes" onPress={() => onChoose(true)} />
      <Option n={3} testID="placement-skip" title="Start from the beginning"
              onPress={() => onChoose(false)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------- gate */

export function Gate({ onPlacement }) {
  const { accounts, createProfile, selectProfile } = useSession();
  /* Which screen this is, derived rather than seeded. It used to be
     `useState(!accounts.list.length)`, which reads the profile list on the
     first render — and the list arrives from storage a tick later, so a phone
     that has profiles showed the new-profile form once and kept it. In the app
     the shell waited for `ready` before drawing the gate, so it never showed;
     the state that is only correct because of what a caller does elsewhere is
     the bug, not the symptom. */
  const [wantNew, setWantNew] = useState(false);
  const creating = wantNew || !accounts.list.length;
  const [offer, setOffer] = useState(null);
  const [toured, setToured] = useState(false);

  const start = async (wanted) => {
    await createProfile(offer.name, offer.avatar);
    onPlacement(wanted);
  };

  // The tour sits between the name and the first choice: the first profile on
  // this phone sees it once; a second profile skips it.
  if (offer && !toured && accounts.list.length === 0) {
    return <Intro onDone={() => setToured(true)} />;
  }
  if (offer) return <Placement avatar={offer.avatar} onChoose={start} />;
  if (creating) {
    return (
      <NewProfile
        canCancel={accounts.list.length > 0}
        onCancel={() => setWantNew(false)}
        onDone={setOffer}
      />
    );
  }
  return (
    <SignIn accounts={accounts.list} onPick={selectProfile}
            onNew={() => setWantNew(true)} />
  );
}

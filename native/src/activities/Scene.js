/* Listening: one scenario, several voices, five questions about the situation.
 *
 * Rebuilt 2026-09-10 on the owner's brief, which is worth keeping whole because
 * every decision below comes out of it:
 *
 *   "There is a single audio clip. It will last about 30-45 seconds. It's like a
 *    scenario where the learner listens to a conversation and then is asked
 *    questions about what they heard. The questions aren't focused on
 *    identifying the word or translating a specific sentence. They're questions
 *    about the scenario — who is talking? Are they friends? Where are they
 *    going? What is their problem? … The questions are available for them before
 *    the audio even starts so they can familiarize themselves. They'll have the
 *    controls to back up a few seconds … Just one scenario with a few people
 *    talking to each other (different voices are key) and then 5 questions."
 *
 * What it replaces: four or five unrelated sentences, each with "what does this
 * one mean?", played one at a time behind numbered replay buttons. That tested
 * translation of a sentence in isolation, which is not listening.
 *
 * The three things that make this a listening exercise rather than a quiz with
 * sound: the questions are on screen before the first press of Play, the audio
 * runs as one piece the learner can move around in, and nothing on screen says
 * in Russian what is being said out loud until it has been answered.
 *
 * Grading (§30c's rule, applied to a scenario): comprehension is judged whole.
 * A question missed is not evidence about any particular word, so a word is
 * only graded when the learner followed the conversation — three of five, swept
 * (core/speech.js SCENE_FOLLOWED) — and then it is Good, never Easy. Credit is
 * the share right, as everywhere else.
 *
 * The corpus scene (a lesson with no written scenario) arrives here with no
 * cast and per-sentence questions; both render through the same view.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, PanResponder } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Btn, Muted, Bar, Text } from "../ui";
import { stop, hasRealAudio, hasRussianVoice } from "../audio";
import { useScenario, trackWhenCurrent, msFor, SKIP_MS, clock } from "../scenario";
import { Linked } from "../words";
import { useEnter } from "../motion";
import { recordAttempt } from "@core/state";
import { SPEECH_SKIP_TOP, SCENE_FOLLOWED } from "@core/speech";
import { fold } from "@core/util";

/* How much of the conversation has to be followed before its words count as
   met. In core/speech.js, which carries the number and why it is that number,
   because the simulator grades the same way and used to hold its own copy. */
const FOLLOWED = SCENE_FOLLOWED;

function Icon({ d, size = 22, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <Path d={d} />
    </Svg>
  );
}

const PLAY = "M7 4v16l13-8z";
const PAUSE = "M7 4h4v16H7zM13 4h4v16h-4z";
// An arrow curling back on itself: five seconds the other way.
const BACK = "M12 5V2L7 6l5 4V7a5.5 5.5 0 1 1-5.5 5.5H4A7.5 7.5 0 1 0 12 5z";

/* The transport. One big control that starts and stops, one that moves the
   position back, and the bar between them — nothing else earns a place here. */
function Transport({ s }) {
  const t = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <Pressable
          testID="scene-back"
          accessibilityRole="button"
          accessibilityLabel="Back five seconds"
          onPress={s.back}
          style={({ pressed }) => ({
            width: 52, height: 52, borderRadius: 26, alignItems: "center",
            justifyContent: "center", borderWidth: 1, borderColor: t.line,
            backgroundColor: pressed ? t.surface2 : t.surface,
          })}
        >
          <Icon d={BACK} color={t.ink2} />
          <Text style={{ color: t.ink3, fontSize: T.tiny, fontWeight: "700", marginTop: -2 }}>
            {Math.round(SKIP_MS / 1000)}
          </Text>
        </Pressable>
        <Pressable
          testID="scene-play"
          accessibilityRole="button"
          accessibilityLabel={s.playing ? "Pause" : "Play the conversation"}
          onPress={s.toggle}
          style={({ pressed }) => ({
            width: 72, height: 72, borderRadius: 36, alignItems: "center",
            justifyContent: "center", backgroundColor: t.brand,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon d={s.playing ? PAUSE : PLAY} size={30} color={t.brandOn} />
        </Pressable>
        {/* Three-quarter speed (PLAYBOOK 3.4). A toggle rather than a menu of
            rates: the question a listener has is "say that again, slower",
            and it wants one press. It shows what it will do, not what is on,
            in the same way the rest of the transport does. */}
        <Pressable
          testID="scene-slow"
          accessibilityRole="button"
          accessibilityState={{ selected: !!s.slow }}
          accessibilityLabel={s.slow ? "Play at full speed" : "Play slower"}
          onPress={s.toggleSlow}
          style={({ pressed }) => ({
            width: 52, height: 52, borderRadius: 26, alignItems: "center",
            justifyContent: "center", borderWidth: 1,
            borderColor: s.slow ? t.brand : t.line,
            backgroundColor: s.slow ? t.brandBg : pressed ? t.surface2 : t.surface,
          })}
        >
          <Text style={{ color: s.slow ? t.brandInk : t.ink2, fontSize: 13, fontWeight: "700" }}>
            {s.slow ? "1×" : "¾×"}
          </Text>
        </Pressable>
        <Pressable
          testID="scene-restart"
          accessibilityRole="button"
          accessibilityLabel="Play from the start"
          onPress={() => s.play(0)}
          style={({ pressed }) => ({
            width: 52, height: 52, borderRadius: 26, alignItems: "center",
            justifyContent: "center", borderWidth: 1, borderColor: t.line,
            backgroundColor: pressed ? t.surface2 : t.surface,
          })}
        >
          {/* A bar and a triangle, not a second curling arrow: the back button
              beside it is one already, and at 22 px the two were the same
              picture with a number under one of them. */}
          <Icon d="M7 6h2v12H7zM19 6v12l-9-6z" color={t.ink2} />
        </Pressable>
      </View>
      <Scrub s={s} />
    </View>
  );
}

/* The bar, made a control (the owner, 2026-09-11: *"I would like the bar to be
 * clickable to move the playhead… clickable and draggable is good"*).
 *
 * A tap moves the playhead; a drag scrubs. The whole 44 px strip is the target,
 * not the 8 px bar inside it (§25), and the thumb is what says so — a bar with
 * no thumb reads as a progress indicator, which is what this was.
 *
 * Seeking is not free here: a track resumes by opening a player at a new
 * position, so following every frame of a drag would open a player a frame. The
 * drag therefore moves a *local* position and the seek happens once, on
 * release — which is also why the conversation pauses under the finger and
 * carries on afterwards only if it was playing when it was grabbed. */
function Scrub({ s }) {
  const t = useTheme();
  const [drag, setDrag] = useState(null);
  const width = useRef(0);
  /* The handlers are made once and the scenario changes every render, so they
     read it through a ref. A PanResponder rebuilt mid-gesture drops the gesture. */
  const live = useRef(s);
  live.current = s;
  const resume = useRef(false);

  const msAt = (e) => msFor(e.nativeEvent.locationX, width.current, live.current.total);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      resume.current = live.current.playing;
      if (live.current.playing) live.current.pause();
      setDrag(msAt(e));
    },
    onPanResponderMove: (e) => setDrag(msAt(e)),
    onPanResponderRelease: (e) => {
      const to = msAt(e);
      setDrag(null);
      live.current.seek(to, resume.current);
    },
    onPanResponderTerminate: () => setDrag(null),
  })).current;

  const at = drag === null ? s.pos : drag;
  const frac = s.total ? Math.min(1, Math.max(0, at / s.total)) : 0;

  return (
    <View style={{ marginTop: 6 }}>
      <View
        testID="scene-scrub"
        accessibilityRole="adjustable"
        accessibilityLabel="Position in the conversation"
        onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
        {...pan.panHandlers}
        style={{ height: 44, justifyContent: "center" }}
      >
        <Bar value={frac} />
        <View pointerEvents="none"
              style={{ position: "absolute", left: `${frac * 100}%`, marginLeft: -8,
                       width: 16, height: 16, borderRadius: 8, backgroundColor: t.good,
                       borderWidth: 2, borderColor: t.surface }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Muted testID="scene-pos" size={T.tiny}>{clock(Math.min(at, s.total))}</Muted>
        <Muted size={T.tiny}>{clock(s.total)}</Muted>
      </View>
    </View>
  );
}

/* Who is speaking, while they speak. The names are the only thing on screen
   during playback, and they are what half the questions are about. */
function Cast({ cast, lines, at }) {
  const t = useTheme();
  const who = at >= 0 && lines[at] ? lines[at].s : null;
  if (!cast || cast.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 }}>
      {cast.map((c) => {
        const on = c.id === who;
        return (
          <View key={c.id} testID={`cast-${c.id}${on ? "-on" : ""}`}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm,
                         borderWidth: 1,
                         borderColor: on ? t.brand : t.line,
                         backgroundColor: on ? t.brandBg : "transparent" }}>
            <Text style={{ color: on ? t.brandInk : t.ink3, fontSize: T.small,
                           fontWeight: on ? "700" : "500" }}>
              {c.en || c.ru}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Question({ q, k, pick, onPick, answered }) {
  const t = useTheme();
  const anim = useEnter([], { delay: 40 + k * 40 });
  return (
    <View testID={`scene-q-${k}`} style={{ marginTop: 20 }}>
      <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "600", marginBottom: 8 }}>
        {q.ask}
      </Text>
      <View style={{ gap: 6 }}>
        {q.options.map((o, n) => {
          const on = pick === n;
          const border = answered ? (o.right ? t.good : on ? t.bad : t.line) : on ? t.brand : t.line;
          const bg = answered ? (o.right ? t.goodBg : on ? t.badBg : t.surface) : on ? t.brandBg : t.surface;
          return (
            <Pressable key={n} disabled={answered} onPress={() => onPick(n)}
                       accessibilityRole="button" accessibilityState={{ selected: on }}
                       style={{ backgroundColor: bg, borderColor: border, borderWidth: 1,
                                borderRadius: radius.md, paddingVertical: 11,
                                paddingHorizontal: 14, minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: t.ink, fontSize: q.cyr ? 18 : T.body }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Scene({ q, r }) {
  const { update } = useSession();
  const t = useTheme();
  const [picks, setPicks] = useState({});
  const lines = q.lines || [];
  const cast = q.cast || [];
  /* The lesson's key: which track this scenario owns, and — when there is no
     track — which pair of device voices it draws, the same on every replay. */
  const key = q.script || `${q.unit || ""}:${q.topic || ""}`;
  const s = useScenario(lines, cast, key);
  useEffect(() => () => { stop(); }, []);

  const allPicked = q.questions.every((_, k) => picks[k] !== undefined);

  /* Whose voice this is, counted rather than declared (§27). A written scenario
     is read by the device throughout — `speakLine` never reaches for a
     recording, because one studio line inside a conversation would change a
     speaker's voice mid-exchange. A corpus scene may be genuine recordings, and
     saying "device voice" over a real one is the same failure pointed the other
     way. */
  const real = q.scenario ? 0 : lines.filter((l) => hasRealAudio(l.ru)).length;
  /* A bought track is neither: it is synthesised, so it must not be presented as
     a recording from the collection, but it is not the phone reading either and
     saying "device voices" over it would be the same lie pointed the other way.
     The recorded line is the one that needs no note. */
  const bought = !!trackWhenCurrent(key, lines);
  const voiceNote = bought ? null
    : !hasRussianVoice() ? "No Russian voice on this phone"
    : real === lines.length && lines.length ? null
    : real ? "device voice for some lines"
    : cast.length > 1 ? "device voices" : "device voice";

  const check = () => {
    if (r.answered || !allPicked) return;
    const verdicts = q.questions.map((qq, k) => !!qq.options[picks[k]].right);
    const right = verdicts.filter(Boolean).length;

    /* Which words this counts as met. A scenario is judged whole: its content
       words are Good when the conversation was followed and graded not at all
       when it was not — a missed question says nothing about any one word. A
       corpus scene still grades per sentence, where a question really is about
       one sentence. */
    const grade = {};
    const put = (i, g) => { grade[i] = i in grade ? Math.min(grade[i], g) : g; };
    if (q.scenario) {
      if (right / verdicts.length >= FOLLOWED) {
        (q.lemmas || []).filter((i) => i >= SPEECH_SKIP_TOP).forEach((i) => put(i, 3));
      }
    } else {
      q.questions.forEach((qq, k) => {
        if (typeof qq.row === "number") {
          if (verdicts[k]) (lines[qq.row].lemmas || []).filter((i) => i >= SPEECH_SKIP_TOP).forEach((i) => put(i, 3));
        } else if (typeof qq.i === "number") {
          put(qq.i, verdicts[k] ? 3 : 1);
        }
      });
    }
    const words = Object.keys(grade).map((k) => ({ i: Number(k), grade: grade[k] }));
    r.record(right === verdicts.length, words, undefined, {
      credit: right / verdicts.length,
      note: right === verdicts.length ? null : `${right} of ${verdicts.length}`,
    });
    update((prev) => ({
      ...prev,
      speech: recordAttempt(prev.speech, {
        ts: Date.now(), key: fold(lines.length ? lines[0].ru : q.topic || ""),
        kind: "scene", unit: q.unit,
        target: lines.map((x) => x.ru).join(" "), right, of: verdicts.length,
        tags: [], grade: right === verdicts.length ? 3 : 1, plays: s.plays,
      }),
    }));
  };

  const speaker = (id) => {
    const c = cast.find((x) => x.id === id);
    return c ? (c.ru || c.en) : null;
  };

  return (
    <View>
      {/* The conversation's own title, above it and the size of a heading. It
          was 13 px of muted text under the transport, alongside the unit name,
          which is how a learner can listen to a scene and not know it had one
          (the owner, 2026-09-11: "Each should have a scenario title"). */}
      {q.topic ? (
        <Text testID="scene-title"
              style={{ color: t.ink, fontSize: T.title, fontWeight: "700",
                       textAlign: "center", marginBottom: 12 }}>
          {q.topic}
        </Text>
      ) : null}
      <Transport s={s} />
      <Cast cast={cast} lines={lines} at={s.at} />
      <Muted testID="scene-about" style={{ textAlign: "center", marginTop: 10 }}>
        {q.level}
      </Muted>
      {voiceNote ? (
        <Muted testID="scene-voice" style={{ textAlign: "center", marginTop: 2 }}>
          {voiceNote}
        </Muted>
      ) : null}

      {q.questions.map((qq, k) => (
        <Question key={k} q={qq} k={k} pick={picks[k]} answered={r.answered}
                  onPick={(n) => setPicks({ ...picks, [k]: n })} />
      ))}

      {r.answered ? (
        <View testID="scene-transcript"
              style={{ marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
          {lines.map((line, k) => (
            <View key={k} style={{ marginBottom: 12 }}>
              {speaker(line.s) ? (
                <Text style={{ color: t.ink3, fontSize: T.tiny, fontWeight: "700",
                               letterSpacing: 0.4, marginBottom: 2 }}>
                  {speaker(line.s).toUpperCase()}
                </Text>
              ) : null}
              <Linked text={line.ru} size={18} />
              <Muted>{line.en}</Muted>
            </View>
          ))}
        </View>
      ) : (
        <Btn kind="pri" label="Check" style={{ marginTop: 18 }} disabled={!allPicked} onPress={check} />
      )}
    </View>
  );
}

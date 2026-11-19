/* The video player: the transport over the picture, its settings sheet, and
   the page the transcript rolls under. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Linking, BackHandler, useWindowDimensions, Platform } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as ScreenOrientation from "expo-screen-orientation";
import { setStatusBarHidden } from "expo-status-bar";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius, space } from "../theme";
import { Screen, List, Row, Btn, Pill, Muted, Title, Sheet, Text, COG_PATH, RowText, ToggleRow } from "../ui";
import { markComponent, videoById, videoWatched, unitById, transcriptOf, transcriptEnOf, nextRoute, idxOfWord,
         goalOpts } from "../data";
import { tackOn } from "@core/queue";
import { StackActions } from "@react-navigation/native";
import { Transcript } from "../transcript";
import { useWords } from "../words";
import { libraryState, setLibraryState, openedVideo, setVideoPosition, videoPosition } from "../immerse";
import { releaseAudio } from "../audio";
import { useRemote } from "../remote";
import { today } from "@core/util";
import { newCard, cardFor } from "@core/scheduler";
import { short, minutes, clock, isFave, toggleFave, skipMsOf, DEFAULT_SKIP } from "../video";
import { Heart } from "./Immerse";

/* The player's own controls (the owner, 2026-10-01: "skip back 5 seconds,
   forward 5, play/pause (same button)… simple speed controls so the person
   doesn't have to interact with the video itself"). The speeds are the IFrame
   API's own steps; the label is the rate the player reports back. */
export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/* Two taps on one half of the picture inside this are a skip, YouTube's own
   gesture (the owner, 2026-11-18): the left half back, the right half
   forward, by the seconds set in Settings (video.js skipMsOf). */
const DOUBLE_TAP_MS = 300;
const FLASH_MS = 600;

/* What a press on the transport does. */
export function videoActions(player, rate, onRate) {
  const k = Math.max(0, VIDEO_SPEEDS.indexOf(rate));
  return {
    step: (d) => {
      const next = VIDEO_SPEEDS[Math.min(VIDEO_SPEEDS.length - 1, Math.max(0, k + d))];
      if (next === rate) return;
      onRate(next);
      if (player.current) player.current.rate(next);
    },
    skip: (ms) => { if (player.current) player.current.skip(ms, 0, 0); },
    toggle: () => { if (player.current) player.current.toggle(); },
  };
}

/* The transport over the picture, maximised or not (the owner, 2026-10-05:
   "use the overlay… even if it's not maximized (with the scroller too)"). A
   row of buttons under the player covered the subtitles and took a band of the
   screen; this sits in the corners instead.

   Two layers, by how often they are wanted:
   - always there: back and forward five seconds, bottom left, and a thin
     translucent bar along the foot of the picture — "The 5 second
     forward/back can always stay visible in the corner".
   - on a touch, for `OVERLAY_HIDE_MS`: play/pause in the middle, speed bottom
     right, the cog and maximise top right, and the bar's handle — "I only want
     the cursor/settings/speed to pop up for a short period of time when the
     user touches the screen (like one second)". While paused they stay, or
     there would be no way to see how to start it again.

   White on a dark veil, whatever the theme: they sit on the video, not on the
   app. The position arrives through `onTick` rather than a prop, so four
   reports a second redraw this and nothing else on the screen. */
const OVERLAY_HIDE_MS = 1500;
const SCRUB_PAD = 10;          // the bar's inset from the picture's sides
function OverlayButton({ testID, label, onPress, children, size = 40 }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label}
               onPress={onPress} hitSlop={6}
               style={({ pressed }) => ({ minWidth: size, height: size, borderRadius: size / 2, paddingHorizontal: 8,
                 alignItems: "center", justifyContent: "center",
                 backgroundColor: pressed ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.42)" })}>
      {children}
    </Pressable>
  );
}

/* The thin bar: where the video is, and a place to drag to somewhere else.
   The seek happens on release, once — a seek per move would make the player
   chase the finger and stutter. */
function Scrubber({ pos, len, active, onSeek, onTouch }) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(null);
  const frac = (x) => Math.min(1, Math.max(0, x / Math.max(1, width)));
  const shown = drag !== null ? drag : (len > 0 ? Math.min(1, pos / len) : 0);
  const thick = active || drag !== null;
  return (
    <View testID="overlay-scrub" accessibilityRole="adjustable" accessibilityLabel="Position in the video"
          accessibilityValue={{ min: 0, max: Math.round(len / 1000), now: Math.round(pos / 1000) }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => len > 0}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => { onTouch(); setDrag(frac(e.nativeEvent.locationX)); }}
          onResponderMove={(e) => { onTouch(); setDrag(frac(e.nativeEvent.locationX)); }}
          onResponderRelease={(e) => {
            const f = frac(e.nativeEvent.locationX);
            setDrag(null);
            onSeek(Math.round(f * len));
          }}
          onResponderTerminate={() => setDrag(null)}
          /* The line sits on the picture's very edge: YouTube draws its
             subtitles just above the bottom, and a line through the middle of
             this touch strip ran through them (the emulator, 2026-10-05). */
          style={{ position: "absolute", left: SCRUB_PAD, right: SCRUB_PAD, bottom: 0, height: 22,
                   justifyContent: "flex-end", paddingBottom: 2 }}>
      <View pointerEvents="none"
            style={{ height: thick ? 4 : 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" }}>
        <View style={{ width: `${shown * 100}%`, height: "100%", borderRadius: 2,
                       backgroundColor: "rgba(255,255,255,0.6)" }} />
      </View>
      {thick ? (
        <View pointerEvents="none"
              style={{ position: "absolute", bottom: 0, left: shown * width - 5, width: 10, height: 10, borderRadius: 5,
                       backgroundColor: "rgba(255,255,255,0.9)" }} />
      ) : null}
    </View>
  );
}

/* The maximise glyph, and its way back. */
const MAXIMISE = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
const MINIMISE = "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5";

export function VideoOverlay({ player, playing, rate, onRate, onTick, length = 0, full, onFull, onCog,
                               skipMs = DEFAULT_SKIP * 1000 }) {
  const { step, skip, toggle } = videoActions(player, rate, onRate);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(length);
  const timer = useRef(null);
  useEffect(() => onTick && onTick((ms, l) => { setPos(ms); if (l > 0) setLen(l); }), [onTick]);
  const poke = () => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), OVERLAY_HIDE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  /* The double tap: which half, and when. A second tap on the same half
     inside DOUBLE_TAP_MS skips and flashes the amount on that half for a
     moment; a single tap shows or hides the controls as it always did. */
  const [width, setWidth] = useState(0);
  const lastTap = useRef({ t: 0, side: null });
  const [flash, setFlash] = useState(null);                 // { side, text }
  const flashTimer = useRef(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const secs = Math.round(skipMs / 1000);
  const onPictureTap = (e) => {
    const x = e && e.nativeEvent ? e.nativeEvent.locationX : undefined;
    const side = width > 0 && typeof x === "number" ? (x < width / 2 ? "left" : "right") : null;
    const now = Date.now();
    if (side && lastTap.current.side === side && now - lastTap.current.t < DOUBLE_TAP_MS) {
      lastTap.current = { t: 0, side: null };
      skip(side === "left" ? -skipMs : skipMs);
      setFlash({ side, text: `${side === "left" ? "−" : "+"}${secs}s` });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
      poke();
      return;
    }
    lastTap.current = { t: now, side };
    if (shown && playing) setShown(false); else poke();
  };
  // Paused, the controls stay; playing, they leave shortly after a touch.
  const up = shown || !playing;
  const press = (fn) => () => { fn(); poke(); };
  const white = "#fff";
  const icon = (d, size = 20) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={white} strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
  );
  const label = (s) => <Text style={{ color: white, fontSize: 13, fontWeight: "700" }}>{s}</Text>;
  const corner = { position: "absolute", flexDirection: "row", alignItems: "center", gap: 6 };
  const edge = full ? 16 : 8;
  return (
    <View testID="video-overlay" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* The picture: a tap shows the controls, or hides them when they are up. */}
      <Pressable testID="overlay-touch" accessibilityLabel="Show controls"
                 accessibilityHint={`Double tap the left half to go back ${secs} seconds, the right half to go forward`}
                 style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                 onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
                 onPress={onPictureTap} />
      {flash ? (
        <View pointerEvents="none"
              style={{ position: "absolute", top: 0, bottom: 0, [flash.side]: 0, width: "50%",
                       alignItems: "center", justifyContent: "center" }}>
          <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99,
                         backgroundColor: "rgba(0,0,0,0.55)" }}>
            <Text testID="overlay-flash" style={{ color: white, fontSize: 17, fontWeight: "700" }}>{flash.text}</Text>
          </View>
        </View>
      ) : null}
      <View style={[corner, { bottom: 18, left: edge }]}>
        <OverlayButton testID="overlay-back5" label={`Back ${secs} seconds`} onPress={press(() => skip(-skipMs))}>{label(`−${secs}s`)}</OverlayButton>
        <OverlayButton testID="overlay-fwd5" label={`Forward ${secs} seconds`} onPress={press(() => skip(skipMs))}>{label(`+${secs}s`)}</OverlayButton>
      </View>
      {up ? (
        <>
          <View pointerEvents="box-none"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                         alignItems: "center", justifyContent: "center" }}>
            <OverlayButton testID="overlay-toggle" label={playing ? "Pause" : "Play"} size={52} onPress={press(toggle)}>
              {playing ? icon("M9 5v14M15 5v14", 24)
                : <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M7 5l12 7-12 7z" fill={white} /></Svg>}
            </OverlayButton>
          </View>
          <View style={[corner, { top: edge, right: edge }]}>
            <OverlayButton testID="overlay-cog" label="Video settings" onPress={() => { onCog(); poke(); }}>{icon(COG_PATH)}</OverlayButton>
            <OverlayButton testID={full ? "overlay-exit" : "video-maximise"} label={full ? "Exit full screen" : "Full screen"}
                           onPress={() => { onFull(!full); poke(); }}>{icon(full ? MINIMISE : MAXIMISE)}</OverlayButton>
          </View>
          <View style={[corner, { bottom: 18, right: edge }]}>
            <OverlayButton testID="overlay-slower" label="Slower" onPress={press(() => step(-1))}>{icon("M6 12h12")}</OverlayButton>
            <Text testID="overlay-rate" accessibilityLabel={`Speed ${rate} times`}
                  style={{ color: white, fontSize: 13, fontWeight: "700", minWidth: 34, textAlign: "center",
                           textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 }}>{`${rate}×`}</Text>
            <OverlayButton testID="overlay-faster" label="Faster" onPress={press(() => step(1))}>{icon("M12 6v12M6 12h12")}</OverlayButton>
          </View>
        </>
      ) : null}
      <Scrubber pos={pos} len={len} active={up} onTouch={poke}
                onSeek={(ms) => { setPos(ms); if (player.current) player.current.seekTo(ms); }} />
    </View>
  );
}

/* The cog's sheet (the owner, 2026-10-05: "just a little watch on YouTube
   button there and subtitle controls"). Resolution and audio-only are not
   here because the embedded player offers neither. */
export function VideoSettings({ videoId, at, captions, onCaptions, onClose }) {
  const t = useTheme();
  return (
    <Sheet testID="video-settings" onClose={onClose}
           footer={<Btn block kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />}>
      <List>
        <ToggleRow title="Subtitles" testID="video-captions" value={captions} onValueChange={onCaptions} />
        <Row testID="video-youtube"
             onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor((at || 0) / 1000)}s`)}>
          <RowText title="Watch on YouTube" bold={false} />
        </Row>
      </List>
    </Sheet>
  );
}

/* Five seconds of lead-in, ten seconds of playback: enough to hear the run-up to
   the word rather than landing on top of it. */
const LEAD_MS = 5000;
const HOLD_MS = 10000;
// A sentence is played from just before it, and not stopped: it is heard in its place.
const LINE_LEAD_MS = 800;

/* Opened from a dictionary entry at a moment (`word`, `at`): the word is the
   focus from the start, at that occurrence. */
function focusAt(v, params) {
  const occ = params.word && v.words[params.word];
  if (!occ || !occ.length) return null;
  const k = Math.max(0, occ.findIndex((o) => o.t === params.at));
  return { word: params.word, k, n: occ.length, ...occ[k] };
}

/* What the screen shows for a route: the library entry, or for a unit's episode
   the entry with the unit's own heard words first — every word the unit teaches
   that the episode says, then what else it says. Never a word it does not say. */
export function videoFor(params) {
  const unit = params.unitId ? unitById(params.unitId) : null;
  let v = params.videoId ? videoById(params.videoId)
        : unit && unit.v ? (videoById(unit.v.id) || {
            id: unit.v.id, title: unit.v.title, ch: unit.v.ch, dur: unit.v.dur, words: {} })
        : null;
  if (!v) return null;
  const owner = v.unit ? unitById(v.unit) : unit;
  if (owner && owner.v && owner.v.id === v.id && owner.v.heard) {
    const words = { ...owner.v.heard };
    for (const w in (v.words || {})) if (!(w in words)) words[w] = v.words[w];
    v = { ...v, unit: owner.id, words };
  }
  return v;
}

export function Video({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const wordsCtx = useWords();
  const params = route.params || {};
  const v = videoFor(params);
  const [focus, setFocus] = useState(() => (v ? focusAt(v, params) : null));
  /* Opened at a moment with no word to focus — a sentence from the video
     (prep.js VideoLines): the player starts a breath before it and plays on. */
  const at = !focus && typeof params.at === "number" ? params.at : null;
  /* Otherwise it picks up where it was stopped (immerse.js; the owner,
     2026-10-01: "continue exactly where you're at"). The video plays on
     arrival (the owner, 2026-10-06: "start automatically playing the video
     (no play video button)"); the summary before it is where one decides. */
  const resumeAt = useMemo(() => (v && !focus && at === null ? videoPosition(v.id) : 0), [v && v.id]);
  const [playing, setPlaying] = useState(true);
  // Whether the video itself is playing, and how fast, as the player reports.
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(1);
  const player = useRef(null);
  // A moment asked for before the player exists is held for onReady.
  const pending = useRef(focus ? [Math.max(0, focus.t - LEAD_MS), HOLD_MS]
                         : at !== null ? [Math.max(0, at - LINE_LEAD_MS), 0]
                         : resumeAt ? [resumeAt, 0] : null);
  useEffect(() => { if (v) openedVideo(v.id); }, [v && v.id]);
  /* The audio on this screen belongs to the video, not to us. Whatever a lesson
     left holding the session is handed back before the player loads, or the
     WebView plays silently and has no way to say why (the owner, 2026-09-10).
     Done here rather than only on the way out of a lesson because the order of
     unmount and mount is not ours to rely on. */
  useEffect(() => { releaseAudio(); }, []);
  /* English under the transcript: on unless the learner turned it off (the
     owner, 2026-10-05: "by default it will track and show the English"),
     the choice kept with the library's. */
  const [showEn, setShowEn] = useState(() => libraryState().en !== false);
  const [pos, setPos] = useState(0);
  /* Maximised: the same player — it is never remounted, so it keeps playing
     where it was. Held upright, the video takes the top half and the
     transcript the bottom; turned sideways, the video takes the whole screen
     (the owner, 2026-10-05). The header, tab bar and status bar get out of
     the way either way, and Back leaves full screen before the video. */
  const [full, setFull] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const sideways = winW > winH;
  const halfScript = full && !sideways;
  // The transcript follows the position except while the picture fills the screen.
  const scriptOn = useRef(false);
  scriptOn.current = !(full && sideways);
  // The overlay's position, outside React's tree: four a second would
  // otherwise redraw the whole page under the player.
  const ticks = useRef(new Set());
  const onTick = useCallback((f) => { ticks.current.add(f); return () => ticks.current.delete(f); }, []);
  const lastAt = useRef(0);
  const onTime = (ms, len) => {
    lastAt.current = ms;
    if (v) setVideoPosition(v.id, ms, len || (v.dur ? v.dur * 1000 : 0));
    for (const f of ticks.current) f(ms, len);
    if (scriptOn.current) setPos(ms);
  };
  /* Subtitles: YouTube's Russian captions, on unless turned off in the cog
     ("Ensure subtitles are default turned on"); kept with the library's state. */
  const [captions, setCaptions] = useState(() => libraryState().cc !== false);
  const [cog, setCog] = useState(false);
  const setCc = (on) => {
    setCaptions(on);
    setLibraryState({ cc: on });
    if (player.current) player.current.captions(on);
  };
  useEffect(() => {
    if (player.current) player.current.watch(playing);
    return () => { if (player.current) player.current.watch(false); };
  }, [playing]);
  /* The tab bar is not touched here: Video is a run (fullscreen.js), so the
     tabs are already hidden. Setting `tabBarStyle` on the parent from here
     overrode App.js's computed style for good — a key set to undefined still
     overrides — and left that tab's bar unstyled after one full-screen view. */
  useEffect(() => {
    if (full) {
      /* Free to turn: upright is the half-and-half view, sideways the picture
         alone. On Android by the sensor (SCREEN_ORIENTATION_SENSOR, 4), which
         turns whatever the phone's rotation lock says, as a video player
         should, and not upside down — `ALL` is full-sensor and on the
         emulator stood the video on its head. */
      (Platform.OS === "android"
        ? ScreenOrientation.lockPlatformAsync({ screenOrientationConstantAndroid: 4 })
        : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL)).catch(() => {});
      setStatusBarHidden(true, "fade");
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    }
    const back = full ? BackHandler.addEventListener("hardwareBackPress", () => { setFull(false); return true; }) : null;
    return () => {
      if (back) back.remove();
      if (!full) return;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      setStatusBarHidden(false, "fade");
      // Every stack registers Video with its header shown (titled, App.js).
      navigation.setOptions && navigation.setOptions({ headerShown: true });
    };
  }, [full]);
  // Full screen belongs to a playing video; if the player goes away, so does it.
  useEffect(() => { if (!playing && full) setFull(false); }, [playing, full]);
  /* A headset's or a car's keys, on the transport's own buttons (the owner,
     2026-11-17): play/pause on the player's, skip on back and forward five
     seconds (src/remote.js). The WebView has no media session of its own, so
     without this nothing outside the screen could reach the video. */
  const skipMs = skipMsOf(st);
  useRemote(!!v && playing, v ? v.title : "", running, {
    toggle: () => { if (player.current) player.current.toggle(); },
    play: () => { if (player.current && !running) player.current.toggle(); },
    pause: () => { if (player.current) player.current.pause(); },
    forward: () => { if (player.current) player.current.skip(skipMs, 0, 0); },
    back: () => { if (player.current) player.current.skip(-skipMs, 0, 0); },
  });
  if (!v) return null;
  const script = transcriptOf(v.id);
  const seekTo = (ms) => {
    setPlaying(true);
    setPos(ms);
    if (player.current) player.current.seek(ms, 0);
    else pending.current = [ms, 0];
  };

  const unit = v.unit ? unitById(v.unit) : null;
  const watched = videoWatched(st, v);
  const mined = st.mined || {};

  /* Mining a word: into the review set, with the video and the second it was
     said, so nothing about where it came from is lost. Keyed on the Russian
     string like every other piece of learner state (rule 20.4).

     "Add to review" has to mean the scheduler owns it. `pinned` alone did not:
     its only reader is the Study picker's Trouble set, so a mined word was
     never due, never counted by "Review · N due", and never topped a quiz up —
     the button reported something that had not happened. So the word also gets
     a card, new and due today, exactly the shape the v1 migration gives a word
     with no measured memory. An existing card is left alone: mining a word you
     are already studying must not reset its schedule. */
  const mine = (f) => update((prev) => {
    const seen = { ...(prev.seen || {}) };
    if (!seen[f.word]) {
      seen[f.word] = { recognise: newCard(Date.now()) };
    }
    return {
      ...prev,
      seen,
      pinned: (prev.pinned || []).includes(f.word) ? prev.pinned
        : (prev.pinned || []).concat([f.word]),
      mined: { ...(prev.mined || {}), [f.word]: { v: v.id, t: f.t, s: f.s } },
    };
  });

  const jump = (ms, hold = HOLD_MS) => {
    const at = Math.max(0, ms - (hold ? LEAD_MS : 0));
    if (player.current) player.current.seek(at, hold);
    else pending.current = [at, hold];      // the player is still mounting; run it on ready
  };

  /* Continue marks the video watched and goes on to its questions; with none,
     back to wherever the summary was opened from. A unit's episode also
     counts for its lessons. Opened through the summary, the questions' end
     pops past it too. */
  const finish = () => {
    /* The state as it will be once this video is marked — computed once, from
       `st`, and handed to the store; the update has not landed when `onward`
       is read, so it is read off the same value. */
    const own = unit && unit.v && unit.v.id === v.id;
    const marked = (s) => {
      let next = { ...s, watched: { ...(s.watched || {}), [v.id]: today() } };
      /* The words this video says that the learner has not met join today's
         pile (core/queue.js tackOn; the owner, 2026-11-19: "any time a user
         gets exposed to new words in an immersion video, that can become part
         of their main stack… flag those words as eligible for the person's
         general review stack"). The cards before the video (VideoSummary's
         list round) are a separate thing and unchanged. */
      const fresh = Object.keys(v.words || {}).filter((w) => idxOfWord(w) >= 0 && !cardFor((s.seen || {})[w]));
      next = tackOn(next, fresh, Date.now(), goalOpts(next));
      return own ? markComponent(next, unit, params.index || 0, "video") : next;
    };
    update(marked);
    if (player.current) player.current.pause();
    const behind = params.viaSummary ? 2 : 1;
    /* A unit's video with no questions goes on along the path, as its
       questions' Continue does (2026-10-09). */
    const onward = own ? nextRoute(marked(st)) : null;
    if (v.quiz && v.quiz.length) {
      navigation.navigate("VideoQuiz",
        { videoId: v.id, unitId: params.unitId, index: params.index, depth: behind + 1 });
    } else if (onward && navigation.pop) {
      navigation.pop(behind);
      navigation.dispatch(StackActions.push(...onward));
    } else if (navigation.pop) navigation.pop(behind);
    else navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* The player sits above the scrolling page once it plays, so the
          video stays in view while the transcript or the word list is read,
          and so maximising it is a change of style rather than a new player
          (a WebView moved to another parent reloads, and the video with it). */}
      {playing ? (
        <View testID={full ? "video-full" : "video-pinned"}
              style={full
                ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10,
                    backgroundColor: "#000" }
                : { paddingHorizontal: space.pad, paddingTop: space.pad, paddingBottom: 4, backgroundColor: t.bg }}>
          <View style={full && sideways ? { flex: 1, backgroundColor: "#000" }
                       : full ? { backgroundColor: "#000" }
                       : { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000" }}>
            <View style={full && !sideways ? { width: "100%", aspectRatio: 16 / 9 } : { flex: 1 }}>
              <YouTube
                ref={player}
                videoId={v.id}
                captions={captions}
                onTime={onTime}
                onState={setRunning}
                onRate={setRate}
                onReady={(len) => {
                  if (len > 0) for (const f of ticks.current) f(lastAt.current, len);
                  if (pending.current != null) {
                    player.current && player.current.seek(pending.current[0], pending.current[1]);
                    pending.current = null;
                  }
                  if (player.current) player.current.watch(true);
                }}
              />
              <VideoOverlay player={player} playing={running} rate={rate} onRate={setRate}
                            onTick={onTick} length={v.dur ? v.dur * 1000 : 0} skipMs={skipMs}
                            full={full} onFull={setFull} onCog={() => setCog(true)} />
            </View>
          </View>
          {halfScript ? (
            <View testID="video-half-script" style={{ flex: 1, backgroundColor: t.bg, paddingHorizontal: space.pad }}>
              {script && script.length
                ? <Transcript fill lines={script} position={pos} onSeek={seekTo}
                              en={transcriptEnOf(v.id)} showEn={showEn}
                              onToggleEn={() => { setShowEn(!showEn); setLibraryState({ en: !showEn }); }}
                              onWord={(w) => { if (player.current) player.current.pause(); if (wordsCtx) wordsCtx.open(w); }} />
                : <Muted style={{ marginTop: 12 }}>No transcript for this one.</Muted>}
            </View>
          ) : null}
        </View>
      ) : null}
      {cog ? <VideoSettings videoId={v.id} at={lastAt.current} captions={captions}
                            onCaptions={setCc} onClose={() => setCog(false)} /> : null}
    {/* The page is the player and the transcript rolling under it, and one
        way on (the owner, 2026-10-05: "video page just have the video player
        and the transcript rolling… at the bottom of the page, there will be a
        continue button"). What the video holds — its words, their scores,
        its sentences — is the next screen, VideoSummary; its questions the
        one after. */}
    <Screen scroll={false} fill footer={
      <Btn block kind="pri" testID="video-continue" label="Continue" onPress={finish} />}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title sub={[v.ch, minutes(v.dur), unit ? unit.name : null, watched ? "watched" : null].filter(Boolean).join(" · ")}>
            {short(v.title)}
          </Title>
        </View>
        <Heart on={isFave(st, v.id)} testID={`fave-${v.id}`} size={44}
               onPress={() => update((p) => toggleFave(p, v.id))} />
      </View>
      {/* Picked up where it was stopped, with the way back to the beginning
          (the owner, 2026-10-05: "the option to start from beginning or to
          resume"). */}
      {resumeAt ? (
        <Btn kind="ghost" testID="video-restart" label="From the start" style={{ alignSelf: "flex-start" }}
             onPress={() => { if (player.current) player.current.seek(0, 0); else pending.current = [0, 0]; }} />
      ) : null}
      {/* A word opened from the dictionary's "Heard in" (`word`, `at`): the
          moment, once more, and the word into review (ROADMAP P10.4). */}
      {focus ? (
        <View testID="video-focus" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Pill tone="brand">{clock(focus.t)}</Pill>
          <Btn kind="ghost" label="Play it again" onPress={() => { setPlaying(true); jump(focus.t); }} />
          <View style={{ flex: 1 }} />
          {mined[focus.word]
            ? <Muted testID="mined">Added to review</Muted>
            : <Btn testID="mine" label="Add to review" onPress={() => mine(focus)} />}
        </View>
      ) : null}

      {/* The transcript, always (the owner: "the transcript automatically
          shows below"), following the video and with its English unless the
          learner has turned either off. */}
      {!halfScript ? (
        script && script.length
          ? <Transcript fill lines={script} position={pos} onSeek={seekTo}
                        en={transcriptEnOf(v.id)} showEn={showEn}
                        onToggleEn={() => { setShowEn(!showEn); setLibraryState({ en: !showEn }); }}
                        onWord={(w) => { if (player.current) player.current.pause(); if (wordsCtx) wordsCtx.open(w); }} />
          : <Muted style={{ marginTop: 8 }}>No transcript for this one.</Muted>
      ) : null}
    </Screen>
    </View>
  );
}

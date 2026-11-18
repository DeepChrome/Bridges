/* External controls — a headset's buttons, a car's, a Bluetooth remote — on
 * the controls a screen already has (the owner, 2026-11-17: "make those
 * rewind 5 forward five buttons connect to external controllers… don't make
 * new buttons, just make them work with the 2 buttons on there already").
 *
 * `useRemote` is the one way a screen takes the keys: while `on`, the native
 * bridge (modules/ya-remote) holds a media session in the app's name, and
 * every press lands here and is routed to the handlers the screen gave —
 * play / pause / toggle to its own play-pause, next and fast-forward to
 * `forward`, previous and rewind to `back`. A headset's skip keys are its
 * next and previous; a car's are sometimes seek. Both pairs land on the same
 * two buttons, because those are the two the screen has.
 *
 * One screen is in charge at a time, the last to mount. With none — a key
 * pressed while a lesson's clip plays, which the expo-audio patch forwards
 * here rather than letting the clip's session swallow it — pause and toggle
 * stop the app's sound, and the rest do nothing.
 */
import { useEffect, useRef } from "react";
import * as Remote from "../modules/ya-remote";
import { stop as stopAudio } from "./audio";

/* The keys: play · pause · toggle · next · previous · forward · rewind. */
let inCharge = null;        // the ref of the screen holding the keys
let listening = null;

function call(h, name) {
  if (h && typeof h[name] === "function") { h[name](); return true; }
  return false;
}

/* A press, routed. Exported for the bridge and for tests. */
export function remoteKey(key) {
  const h = inCharge && inCharge.current;
  if (!h) {
    if (key === "pause" || key === "toggle") stopAudio();
    return;
  }
  switch (key) {
    case "play": call(h, "play") || call(h, "toggle"); break;
    case "pause": call(h, "pause") || call(h, "toggle"); break;
    case "toggle": call(h, "toggle"); break;
    case "next": case "forward": call(h, "forward"); break;
    case "previous": case "rewind": call(h, "back"); break;
    default: break;
  }
}

/* The screen's handlers are read at press time, so a stale closure cannot
   act on a state the screen has left. */
export function useRemote(on, title, playing, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!on) return undefined;
    inCharge = ref;
    if (!listening) listening = Remote.onKey(remoteKey);
    Remote.start(title, playing);
    return () => {
      if (inCharge === ref) inCharge = null;
      Remote.stop();
    };
  }, [on]);
  useEffect(() => { if (on) Remote.setPlaying(playing); }, [on, playing]);
  useEffect(() => { if (on) Remote.setTitle(title); }, [on, title]);
}

/* Tests start each case with nobody in charge. */
export function resetRemote() { inCharge = null; }

/* Hold-to-speak, as one hook, so Say and Talk cannot drift.
 *
 * The recogniser runs on the device — audio never leaves the phone — and reports
 * partials while the button is held and one final result after it is released.
 * Everything that was learned building Say lives here: the phase in a ref as well
 * as state (the recogniser's events need the current value, not their closure's);
 * a release that lands before the permission prompt resolves; "end" arriving with
 * no final result, in which case the last partial is the result; the two ways it
 * can be blocked before it starts — no microphone permission, no offline Russian
 * model — each named plainly.
 *
 *   const rec = useRecognizer({ onFinal(transcript, latencyMs) });
 *   rec.phase        idle | asking | listening
 *   rec.live         the partial transcript while listening
 *   rec.note         "Nothing heard" and the like; clears on the next hold
 *   rec.block        null | { why: mic | model | engine, text }
 *   rec.hold() / rec.release() / rec.getModel() / rec.clearBlock()
 */

import { useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule as M, useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export const LANG = "ru-RU";

export function useRecognizer({ onFinal, onError, enabled = true } = {}) {
  const [phase, setPhase] = useState("idle");
  const phaseRef = useRef("idle");
  const go = (p) => { phaseRef.current = p; setPhase(p); };
  const [live, setLiveState] = useState("");
  const liveRef = useRef("");
  const setLive = (s) => { liveRef.current = s; setLiveState(s); };
  const [note, setNote] = useState(null);
  const [block, setBlock] = useState(null);
  const releasedAt = useRef(0);
  const releasedEarly = useRef(false);
  const cb = useRef({ onFinal, onError });
  cb.current = { onFinal, onError };

  const finish = (text) => {
    go("idle");
    if (cb.current.onFinal) cb.current.onFinal(text, Date.now() - releasedAt.current);
  };

  useSpeechRecognitionEvent("result", (ev) => {
    if (phaseRef.current !== "listening") return;
    const text = ev.results && ev.results[0] ? ev.results[0].transcript : "";
    if (ev.isFinal) finish(text);
    else setLive(text);
  });
  useSpeechRecognitionEvent("error", (ev) => {
    if (phaseRef.current !== "listening") return;
    go("idle");
    const what = `${ev.error} ${ev.message || ""}`;
    if (/not-supported|not downloaded/i.test(what)) {
      setBlock({ why: "model", text: "Russian is not installed for offline recognition." });
    } else if (ev.error === "no-speech") {
      setNote("Nothing heard");
    } else {
      setBlock({ why: "engine", text: `Recognition failed: ${ev.error}` });
    }
    if (cb.current.onError) cb.current.onError(ev.error, Date.now() - releasedAt.current);
  });
  useSpeechRecognitionEvent("end", () => {
    if (phaseRef.current !== "listening") return;
    // Ended without a final result. The last partial is what the recogniser had,
    // so use that rather than throw the attempt away; with nothing at all heard,
    // back to idle and let the learner try again.
    if (liveRef.current) finish(liveRef.current);
    else go("idle");
  });

  const hold = async () => {
    if (!enabled || phaseRef.current !== "idle") return;
    setLive(""); setNote(null);
    releasedEarly.current = false;
    go("asking");
    let perm;
    try { perm = await M.requestPermissionsAsync(); } catch (e) { perm = { granted: false }; }
    if (!perm.granted) {
      go("idle");
      setBlock({ why: "mic", text: "The microphone is off for Bridges." });
      return;
    }
    if (releasedEarly.current) { go("idle"); return; }
    go("listening");
    try {
      M.start({ lang: LANG, requiresOnDeviceRecognition: true, interimResults: true,
                maxAlternatives: 1, continuous: false });
    } catch (e) {
      go("idle");
      setBlock({ why: "engine", text: `Recognition failed: ${e.message || e}` });
    }
  };

  const release = () => {
    releasedAt.current = Date.now();
    if (phaseRef.current === "listening") {
      try { M.stop(); } catch (e) { /* the end event still arrives */ }
    } else {
      releasedEarly.current = true;
    }
  };

  /* Android 13+ only: opens the system's model-download dialog. */
  const getModel = async () => {
    try { await M.androidTriggerOfflineModelDownload({ locale: LANG }); } catch (e) { /* stays blocked */ }
  };

  return { phase, live, note, block, hold, release, getModel,
           clearBlock: () => setBlock(null), setLive };
}

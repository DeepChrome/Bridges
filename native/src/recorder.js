/* Short recordings for a tester's report (2026-10-05: "if it's a pronunciation
 * thing, they can record the better pronunciation but capture multiple
 * recordings").
 *
 * Small mono AAC, so five clips of half a minute travel in one request. The
 * microphone is asked for at the first press, never before (§30c's rule).
 * Whatever is playing stops first — a recording of the app's own speaker is
 * not what anyone wants — and the session goes back to playback afterwards. */

import { useEffect, useRef, useState } from "react";
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import { releaseAudio, rearmAudio } from "./audio";

export const CLIP_MAX_S = 30;
export const CLIPS_MAX = 5;
const OPTIONS = {
  extension: ".m4a",
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: "aac ", audioQuality: 64, linearPCMBitDepth: 16,
         linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

/* `clips` is a list of { uri, ms }; `start` and `finish` drive one recording;
   `state` is idle | asking | recording | denied. */
export function useClips() {
  const rec = useAudioRecorder(OPTIONS);
  const [clips, setClips] = useState([]);
  const [state, setState] = useState("idle");
  const [ms, setMs] = useState(0);
  const began = useRef(0);
  const tick = useRef(null);

  const finish = async () => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    if (state !== "recording") return;
    const took = Date.now() - began.current;
    try { await rec.stop(); } catch (e) { /* stopped already */ }
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    rearmAudio();                     // the next sound sets the playback mode afresh
    setState("idle");
    setMs(0);
    if (rec.uri && took > 400) setClips((c) => c.concat([{ uri: rec.uri, ms: took }]).slice(0, CLIPS_MAX));
  };

  const start = async () => {
    if (state === "recording" || clips.length >= CLIPS_MAX) return;
    setState("asking");
    const p = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!p || !p.granted) { setState("denied"); return; }
    releaseAudio();
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync();
      rec.record();
    } catch (e) { setState("idle"); return; }
    began.current = Date.now();
    setMs(0);
    setState("recording");
    tick.current = setInterval(() => setMs(Date.now() - began.current), 250);
  };

  // Half a minute is a clip; past it, it ends by itself.
  useEffect(() => {
    if (state === "recording" && ms >= CLIP_MAX_S * 1000) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, state]);
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    try { if (rec.isRecording) rec.stop(); } catch (e) { /* gone */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = (k) => setClips((c) => c.filter((_, j) => j !== k));
  return { clips, state, ms, start, finish, remove };
}

/* The clips as base64, for the report. A clip that cannot be read is left
   out rather than failing the report. */
export async function clipData(clips) {
  const out = [];
  for (const c of clips) {
    try { out.push(await new File(c.uri).base64()); } catch (e) { /* unreadable */ }
  }
  return out;
}

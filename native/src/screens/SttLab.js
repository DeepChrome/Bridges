/* STT Lab — a developer-mode screen for measuring speech recognition (ROADMAP P3.2).
 *
 * Nothing in Phase 5 is worth building unless on-device Russian recognition is good
 * enough on the owner's own voice, and that is a number, not an assumption. This
 * screen shows one sentence from the fixed test set, listens through the platform
 * recogniser with on-device recognition required, and scores the transcript against
 * the sentence with core/compare.js. Every attempt — final result or error — is
 * recorded in the learner state's speech slot as kind "lab", for export.
 *
 * Not a learner feature. It is reachable only from the settings sheet with developer
 * mode on, and it renders a plain refusal otherwise.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Share, Switch } from "react-native";
import {
  ExpoSpeechRecognitionModule, useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Card, Btn, Muted, Pill, Speaker } from "../ui";
import { Alignment } from "../activities/Alignment";
import { STT_SET } from "../sttset";
import { compare } from "@core/compare";
import { refreshVoices, russianVoices, voiceSex } from "../audio";
import { isSilentVoice } from "@core/voices";
import { recordAttempt } from "@core/state";
import { fold } from "@core/util";

const LANG = "ru-RU";
const SRC_NAME = { t: "Tatoeba", l: "Languages on Fire", y: "Yandex", c: "Core 5000" };

/* What Russian voices this phone has, and what the app makes of each.
 *
 * A scenario is read by the device's voices (§30l), one per speaker by sex,
 * and which voices a phone has is the thing that decides whether that works —
 * but it is invisible from here and unanswerable from a desk. The owner heard
 * the first build and said "Masha clearly sounds like a guy"; this readout is
 * what he then listened through to produce the table in `core/voices.js`.
 *
 * It stays because the next unfamiliar device needs the same treatment, and
 * because a voice that is listed and silent can be found no other way. The lab
 * is developer-mode only, which is where a diagnostic belongs. */
function Voices() {
  const t = useTheme();
  const [voices, setVoices] = useState(null);
  useEffect(() => { refreshVoices().then(() => setVoices(russianVoices())); }, []);
  if (!voices) return null;
  const label = { f: "woman", m: "man" };
  const unknown = voices.filter((v) => !voiceSex(v) && !isSilentVoice(v.identifier));
  return (
    <Card>
      <Muted size={12}>{`${voices.length} Russian voices`}</Muted>
      {voices.map((v, k) => (
        <Text key={v.identifier} style={{ color: t.ink2, fontSize: 11, marginTop: 3 }}>
          {`${k + 1}. ${v.identifier}  ·  ${isSilentVoice(v.identifier) ? "silent, not used"
            : label[voiceSex(v)] || "unknown"}`}
        </Text>
      ))}
      {unknown.length ? (
        <Muted size={12} style={{ marginTop: 6 }}>
          {`${unknown.length} unheard: listen, then add them to core/voices.js`}
        </Muted>
      ) : null}
    </Card>
  );
}

export default function SttLab() {
  const { st, update } = useSession();
  const t = useTheme();
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState("idle");        // idle | listening | done
  const [live, setLive] = useState("");
  const [verdict, setVerdict] = useState(null);      // { transcript, res, latencyMs }
  const [error, setError] = useState(null);
  const [caps, setCaps] = useState(null);            // what this device can do
  /* On-device is the default because it keeps audio on the phone. But Android reports
     Russian as "supported" while the offline model is not downloaded, and start()
     then fails with language-not-supported — so the lab has to be able to measure the
     network recogniser too, and to record which one produced each number. */
  const [onDevice, setOnDevice] = useState(true);
  const [note, setNote] = useState(null);
  const startedAt = useRef(0);
  const item = STT_SET[i];

  useEffect(() => {
    let alive = true;
    (async () => {
      const M = ExpoSpeechRecognitionModule;
      let available = false, onDevice = false, hasRu = null;
      try { available = !!M.isRecognitionAvailable(); } catch (e) { /* stays false */ }
      try { onDevice = !!M.supportsOnDeviceRecognition(); } catch (e) { /* stays false */ }
      try {
        const loc = await M.getSupportedLocales({ androidRecognitionServicePackage: undefined });
        const all = (loc.locales || []).concat(loc.installedLocales || []);
        hasRu = all.some((l) => /^ru/i.test(l));
      } catch (e) { hasRu = null; }
      if (alive) setCaps({ available, onDevice, hasRu });
    })();
    return () => { alive = false; };
  }, []);

  const log = useCallback((attempt) => {
    update((prev) => ({ ...prev, speech: recordAttempt(prev.speech, attempt) }));
  }, [update]);

  const finish = useCallback((transcript) => {
    const latencyMs = Date.now() - startedAt.current;
    const res = compare(transcript, item.ru);
    setVerdict({ transcript, res, latencyMs });
    setPhase("done");
    log({ ts: Date.now(), key: fold(item.ru), kind: "lab", i, src: item.src,
          transcript, target: item.ru, wer: res.wer, tags: [], grade: null,
          latencyMs, engine: onDevice ? "device" : "network", onDevice });
  }, [item, i, log, onDevice]);

  useSpeechRecognitionEvent("result", (ev) => {
    if (phase !== "listening") return;
    const text = ev.results && ev.results[0] ? ev.results[0].transcript : "";
    if (ev.isFinal) finish(text);
    else setLive(text);
  });
  useSpeechRecognitionEvent("error", (ev) => {
    if (phase !== "listening") return;
    const latencyMs = Date.now() - startedAt.current;
    setError(`${ev.error}${ev.message ? " — " + ev.message : ""}`);
    // The one error worth explaining: the model is missing, not the language.
    if (/not-supported|not downloaded/i.test(`${ev.error} ${ev.message || ""}`)) {
      setNote(onDevice
        ? "Russian is supported but its offline model is not on this phone. "
          + "Tap Download, or turn off on-device to measure the network recogniser."
        : "The recogniser refused this language even over the network.");
    }
    setPhase("idle");
    log({ ts: Date.now(), key: fold(item.ru), kind: "lab", i, src: item.src,
          transcript: "", target: item.ru, wer: 1, tags: [], grade: null, latencyMs,
          engine: onDevice ? "device" : "network", onDevice, error: ev.error });
  });
  useSpeechRecognitionEvent("end", () => {
    // Ended with no final result and no error: treat as nothing heard.
    if (phase === "listening") setPhase("idle");
  });

  const speak = async () => {
    setError(null); setLive(""); setVerdict(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) { setError("microphone permission denied"); return; }
    startedAt.current = Date.now();
    setPhase("listening");
    ExpoSpeechRecognitionModule.start({
      lang: LANG,
      requiresOnDeviceRecognition: onDevice,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
    });
  };

  /* Android 13+ only: opens the system's model-download dialog. Fire and forget —
     it reports that the dialog opened, not that the download finished. */
  const download = async () => {
    setNote(null); setError(null);
    try {
      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
        locale: LANG,
      });
      setNote(typeof r === "object" && r && r.status
        ? `download: ${r.status} — when it finishes, come back and press Speak`
        : "download requested — when it finishes, come back and press Speak");
    } catch (e) {
      setNote(`could not start the download — ${e.message || e}. `
        + "Settings → System → Languages → On-device speech recognition → add Russian.");
    }
  };

  const stop = () => { try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* none */ } };

  const next = () => {
    setI((i + 1) % STT_SET.length);
    setPhase("idle"); setLive(""); setVerdict(null); setError(null);
  };

  /* The whole speech slot as JSON, through the share sheet — no file system
     permission, no server, and tools/stt_report.py reads exactly this shape. */
  const exportAttempts = async () => {
    const payload = JSON.stringify({
      exported: new Date().toISOString(),
      set: STT_SET.length,
      attempts: (st.speech && st.speech.attempts) || [],
      tagCounts: (st.speech && st.speech.tagCounts) || {},
    });
    try {
      await Share.share({ message: payload, title: "bridges-stt-export.json" });
    } catch (e) {
      setError(`export failed — ${e.message || e}`);
    }
  };

  if (!st.dev) {
    return (
      <Screen>
        <Card><Muted>Developer mode is off.</Muted></Card>
      </Screen>
    );
  }


  const logged = ((st.speech && st.speech.attempts) || []).filter((a) => a.kind === "lab").length;

  return (
    <Screen fill>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Pill tone="brand">{`${i + 1}/${STT_SET.length}`}</Pill>
        <Pill>{SRC_NAME[item.src] || item.src}</Pill>
        <View style={{ flex: 1 }} />
        <Muted size={12}>{`${logged} logged`}</Muted>
      </View>

      {caps ? (
        <Muted size={12} style={{ marginBottom: 10 }}>
          {`recogniser ${caps.available ? "available" : "unavailable"} · on-device ${caps.onDevice ? "yes" : "no"} · ru ${caps.hasRu === null ? "?" : caps.hasRu ? "yes" : "no"}`}
        </Muted>
      ) : null}

      <Voices />
      <View style={{ height: 10 }} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={{ color: t.ink, fontSize: 24, lineHeight: 32, flex: 1 }}>{item.ru}</Text>
          <Speaker text={item.ru} size={36} />
        </View>
        <Muted style={{ marginTop: 6 }}>{item.en}</Muted>
      </Card>

      {phase === "listening" ? (
        <Card style={{ marginTop: 12, borderColor: t.brand }}>
          <Muted>Listening…</Muted>
          <Text style={{ color: t.ink, fontSize: 18, marginTop: 4 }}>{live || " "}</Text>
        </Card>
      ) : null}

      {verdict ? (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <Pill tone={verdict.res.wer === 0 ? "good" : undefined}>
              {`WER ${Math.round(verdict.res.wer * 100)}%`}
            </Pill>
            <Pill>{`${verdict.latencyMs} ms`}</Pill>
          </View>
          <Alignment alignment={verdict.res.alignment} />
          <Muted size={12} style={{ marginTop: 4 }}>{`heard: “${verdict.transcript}”`}</Muted>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ marginTop: 12, borderColor: t.bad }}>
          <Text style={{ color: t.bad }}>{error}</Text>
          {note ? <Muted style={{ marginTop: 6 }}>{note}</Muted> : null}
        </Card>
      ) : note ? (
        <Card style={{ marginTop: 12 }}><Muted>{note}</Muted></Card>
      ) : null}

      <View style={{ marginTop: "auto", paddingTop: 16, gap: 8 }}>
        {/* Which recogniser is being measured. Every attempt records this, so a mixed
            export can still be read one engine at a time. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
                       paddingHorizontal: 2 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15 }}>On-device only</Text>
            <Muted size={12}>
              {onDevice ? "Audio stays on the phone" : "Audio goes to the recogniser's servers"}
            </Muted>
          </View>
          <Switch
            value={onDevice}
            onValueChange={(v) => { setOnDevice(v); setError(null); setNote(null); }}
            trackColor={{ true: t.good, false: t.surface3 }}
          />
        </View>
        {phase === "listening"
          ? <Btn kind="bad" label="Stop" onPress={stop} />
          : <Btn kind="pri" label={verdict || error ? "Again" : "Speak"} onPress={speak} />}
        <Btn label="Next sentence" onPress={next} />
        <Btn label="Download Russian model" onPress={download} />
        <Btn kind="ghost" label={`Export ${logged} attempts`} onPress={exportAttempts} />
      </View>
    </Screen>
  );
}

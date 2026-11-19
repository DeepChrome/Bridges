/* A hands-free exchange with the model, as a hook (2026-11-19): the microphone
 * opens, the learner speaks, the turn goes, the reply is read aloud, the
 * microphone opens again. Built for the sparkle's sheet (askai.js) — the
 * owner: *"when the user clicks the sparkle and enters a conversation with
 * Teddy: 1) add a voice input option 2) add conversation mode (almost like the
 * tutor but it's catered for the context of the card/chapter it's on)"* — on
 * the rules the tutor's own loop made (screens/Tutor.js, §30aw):
 *
 *   - speak, then listen, never both: the reply is read to its end before the
 *     microphone opens (§30h′);
 *   - only the newest turn may open the microphone (`seq`);
 *   - QUIET_LIMIT silent turns in a row and the loop stops;
 *   - stopping puts the microphone down at once and sends nothing.
 *
 * `onTurn(text)` sends a turn and resolves with the text to read aloud, or
 * null when the turn failed (the loop stops then). A held press (`hold`,
 * `release`) is a single spoken question in the chosen language, read back
 * the same way but with no reopening. Both hear with the one recogniser.
 */

import { useEffect, useRef, useState } from "react";
import { useRecognizer, LANG, LANG_EN } from "./speech";
import { stop as stopAudio, speakMixed } from "./audio";

export const QUIET_LIMIT = 2;
/* A conversation hears both languages (Tutor.js HEARS_BOTH): a beginner asks
   in English and says the Russian they mean, often in one sentence. */
export const HEARS_BOTH = { lang: LANG, langs: [LANG, LANG_EN] };

export function useConverse({ enabled = true, onTurn, asked } = {}) {
  const [going, setGoing] = useState(false);
  const goingRef = useRef(false);
  const setLoop = (on) => { goingRef.current = on; setGoing(on); };
  const [lang, setLang] = useState(LANG);
  const [busy, setBusy] = useState(false);
  const quiets = useRef(0);
  const seq = useRef(0);
  const alive = useRef(true);
  const recRef = useRef(null);
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;
  useEffect(() => () => {
    alive.current = false; goingRef.current = false;
    if (recRef.current) recRef.current.cancel();
    stopAudio();
  }, []);

  const listenAgain = () => setTimeout(() => {
    if (alive.current && goingRef.current && recRef.current) recRef.current.listen(HEARS_BOTH);
  }, 300);

  /* One heard turn: sent, read back, and — in the loop — the microphone again. */
  const heard = async (text) => {
    const mine = ++seq.current;
    setBusy(true);
    const reply = await (turnRef.current ? turnRef.current(text) : null);
    if (!alive.current || seq.current !== mine) return;
    setBusy(false);
    if (typeof reply !== "string" || !reply) { if (goingRef.current) setLoop(false); return; }
    await speakMixed(reply, { asked });
    if (!alive.current || seq.current !== mine) return;
    if (goingRef.current) listenAgain();
  };

  const rec = useRecognizer({
    enabled,
    onFinal: (transcript) => {
      quiets.current = 0;
      const s = String(transcript || "").trim();
      if (!s) { if (goingRef.current) listenAgain(); return; }
      heard(s);
    },
    onQuiet: () => {
      if (!goingRef.current) return;
      quiets.current += 1;
      if (quiets.current >= QUIET_LIMIT) { setLoop(false); return; }
      listenAgain();
    },
  });
  recRef.current = rec;

  const toggle = () => {
    if (goingRef.current) { setLoop(false); rec.cancel(); stopAudio(); return; }
    quiets.current = 0;
    setLoop(true);
    stopAudio();
    if (!busy) rec.listen(HEARS_BOTH);
  };
  const hold = () => { if (!busy) { stopAudio(); rec.hold({ lang }); } };

  return { going, toggle, busy, rec, hold, release: rec.release, lang,
           flipLang: () => setLang(lang === LANG ? LANG_EN : LANG),
           status: rec.phase === "listening" ? (rec.live || "Listening…") : going && busy ? "Thinking…" : going ? "Speaking…" : rec.note || "" };
}

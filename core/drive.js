/* Drive mode (the owner, 2026-10-15: *"a drive mode feature where it plays
 * audio russian lessons… Perhaps learn russian podcast or something?"*): a
 * hands-free audio lesson, built the way Pimsleur builds one, because that is
 * the method designed for a listener who cannot look at a screen.
 *
 *   - **Prompt, pause, answer.** The English is read, then a silence long
 *     enough to say the Russian aloud, then the Russian. The pause is the
 *     exercise: recall before the answer, out loud, which is production
 *     (§30j), not recognition.
 *   - **Twice on first meeting** — the Russian again after a beat, to repeat.
 *   - **Graduated recall.** Each item comes back as a prompt again two items
 *     later and five items later, with nothing given away first: the spacing
 *     inside one sitting that Pimsleur called graduated interval recall.
 *
 * Pure: it turns a list of items into a list of segments, and the screen plays
 * them. Nothing here is graded and nothing enters the scheduler — a word said
 * into a car is not a claim that it is known (§30z's rule for the build-up).
 */

export const DRIVE_GAP = { word: 2600, sentence: 4200 };   // time to say it, ms
export const DRIVE_REPEAT_GAP = 1400;                       // between the two readings
export const DRIVE_BETWEEN = 900;                           // after an item, before the next
export const DRIVE_RECALL = [2, 5];                         // comes back this many items later

/* items: [{ ru, en, kind: "word" | "sentence" }] → segments:
   { t: "en", text } | { t: "ru", text } | { t: "gap", ms } | { t: "mark", item } */
export function driveScript(items, { pace = 1 } = {}) {
  const gap = (it) => Math.round((DRIVE_GAP[it.kind] || DRIVE_GAP.word) * pace);
  const due = new Map();                    // position → items to recall there
  const out = [];
  const prompt = (it, k, first) => {
    out.push({ t: "mark", item: k, first });
    out.push({ t: "en", text: it.en });
    out.push({ t: "gap", ms: gap(it) });
    out.push({ t: "ru", text: it.ru });
    if (first) {
      out.push({ t: "gap", ms: DRIVE_REPEAT_GAP });
      out.push({ t: "ru", text: it.ru });
    }
    out.push({ t: "gap", ms: DRIVE_BETWEEN });
  };
  items.forEach((it, k) => {
    for (const r of due.get(k) || []) prompt(items[r], r, false);
    prompt(it, k, true);
    for (const d of DRIVE_RECALL) {
      const at = k + d;
      if (!due.has(at)) due.set(at, []);
      due.get(at).push(k);
    }
  });
  // What is still owed after the last item is recalled at the end, in order.
  const tail = [...due.keys()].filter((at) => at >= items.length).sort((a, b) => a - b);
  for (const at of tail) for (const r of due.get(at)) prompt(items[r], r, false);
  return out;
}

/* About how long a script runs, for the screen to say: the gaps exactly, the
   speech estimated from its length (a Russian word ~ 0.9 s, ~70 ms a letter). */
export function driveLength(script) {
  let ms = 0;
  for (const s of script) {
    if (s.t === "gap") ms += s.ms;
    else if (s.t === "en" || s.t === "ru") ms += 600 + String(s.text).length * 70;
  }
  return ms;
}

/* Which items a drive takes, in order: the words first, commonest first as
   given, then the sentences, shortest first, interleaved so a sentence
   follows a few words rather than all of them at the end. */
export function driveItems(words, sentences, { maxWords = 14, maxSentences = 6, every = 3 } = {}) {
  const ws = words.slice(0, maxWords);
  const ss = sentences.slice().sort((a, b) => a.ru.length - b.ru.length).slice(0, maxSentences);
  const out = [];
  let s = 0;
  ws.forEach((w, k) => {
    out.push(w);
    if ((k + 1) % every === 0 && s < ss.length) out.push(ss[s++]);
  });
  while (s < ss.length) out.push(ss[s++]);
  return out;
}

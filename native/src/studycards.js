/* The cards Study deals and the session built from them: what a card is
 * (a word, a pooled sentence, a deck card), which cards the ticked sets and
 * the day hold, and how a sitting is counted. Carved out of screens/Study.js
 * as a pure move; the screen deals what `sessionFor` hands it. */

import { L, UN, SPEECH, reachedUnits, idxOfWord, exactIdx, rankOf, videoLines,
         personalWords, goalNow, englishOfSentence } from "./data";
import { schedulerOpts, wanted, troubleWords as troubleBank, DEFAULT_FRONTS, cardFor, familiarity, kindOf, retrievability,
         isDue, dayOf } from "@core/scheduler";
import { isIrregular } from "@core/facts";
import { buildSession, practiceSession, QUEUE_DEFAULTS, cardKind, kindsOf,
         goalSession, MASTERED_AT } from "@core/queue";

/* What the card says about itself. `New` is the session's own word for it.
   There was a `Trouble` flag too, and it went (the owner, 2026-09-29: "the
   user doesn't need to be reminded that a word is a troubled word"): the bank
   still exists — its round, You's sheet — but a card does not announce it. */
export function flagsFor(st, item) {
  if (!item) return { isNew: false, score: null };
  const entry = st.seen[item.word];
  return {
    isNew: item.kind === "new",
    /* The word's memory, 0–100 (core/scheduler.js familiarity); null while it
       is new, when the New flag says everything there is to say. */
    score: item.kind === "new" ? null : familiarity(cardFor(entry), rankOf(item.word)),
    /* A word that breaks the rules says so on the back (2026-09-29). */
    irregular: (() => { const i = idxOfWord(item.word); return i >= 0 && isIrregular(L[i]); })(),
  };
}

/* The scheduler's bank, worst first and capped, then whatever the learner
   pinned by hand. */
export function troubleWords(st) {
  const out = troubleBank(st.seen, rankOf);
  (st.pinned || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out;
}

/* A card as the screen draws it: `b` is the schedule key, `w` the face. */
const cardOf = (i) => ({ key: "w" + i, w: L[i].w, b: L[i].b, e: L[i].e, x: L[i].x });
const deckCard = (c) => ({ key: "d" + c.ru, w: c.ru, b: c.ru, e: c.en, sentence: /\s/.test(c.ru) });

/* A whole sentence as a card (the owner, 2026-09-16: *"not just vocabulary
   (individual words) but also sentences… Complete sentences are very
   helpful"* — which is how his own decks are built).
 *
 * The 1,987 rows of `payload.speech` are the right source and not the corpus
 * at large: every one has a real recording, every one is cut to a unit by the
 * coverage rule (§30b), so a sentence card is level-matched and can be *heard*
 * rather than read by the phone. `sentence: true` is what the screen reads to
 * link the Russian and to skip the dictionary entry a sentence does not have.
 *
 * It keys on the sentence string, like a deck card — rule 20.4 keys on what is
 * written, not on an index, so the scheduler needs nothing new to hold one. */
const sentenceCard = (row) => ({ key: "s" + row[0], w: row[0], b: row[0], e: row[1], sentence: true });

/* Every sentence the learner has reached, newest units first so the set leads
   with what they are working on — and then on along the route until there are
   at least SENTENCE_POOL_MIN of them (the owner, 2026-09-24: *"sentences are
   some of the best ways of learning… I'd like to have many many more"*; a
   chapter-1 learner reached about fifty). A sentence from further along has a
   word or two not yet taught, and on a card that is a tap away from its entry —
   the same trade shadowing makes (§30aq). Both pools: a sentence worth hearing
   is worth saying, and the two overlap by design (§30b stores a shared row
   list). */
export const SENTENCE_POOL_MIN = 400;
/* Below this frequency rank a word is met everywhere from the first screen
   («и», «не», «в») and does not count against a sentence being "yours". */
const SENTENCE_FREE_RANK = 100;
export function sentencesFor(st) {
  const out = [], have = new Set();
  const units = reachedUnits(st);
  const take = (u) => {
    for (const pool of [SPEECH.listen, SPEECH.speak]) {
      for (const i of (pool || {})[u.id] || []) {
        const row = SPEECH.rows[i];
        if (!row || have.has(row[0])) continue;
        have.add(row[0]);
        out.push(sentenceCard(row));
      }
    }
  };
  for (const u of [...units].reverse()) take(u);
  const reached = new Set(units.map((u) => u.id));
  for (const u of UN) {
    if (out.length >= SENTENCE_POOL_MIN) break;
    if (!reached.has(u.id)) take(u);
  }
  /* Sentences made only of words from lessons already finished come first
     (the owner, 2026-10-09: "expose the learner to sentences. Especially
     sentences from their lessons already completed"); the rest keep their
     order behind them. A stable partition, so the newest units still lead
     inside each half. */
  const known = new Set(personalWords(st));
  const yours = (c) => (String(c.b).match(/[А-Яа-яЁё́-]+/g) || []).every((tok) => {
    const i = idxOfWord(tok);
    return i >= 0 && (i < SENTENCE_FREE_RANK || known.has(i));
  });
  const mine = [], rest = [];
  for (const c of out) (yours(c) ? mine : rest).push(c);
  return mine.concat(rest);
}

/* A pooled sentence by its own text, built once on first use. */
let sentenceRows = null;
const sentenceRow = (ru) => {
  if (!sentenceRows) {
    sentenceRows = new Map();
    for (const row of SPEECH.rows || []) if (!sentenceRows.has(row[0])) sentenceRows.set(row[0], row);
  }
  return sentenceRows.get(ru) || null;
};
/* An imported deck's card by its Russian: the first deck that carries it. */
const deckCardOf = (st, ru) => {
  for (const d of st.decks || []) {
    const c = d.cards.find((x) => x.ru === ru);
    if (c) return deckCard(c);
  }
  return null;
};

/* Every card the ticked sets hold, one of each. */
export function cardsIn(st, sets, words = []) {
  const pool = [];
  const have = new Set();
  const add = (card) => { if (!have.has(card.b)) { have.add(card.b); pool.push(card); } };
  const byWord = (w) => {
    /* Only the lemma that *is* this string. `idxOfWord` goes through fold(),
       which maps «всё» to «все» and a form to its lemma, and the card it gives
       is keyed on that other word: the session then read the other word's
       schedule, found nothing due, and the card was never dealt while the
       badge went on counting it (the owner, 2026-09-29: "Daily goal met" with
       157 still owed). */
    const i = exactIdx(w);
    if (i >= 0) { add(cardOf(i)); return; }
    // A card the curriculum does not carry: a pooled sentence or a deck card
    // that is due. The schedule knows it only by its Russian, so its English
    // is looked up where it came from. It used to be left blank, and every
    // due sentence turned over to its Russian again with no meaning under it
    // (the owner, 2026-09-29: "I was expecting English on the other side").
    const row = sentenceRow(w);
    if (row) { add(sentenceCard(row)); return; }
    const dc = deckCardOf(st, w);
    if (dc) { add(dc); return; }
    // A dictionary example (a summary's sentence) keeps its English too.
    add({ key: "d" + w, w, b: w, e: englishOfSentence(w), sentence: /\s/.test(w) });
  };
  sets.forEach((id) => {
    if (id === "__trouble__") { troubleWords(st).forEach(byWord); return; }
    if (id === "__sentences__") { sentencesFor(st).forEach(add); return; }
    // The personal review: every finished lesson's words and the next one's
    // (data.js personalWords; 2026-10-05).
    if (id === "__path__") { personalWords(st).forEach((i) => add(cardOf(i))); return; }
    // Everything the scheduler wants today, whichever set it came from — what
    // "Review · N due" on the path opens.
    if (id === "__due__") {
      const now = Date.now();
      for (const w in st.seen) if (wanted(st.seen[w], now, st.learnAhead)) byWord(w);
      return;
    }
    if (id.startsWith("deck:")) {
      const d = (st.decks || []).find((x) => "deck:" + x.id === id);
      if (d) d.cards.forEach((c) => add(deckCard(c)));
      return;
    }
    const u = UN.find((x) => x.id === id);
    if (u) {
      u.w.forEach((i) => add(cardOf(i)));
      // …and its video's own sentences, which the sentence kind lets through
      // (2026-09-29: *"for video specific flash cards or chapter specific, the
      // sentences should be tied to the videos"*).
      videoLines(u).forEach((l) => { const row = sentenceRow(l.ru); if (row) add(sentenceCard(row)); });
    }
  });
  words.forEach(byWord);   // a list handed in by word, such as a video's
  return pool;
}

/* Where new cards come from: the ticked sources (the path, chapters, decks),
   and the sentence pool when sentences are chosen — only of the kinds chosen. */
export function sourceCards(st) {
  const kinds = kindsOf(st.cardKinds);
  const ids = (st.sets || []).filter((id) => id !== "__due__" && id !== "__trouble__" && id !== "__sentences__");
  /* The sentence pool rides with the path, not with a deck or a chapter the
     learner picked: those carry their own sentences (a unit's video lines),
     and an imported deck is its cards and nothing else. */
  if (kinds.includes("sentences") && (!ids.length || ids.includes("__path__"))) ids.push("__sentences__");
  return cardsIn(st, ids).filter((c) => kinds.includes(cardKind(c.b)));
}

/* Every card the session may deal, one of each: everything due of the chosen
   kinds — **whatever is ticked** — then the sources' cards for new ones.
 *
 * The session used to be the ticked sets alone, and "Due today" was a set
 * like any other. The owner, 2026-09-28: the Study badge said about 150 due,
 * and the pile dealt the trouble words he had ticked in the picker and then
 * said "Done for today". The badge counted every due card and the session
 * could not reach them — the stranding §30aa named, from the other side.
 * Anki's rule is the one wanted: what is due is always due, and new cards
 * enter at the day's rate. `dueCount` filters by the same kinds, so the two
 * numbers are one number. */
export function studyCards(st) {
  const kinds = kindsOf(st.cardKinds);
  const due = cardsIn(st, ["__due__"]).filter((c) => kinds.includes(cardKind(c.b)));
  const out = [], have = new Set();
  for (const c of due.concat(sourceCards(st))) if (!have.has(c.b)) { have.add(c.b); out.push(c); }
  return out;
}

/* Cards already learned and not yet due, of the chosen kinds, the least firmly
   held first: the third way on once the day's pile is clear (the owner,
   2026-09-29: "learn some new words, review trouble words, or review known
   words"). Each answer is a real review, taken early. */
export function knownWords(st, now = Date.now()) {
  const kinds = kindsOf(st.cardKinds);
  const opts = schedulerOpts(st);
  const out = [];
  for (const w in st.seen || {}) {
    if (!kinds.includes(cardKind(w))) continue;
    const card = cardFor(st.seen[w]);
    if (!card || kindOf(card) === "new" || wanted(st.seen[w], now, st.learnAhead)) continue;
    out.push([w, retrievability(card, now, opts)]);
  }
  return out.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

/* Where a sitting stands (the owner, 2026-10-01: "the total count increases
   per attempt. That's not helpful"). Counted by card, never by attempt: a
   card answered Again comes back in the pile but is still one card, so the
   total holds still. `words` is every card dealt this sitting (all chunks),
   `marks` what each was last answered — "done" for Hard and better (it is
   finished for today), "again" for Again (it is coming back) — and `beyond`
   the cards the scheduler still holds past the dealt chunks. */
export function sittingTally(words, marks, beyond = 0) {
  let done = 0, again = 0;
  for (const w of words) {
    if (marks[w] === "done") done++;
    else if (marks[w] === "again") again++;
  }
  const total = words.size + beyond;
  return { done, again, left: total - done, total };
}

/* How much of a set of cards is held (free study: "the user can see how many
   words they've mastered"). Mastered is familiarity MASTERED_AT and above
   (the owner, 2026-10-02: "how many cards they've mastered (say a score of
   like 80+)"), on the
   word's own frequency scale (core/scheduler.js); learning is anything met
   and below it; new is never met. */
export { MASTERED_AT };
export function masteryOf(st, cards) {
  let mastered = 0, learning = 0, fresh = 0;
  for (const c of cards) {
    const card = cardFor((st.seen || {})[c.b]);
    if (!card || kindOf(card) === "new") fresh++;
    else if (familiarity(card, rankOf(c.b)) >= MASTERED_AT) mastered++;
    else learning++;
  }
  return { mastered, learning, fresh };
}

/* The session from the learner's state. Exported so a test can ask for the
   same session the screen deals. `round: "trouble"` is the extra round of
   trouble words offered once the day is done; `round: "list"` is a round on
   `words` handed in by another screen — a video's word list before watching
   it (§30bf) — carrying its own faces, since those words need not be in any
   ticked set. */
export function sessionFor(st, { ahead, beyond, rng, round, words: list, title } = {}) {
  if (round === "trouble") {
    return practiceSession({ seen: st.seen, words: troubleWords(st), dirs: st.flash || DEFAULT_FRONTS });
  }
  /* `again`: the sitting dealt once more from its first card, when the front
     changed part-way (the owner, 2026-10-31: "if I switch to English to
     Russian mode after starting with Russian to English, it sort of just
     starts right where I left off. I think it should start from the
     beginning"). Nothing is held back — the cards just answered are the
     point, met now from the other side — and every grade still counts. */
  if (round === "list" || round === "known" || round === "again") {
    /* A list handed in — the video's words, a lesson's — leaves out what is
       already held (the owner, 2026-10-05: "if the user already has like an
       80+ on a card, they probably don't need to view it before the video"). */
    /* …and what was answered today and is scheduled out (the owner,
       2026-10-19: the lesson's cards, the video's and the day's pile each dealt
       the same word within the hour, "even when I'm pressing easy"). A card
       answered Again today is in a learning step and due within minutes, so
       it stays. */
    const now = Date.now();
    const held = (w) => {
      const c = cardFor((st.seen || {})[w]);
      if (!c) return false;
      if ((familiarity(c, rankOf(w)) || 0) >= MASTERED_AT) return true;
      return c.lastAt !== undefined && c.lastAt !== null && dayOf(c.lastAt) === dayOf(now)
        && !isDue(c, now, st.learnAhead);
    };
    /* A sentence turns over to its English or it is not dealt (a tester,
       2026-10-10: «Авто́бусы во́зят пассажи́ров.» with nothing on the back).
       Every source a list draws on carries one now (cardsIn); a sentence the
       payload has no English for is a card with nothing to learn from. */
    const cards = cardsIn(st, [], round === "known" ? knownWords(st).slice(0, QUEUE_DEFAULTS.sessionSize)
      : round === "again" ? (list || []) : (list || []).filter((w) => !held(w)))
      .filter((c) => !c.sentence || String(c.e || "").trim());
    const faces = {};
    for (const c of cards) faces[c.b] = c;
    return { ...practiceSession({ seen: st.seen, words: cards.map((c) => c.b), dirs: st.flash || DEFAULT_FRONTS,
                                  size: round === "known" ? QUEUE_DEFAULTS.sessionSize : cards.length }),
             title: round === "known" ? "Known words" : title, faces };
  }
  const opts = { newPerDay: st.newPerDay, learnAhead: st.learnAhead,
                 scheduler: schedulerOpts(st), rank: newCardRank };
  const words = studyCards(st).map((c) => c.b);
  if (ahead) {
    return buildSession({ seen: st.seen, words, dirs: st.flash || DEFAULT_FRONTS, now: Date.now(), daily: st.daily,
                          rng, ahead, opts });
  }
  /* The day's goal (core/queue.js goalSession): what is due, the new words
     allowed, then the learner's own met cards most faded since they were last
     seen — so the number on the tab can always be brought to 0 — and "Keep
     going" (`beyond`) past it. */
  /* The personal review draws on everything met of the chosen kinds; a
     review the learner pointed at chapters or a deck keeps to them (the
     owner: "they can override and review specific chapters"). */
  const kinds = kindsOf(st.cardKinds);
  // Nothing chosen is the personal review too: a review never deals nothing.
  // (`__due__` and the like are old ids, not sources — core/state.js v10.)
  const sources = (st.sets || []).filter((id) => !["__due__", "__trouble__", "__sentences__"].includes(id));
  const personal = !sources.length || sources.includes("__path__");
  const pool = personal ? words : sourceCards(st).map((c) => c.b);
  const have = new Set(pool);
  const met = personal ? Object.keys(st.seen || {}).filter((w) => !have.has(w) && kinds.includes(cardKind(w))) : [];
  return goalSession({
    seen: st.seen, words: pool.concat(met), dirs: st.flash || DEFAULT_FRONTS, now: Date.now(), daily: st.daily,
    rng, opts, owed: goalNow(st).owed, beyond,
    familiar: (w, card) => familiarity(card, rankOf(w)) || 0,
  });
}

/* Which new word to deal first: the commoner one. Lemma indices are assigned
   by frequency at build time (rule 20.4 is about never *keying state* on them;
   reading one as a rank is exactly what they are). A word the curriculum does
   not carry — a deck card the learner imported, a sentence — sorts after the
   curriculum but keeps the order it arrived in, which is the order they chose.

   This is what stops «воспользоваться» opening a beginner's pile (§30ap).

   **A sentence is as common as its rarest word** (the owner, 2026-09-28:
   *"words that are more useful and common should be front loaded. Same with
   simpler sentences… when in doubt, prioritize more common and useful
   words"*). Sentences used to sort after every word and then in the order
   their units were reached — newest first — so the simple ones had no
   advantage at all. Each is ranked now by the least common word in it, with
   a little for length, on the same scale as the words, so «Где книга?» comes
   among the commonest words and a twelve-word sentence with «одолжить» in it
   comes near «одолжить». A word the lexicon does not resolve counts as rare. */
export const RARE_RANK = 5000;
const wordRank = (w) => {
  const r = rankOf(w);
  if (r) return r - 1;
  const i = idxOfWord(w);
  return i >= 0 ? i : RARE_RANK;
};
export const newCardRank = (w) => {
  if (cardKind(w) === "words") {
    const r = wordRank(w);
    // A deck card the curriculum does not carry keeps the order it came in.
    return r === RARE_RANK && idxOfWord(w) < 0 ? Number.MAX_SAFE_INTEGER : r;
  }
  const toks = String(w).match(/[А-Яа-яЁё́-]+/g) || [];
  if (!toks.length) return Number.MAX_SAFE_INTEGER;
  const rarest = Math.max(...toks.map((t) => { const i = idxOfWord(t); return i >= 0 ? i : RARE_RANK; }));
  return rarest + 10 * toks.length;
};

export const newDeckId = () => "k" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/* The task at the end of a chapter (ROADMAP P10.5).
 *
 * A quiz asks whether you can answer questions about a chapter's words. This
 * asks whether you can *do* something with them — say who you are, order what
 * you want, ask where a place is — against a goal rather than a mark. That is
 * the difference the market research kept returning to: production against an
 * intention, not recognition against a prompt.
 *
 * Hand-authored, like `scenarios.js` and `alphabet.js`, and for the same
 * reason: the pipeline knows which words a chapter teaches and cannot know what
 * those words let you go and do.
 *
 * **The goal is in English and the doing is in Russian.** No Russian is written
 * here at all, which sidesteps §30a entirely — nothing in this file could be a
 * wrong sentence, because there are no sentences in it. What the learner
 * produces is judged by the Worker against the words their route has actually
 * taught, so a chapter-2 learner is not marked down for the vocabulary of
 * chapter 7.
 *
 * `must` is what the answer has to get across, in the learner's own words and
 * in any order. It is deliberately short: three things is a task, six is an
 * essay, and the learner has thirty words of Russian at chapter 1.
 */

export const TASKS = [
  {
    chapter: 1, unit: "core1",
    title: "Introduce yourself",
    goal: "Say who you are, and point out one other person.",
    must: ["your own name", "that this other person is not you"],
  },
  {
    chapter: 2, unit: "core2",
    title: "Order something",
    goal: "Order food or drink, and say whether you want more.",
    must: ["what you want", "whether you want more of it"],
  },
  {
    chapter: 3, unit: "core3",
    title: "Show someone your place",
    goal: "Say where you live and name two things in the room.",
    must: ["where you live", "two things you can see", "which one is new"],
  },
  {
    chapter: 4, unit: "core4",
    title: "Ask the way",
    goal: "Ask how to get to a place in town, and say where you have come from.",
    must: ["the place you want", "how you are getting there", "where you started"],
  },
  {
    chapter: 5, unit: "core5",
    title: "At the doctor",
    goal: "Say what hurts and how long it has been going on.",
    must: ["what hurts", "how long", "whether it is getting better"],
  },
  {
    chapter: 6, unit: "core6",
    title: "What you do",
    goal: "Say what your work is and what a day of it looks like.",
    must: ["your work", "what you do in a day", "whether you like it"],
  },
  {
    chapter: 7, unit: "core7",
    title: "Say what you think",
    goal: "Give your opinion of something and say why.",
    must: ["what you think of it", "one reason", "how it makes you feel"],
  },
  {
    chapter: 8, unit: "core8",
    title: "Tell someone what happened",
    goal: "Describe something that happened — a match, a fault, an argument.",
    must: ["what happened", "when", "how it ended"],
  },
  {
    chapter: 9, unit: "core9",
    title: "Recommend something",
    goal: "Tell someone about a film, a book or a piece of news, and whether they should bother.",
    must: ["what it is", "what it is about", "whether you would recommend it"],
  },
  {
    chapter: 10, unit: "core10",
    title: "Say where you stand",
    goal: "Explain a rule or a belief you hold, and what you would do about it.",
    must: ["the rule or belief", "why you hold it", "what you would do"],
  },
];

export const taskFor = (chapter) => TASKS.find((t) => t.chapter === chapter) || null;
export const taskForUnit = (unitId) => TASKS.find((t) => t.unit === unitId) || null;

/* How long an answer may be, by chapter. A chapter-1 learner has thirty words
   of Russian; asking for four sentences would be asking them to fail. */
export const MAX_SENTENCES = (chapter) => (chapter <= 2 ? 2 : chapter <= 5 ? 3 : 4);

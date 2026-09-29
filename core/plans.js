/* Free and Premium (2026-09-29). Shared by the Worker, which enforces them,
 * and the app, which says what is left.
 *
 * The owner: *"Free would allow a set amount of AI response/usages per day (a
 * taste). Like one 5 minute conversation with the tutor and maybe three AI
 * enabled responses on conjugation errors. Premium would expand that usage…
 * based on a monthly subscription of 15 dollars/mo."*
 *
 * **Priced off the Worker's own token log**, 2026-09-11 to 09-29, at Haiku 4.5
 * ($1 per million tokens in, $5 out):
 *
 *   conversation turn (Talk or the tutor)  ~3,100 in, ~160 out   ~$0.004
 *   Talk's grading of the learner's turn   ~1,650 in, ~360 out   ~$0.0034
 *   explanation of a wrong answer            ~560 in,  ~85 out   ~$0.001
 *   spoken-sentence feedback                 ~840 in, ~170 out   ~$0.0017
 *   translation                              ~290 in,  ~32 out   ~$0.0005
 *
 * A five-minute conversation in conversation mode is about twelve turns, so
 * Free's whole day, spent to the last unit, is about 6¢. Premium's is about
 * 45¢ spent to the last unit of every kind — $13.50 in a month in which the
 * learner maxed out everything every single day, which nobody does; a heavy
 * learner using a third of it costs about $4.50 against $12.75 after the
 * store's 15 % subscription fee. The numbers are the per-day allowance of each
 * kind, per install, reset at 00:00 UTC with the Worker's other counters.
 *
 * What each counter is:
 *   conversation   a turn of Talk or of the tutor, and a Talk hint
 *   review         Talk's grading of the learner's own turn (one per turn)
 *   explain        why a wrong answer was wrong
 *   feedback       what a spoken sentence got wrong (asked only on a miss)
 *   translate      Translate, either way
 */

export const PLANS = {
  free: { conversation: 12, review: 12, explain: 3, feedback: 3, translate: 5 },
  premium: { conversation: 45, review: 45, explain: 60, feedback: 50, translate: 60 },
};

export const PLAN_NAMES = { free: "Free", premium: "Premium" };
export const PREMIUM_PRICE = "$15 a month";

/* The counter a Worker route spends. A Talk hint is a conversation turn —
   it is the tutor's time — and the tutor's own turn is too. */
export const COUNTER_OF = {
  talk: "conversation", hint: "conversation", tutor: "conversation",
  review: "review", explain: "explain", feedback: "feedback", translate: "translate",
};

export const planOf = (id) => (PLANS[id] ? id : "free");
export const capsFor = (id) => ({ ...PLANS[planOf(id)] });

/* What the app shows for a plan, in the order a learner thinks of it. */
export const ALLOWANCE_LINES = [
  ["conversation", "tutor turns"],
  ["explain", "explanations of a wrong answer"],
  ["feedback", "spoken-answer checks"],
  ["translate", "translations"],
];

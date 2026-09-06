/* The STT lab's fixed test set (ROADMAP P3.5).
 *
 * Thirty sentences from the speaking pool: difficulty 0 (every word is studied
 * vocabulary), 3–10 tokens, six from each of the first five spine units so the set
 * spans the early curriculum. Chosen deterministically from the 2026-09-06 build —
 * sorted by recording source (Tatoeba, Languages on Fire, Yandex, Core 5000), then
 * length, then text, and every k-th taken — so the same thirty are read every time
 * and results compare across engines and days. Stress marks are the deck's own and
 * are kept: compare() folds them out, and they help when reading aloud.
 *
 * The lab measures recognition, not pedagogy: a sentence being all-studied words
 * does not make it a beginner's sentence, and a few here are not.
 */

export const STT_SET = [
  { unit: "core1", ru: "Вот это да!", en: "Wow!" },
  { unit: "core1", ru: "Я не смеялась.", en: "I didn't laugh." },
  { unit: "core1", ru: "Фокус не удался.", en: "The trick didn't work." },
  { unit: "core1", ru: "Институт я окончила с отличием.", en: "I graduated from the institute with a distinction." },
  { unit: "core1", ru: "Я готов подписать контракт немедленно!", en: "I'm ready to sign the contract immediately!" },
  { unit: "core1", ru: "Это значительно более выгодное вложение капитала.", en: "This is a much more profitable investment." },
  { unit: "core2", ru: "Всему своё время.", en: "There's a time for everything." },
  { unit: "core2", ru: "Что тогда случилось?", en: "What was going on?" },
  { unit: "core2", ru: "Мы встретимся с ними в Бостоне.", en: "I'll meet them in Boston." },
  { unit: "core2", ru: "Какая у него профессия?", en: "What's his profession?" },
  { unit: "core2", ru: "Он погиб по трагической случайности.", en: "He died due to a tragic accident." },
  { unit: "core2", ru: "Ты почему вчера был такой мрачный?", en: "Why were you so miserable yesterday?" },
  { unit: "core3", ru: "Вы говорите по-французски?", en: "Do you speak French? (formal)" },
  { unit: "core3", ru: "Том пошёл первым.", en: "Tom went first." },
  { unit: "core3", ru: "Всё, что он говорит, — правда.", en: "All that he says is true." },
  { unit: "core3", ru: "Бить дете́й нельзя́.", en: "You should not hit children." },
  { unit: "core3", ru: "Мы хотели попасть в пещеру.", en: "We wanted to go in the cave." },
  { unit: "core3", ru: "Этот предмет выполняет очень важную функцию.", en: "This object serves a very important function." },
  { unit: "core4", ru: "Вот мы здесь.", en: "Here we are." },
  { unit: "core4", ru: "Ты с друзьями.", en: "You're with friends." },
  { unit: "core4", ru: "Для чего тебе эти деньги?", en: "Why do you need this money?" },
  { unit: "core4", ru: "Заказчик заплатил деньги.", en: "The customer paid the money." },
  { unit: "core4", ru: "Здесь крайне демократическая, дружеская атмосфера.", en: "There's an extremely democratic and friendly atmosphere here." },
  { unit: "core4", ru: "О, это был очень страшный фильм!", en: "Oh, that was a very frightening film!" },
  { unit: "core5", ru: "Что ты делаешь?", en: "What're you doing?" },
  { unit: "core5", ru: "Она ходит в школу.", en: "She goes to school." },
  { unit: "core5", ru: "Том только что был здесь.", en: "Tom was here just a moment ago." },
  { unit: "core5", ru: "Ярко светит солнце.", en: "The sun is shining brightly." },
  { unit: "core5", ru: "Для этой работы нужна особенная подготовка.", en: "Special training is needed for this work." },
  { unit: "core5", ru: "Ге́ли для душа́ есть в любо́м суперма́ркете.", en: "You can get shower gel at any supermarket." },
];

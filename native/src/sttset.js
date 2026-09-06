/* The STT lab's fixed test set (ROADMAP P3.5, revised).
 *
 * The first set was six sentences from each of the first five spine units, chosen
 * for being all-studied vocabulary. Its export showed the flaw: sentences like
 * «Институт я окончила с отличием» measured the owner's reading, not the
 * recogniser — transcripts such as «пописать» for «подписать» were phonetically
 * faithful to what was said. Nothing there separated a mis-hearing from a mis-reading.
 *
 * This set measures the recogniser. Every word is among the 300 most frequent
 * lemmas, every sentence is two to four words, and every one has a native recording
 * in the collection so it can be heard before it is read. Digits and quoted speech
 * are excluded — a number transcribes either way and a bare dash is a pause, not a
 * word. Chosen deterministically from the 2026-09-06 build (359 candidates, sorted by
 * recording source, then length, then text, every k-th taken) so the same thirty are
 * read every time and results compare across engines and days.
 *
 * `src` is the recording's source code from the pool (t Tatoeba, l Languages on
 * Fire, y Yandex, c Core 5000); it rides along into each logged attempt.
 */

export const STT_SET = [
  { src: "t", ru: "Вот мы здесь.", en: "Here we are." },
  { src: "t", ru: "Что ты делаешь?", en: "What're you doing?" },
  { src: "t", ru: "Что ты хочешь делать?", en: "What do you want to do?" },
  { src: "y", ru: "Вот! Она идёт!", en: "There! She comes!" },
  { src: "y", ru: "Вы не Том?", en: "Aren't you Tom?" },
  { src: "y", ru: "Где твой отец?", en: "Where's your father?" },
  { src: "y", ru: "Кто бы говорил.", en: "Look who's talking." },
  { src: "y", ru: "Нет, это всё.", en: "No, that's all." },
  { src: "y", ru: "Он не понимает.", en: "He doesn't understand." },
  { src: "y", ru: "Она уже здесь?", en: "Is she here yet?" },
  { src: "y", ru: "Так люди говорят.", en: "That's what people say." },
  { src: "y", ru: "Только после Вас.", en: "After you." },
  { src: "y", ru: "Том так думает.", en: "Tom thinks so." },
  { src: "y", ru: "Ты как, Том?", en: "How are you, Tom?" },
  { src: "y", ru: "Ты сделал это!", en: "You did it!" },
  { src: "y", ru: "Что он делает?", en: "What does he do?" },
  { src: "y", ru: "Это твоя книга?", en: "Is that your book?" },
  { src: "y", ru: "Я люблю историю.", en: "I like history." },
  { src: "y", ru: "В самом деле? Почему?", en: "Really? Why?" },
  { src: "y", ru: "Вы знаете, кто я.", en: "You know who I am." },
  { src: "y", ru: "Который вы бы хотели?", en: "Which would you like?" },
  { src: "y", ru: "На что ты смотришь?", en: "What are you looking at?" },
  { src: "y", ru: "Он думает над проблемой.", en: "He is thinking about the problem." },
  { src: "y", ru: "Они еще не здесь.", en: "They aren't here yet." },
  { src: "y", ru: "Сами этого не знали.", en: "You didn't know that either." },
  { src: "y", ru: "Том не говорит много.", en: "Tom doesn't say much." },
  { src: "y", ru: "Ты всегда так говоришь.", en: "That's what you always say." },
  { src: "y", ru: "У меня много вопросов.", en: "I've got a lot of questions." },
  { src: "y", ru: "Что ты за человек!", en: "What a man you are!" },
  { src: "y", ru: "Я всегда был первым.", en: "I've always been number one." },
];

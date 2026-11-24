/* Russian beyond the app: films, cartoons, series, music, channels, tools and
 * books worth a learner's time (the owner, 2026-11-23: "I just watched the
 * movie brat and it was seriously so helpful piecing a lot of my learning
 * together. Would be cool to have a whole list of reputable Russian movies,
 * songs, podcasts, and other media and materials. Perhaps some other online
 * resources for learning too.").
 *
 * Hand-authored, like core/cast.js. Only what is well known and checkable:
 * a title, its English, the year and the maker, the level it suits, and one
 * line on why. Links go to a search (YouTube for anything watched or heard,
 * where much Soviet film and animation is free on the studios' own channels)
 * or to a site's own address; nothing here is hosted or played by the app.
 *
 *   level  where a learner can start to follow it: A2 (little speech, slow),
 *          B1 (everyday speech), B2 (fast, colloquial or literary)
 *   why    one short line, under ten words (tools/copy.mjs)
 */

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const web = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export const MEDIA = [
  {
    id: "films", name: "Films",
    items: [
      { ru: "Брат", en: "Brother", year: 1997, by: "Алексей Балабанов", level: "B1", why: "Plain spoken Petersburg Russian of the nineties", url: yt("Брат 1997 фильм") },
      { ru: "Брат 2", en: "Brother 2", year: 2000, by: "Алексей Балабанов", level: "B1", why: "The sequel; much of it in Moscow and Chicago", url: yt("Брат 2 фильм") },
      { ru: "Ирония судьбы, или С лёгким паром!", en: "The Irony of Fate", year: 1975, by: "Эльдар Рязанов", level: "B1", why: "The New Year's Eve film every Russian knows", url: yt("Ирония судьбы Мосфильм") },
      { ru: "Москва слезам не верит", en: "Moscow Does Not Believe in Tears", year: 1979, by: "Владимир Меньшов", level: "B1", why: "Won the Oscar for foreign film", url: yt("Москва слезам не верит Мосфильм") },
      { ru: "Служебный роман", en: "Office Romance", year: 1977, by: "Эльдар Рязанов", level: "B1", why: "Office life and everyday talk, gently funny", url: yt("Служебный роман Мосфильм") },
      { ru: "Иван Васильевич меняет профессию", en: "Ivan Vasilievich: Back to the Future", year: 1973, by: "Леонид Гайдай", level: "B1", why: "A comedy quoted all over Russia", url: yt("Иван Васильевич меняет профессию Мосфильм") },
      { ru: "Бриллиантовая рука", en: "The Diamond Arm", year: 1969, by: "Леонид Гайдай", level: "B1", why: "Slapstick comedy; little hangs on long dialogue", url: yt("Бриллиантовая рука Мосфильм") },
      { ru: "Кавказская пленница", en: "Kidnapping, Caucasian Style", year: 1967, by: "Леонид Гайдай", level: "B1", why: "Another Gaidai classic of catchphrases", url: yt("Кавказская пленница Мосфильм") },
      { ru: "Белое солнце пустыни", en: "White Sun of the Desert", year: 1970, by: "Владимир Мотыль", level: "B1", why: "The film cosmonauts watch before a launch", url: yt("Белое солнце пустыни Мосфильм") },
      { ru: "Нелюбовь", en: "Loveless", year: 2017, by: "Андрей Звягинцев", level: "B2", why: "Modern Moscow family drama", url: web("Нелюбовь Звягинцев 2017") },
      { ru: "Левиафан", en: "Leviathan", year: 2014, by: "Андрей Звягинцев", level: "B2", why: "Small-town life in the far north", url: web("Левиафан Звягинцев 2014") },
      { ru: "Сталкер", en: "Stalker", year: 1979, by: "Андрей Тарковский", level: "B2", why: "Slow, clear speech; a landmark of cinema", url: yt("Сталкер Тарковский Мосфильм") },
    ],
  },
  {
    id: "cartoons", name: "Cartoons",
    items: [
      { ru: "Ну, погоди!", en: "Well, Just You Wait!", year: 1969, by: "Союзмультфильм", level: "A2", why: "A wolf chases a hare; almost no words", url: yt("Ну погоди Союзмультфильм") },
      { ru: "Маша и Медведь", en: "Masha and the Bear", year: 2009, by: "Анимаккорд", level: "A2", why: "Short episodes in simple, clear Russian", url: yt("Маша и Медведь") },
      { ru: "Винни-Пух", en: "Winnie-the-Pooh", year: 1969, by: "Фёдор Хитрук", level: "A2", why: "The Soviet Pooh, slow and much quoted", url: yt("Винни-Пух Союзмультфильм") },
      { ru: "Трое из Простоквашино", en: "Three from Prostokvashino", year: 1978, by: "Союзмультфильм", level: "A2", why: "A boy, a cat and a dog in the country", url: yt("Трое из Простоквашино Союзмультфильм") },
      { ru: "Крокодил Гена и Чебурашка", en: "Gena the Crocodile and Cheburashka", year: 1969, by: "Роман Качанов", level: "A2", why: "Gentle stories and a famous birthday song", url: yt("Крокодил Гена Союзмультфильм") },
      { ru: "Ёжик в тумане", en: "Hedgehog in the Fog", year: 1975, by: "Юрий Норштейн", level: "A2", why: "Ten quiet minutes, often called the best cartoon", url: yt("Ёжик в тумане Норштейн") },
      { ru: "Смешарики", en: "Kikoriki", year: 2004, by: "Riki Group", level: "A2", why: "Short episodes for children, everyday words", url: yt("Смешарики") },
    ],
  },
  {
    id: "series", name: "Series",
    items: [
      { ru: "Кухня", en: "Kitchen", year: 2012, by: "СТС", level: "B1", why: "Restaurant sitcom, everyday spoken Russian", url: yt("Кухня сериал") },
      { ru: "Интерны", en: "Interns", year: 2010, by: "ТНТ", level: "B1", why: "Hospital sitcom; fast but simple jokes", url: yt("Интерны сериал") },
      { ru: "Мастер и Маргарита", en: "The Master and Margarita", year: 2005, by: "Владимир Бортко", level: "B2", why: "Bulgakov's novel, closely followed", url: yt("Мастер и Маргарита Бортко") },
      { ru: "Слово пацана. Кровь на асфальте", en: "The Boy's Word: Blood on the Asphalt", year: 2023, by: "Жора Крыжовников", level: "B2", why: "Street slang of the eighties; very popular", url: web("Слово пацана сериал") },
    ],
  },
  {
    id: "music", name: "Music",
    items: [
      { ru: "Кино — «Группа крови»", en: "Kino, Blood Type", year: 1988, by: "Виктор Цой", level: "B1", why: "Clear, slow lyrics; a rock anthem", url: yt("Кино Группа крови") },
      { ru: "Кино — «Звезда по имени Солнце»", en: "Kino, A Star Called the Sun", year: 1989, by: "Виктор Цой", level: "B1", why: "Simple words, easy to sing along", url: yt("Кино Звезда по имени Солнце") },
      { ru: "ДДТ — «Что такое осень»", en: "DDT, What Is Autumn", year: 1991, by: "Юрий Шевчук", level: "B1", why: "Each line answers the title's question", url: yt("ДДТ Что такое осень") },
      { ru: "Земфира — «Хочешь?»", en: "Zemfira, Do You Want?", year: 2000, by: "Земфира", level: "B1", why: "Short repeated questions, good for listening", url: yt("Земфира Хочешь") },
      { ru: "Сплин — «Выхода нет»", en: "Splean, There Is No Way Out", year: 2001, by: "Александр Васильев", level: "B1", why: "Slow rock with clear diction", url: yt("Сплин Выхода нет") },
      { ru: "Би-2 — «Полковнику никто не пишет»", en: "Bi-2, No One Writes to the Colonel", year: 2000, by: "Би-2", level: "B1", why: "Played in Brother 2", url: yt("Би-2 Полковнику никто не пишет") },
      { ru: "Мумий Тролль — «Владивосток 2000»", en: "Mumiy Troll, Vladivostok 2000", year: 1997, by: "Илья Лагутенко", level: "B2", why: "A classic of Russian rock of the nineties", url: yt("Мумий Тролль Владивосток 2000") },
      { ru: "Монеточка — «Каждый раз»", en: "Monetochka, Every Time", year: 2018, by: "Монеточка", level: "B1", why: "Modern pop, clearly sung", url: yt("Монеточка Каждый раз") },
      { ru: "Владимир Высоцкий — «Кони привередливые»", en: "Vladimir Vysotsky, Fastidious Horses", year: 1972, by: "Владимир Высоцкий", level: "B2", why: "The great bard; dense, poetic Russian", url: yt("Высоцкий Кони привередливые") },
    ],
  },
  {
    id: "channels", name: "Channels and podcasts",
    items: [
      { ru: "Easy Russian", en: "Street interviews, subtitled in both languages", level: "A2", why: "Real people in the street, subtitled; in Immerse already", url: yt("Easy Russian") },
      { ru: "Russian with Max", en: "Podcast and videos in slow Russian", level: "B1", why: "Slow, clear Russian about Russian life", url: yt("Russian with Max") },
      { ru: "Мосфильм", en: "Mosfilm, the studio's own channel", level: "B1", why: "Many Soviet classics free, many with subtitles", url: yt("Мосфильм официальный канал") },
      { ru: "Союзмультфильм", en: "Soyuzmultfilm, the studio's own channel", level: "A2", why: "The Soviet cartoons, free", url: yt("Союзмультфильм официальный канал") },
      { ru: "Арзамас", en: "Arzamas, lectures and podcasts on Russian culture", level: "B2", why: "Russian culture explained to Russians", url: "https://arzamas.academy" },
    ],
  },
  {
    id: "tools", name: "Tools online",
    items: [
      { ru: "OpenRussian", en: "Dictionary with every form and stress", level: "A2", why: "Where this app's dictionary comes from", url: "https://en.openrussian.org" },
      { ru: "Forvo", en: "Words said by native speakers", level: "A2", why: "Hear how a real person says a word", url: "https://forvo.com/languages/ru/" },
      { ru: "Reverso Context", en: "Phrases in real translated sentences", level: "B1", why: "See how a phrase is used in context", url: "https://context.reverso.net/translation/russian-english/" },
      { ru: "Wiktionary", en: "Meanings, tables, etymology", level: "B1", why: "Deep entries, including rare words", url: "https://en.wiktionary.org/wiki/Category:Russian_language" },
      { ru: "Tatoeba", en: "Sentences with translations", level: "A2", why: "Many of this app's examples come from here", url: "https://tatoeba.org" },
      { ru: "Национальный корпус русского языка", en: "Russian National Corpus", level: "B2", why: "Search how real Russian texts use a word", url: "https://ruscorpora.ru" },
    ],
  },
  {
    id: "books", name: "Books",
    items: [
      { ru: "The New Penguin Russian Course", en: "Nicholas J. Brown", level: "A2", why: "A thorough classic self-study course", url: web("The New Penguin Russian Course Nicholas Brown") },
      { ru: "A Comprehensive Russian Grammar", en: "Terence Wade", level: "B1", why: "The reference grammar to look things up in", url: web("A Comprehensive Russian Grammar Terence Wade") },
      { ru: "Russian Short Stories for Beginners", en: "Olly Richards", level: "A2", why: "Short graded stories with summaries", url: web("Russian Short Stories for Beginners Olly Richards") },
    ],
  },
];

/* The shape the list promises: every item a name, a level, a short why and
   an address. */
export function checkMedia() {
  const errors = [];
  for (const g of MEDIA) for (const x of g.items) {
    if (!x.ru || !x.en || !x.url || !/^https:\/\//.test(x.url)) errors.push(`${g.id}: ${x.ru || "?"} is missing a field`);
    if (!["A2", "B1", "B2"].includes(x.level)) errors.push(`${g.id}: ${x.ru} level ${x.level}`);
    if (!x.why || x.why.split(/\s+/).length > 10) errors.push(`${g.id}: ${x.ru} why over ten words`);
  }
  return errors;
}

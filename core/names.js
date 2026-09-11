/* The people who appear in the written listening scenarios (§30l).
 *
 * One table, because three things need it and they must not drift:
 *
 *   - `tools/check_scripts.mjs` decides whether a cast entry names somebody the
 *     scenarios are allowed to use, and whether its English spelling is right;
 *   - the same tool builds the declined forms, so «Я знаю Ивана» passes the
 *     vocabulary gate (the lexicon carries no personal names at all);
 *   - the app picks each speaker a **voice of the right sex**.
 *
 * That last one is why `sex` is here rather than nowhere. The first cut handed
 * the phone's Russian voices out in the order Android listed them, so whoever
 * spoke first got voice zero — and the owner heard it at once: *"Masha clearly
 * sounds like a guy instead of a girl."* A cast list that does not know who is
 * a woman cannot be read aloud by a machine that does.
 *
 * `sex` is a property of the character, not a claim about the name in general.
 * Every name here is unambiguous in Russian, which is why these are the names.
 */

export const PEOPLE = {
  "Анна": { en: "Anna", sex: "f" },
  "Аня": { en: "Anya", sex: "f" },
  "Мария": { en: "Maria", sex: "f" },
  "Маша": { en: "Masha", sex: "f" },
  "Лена": { en: "Lena", sex: "f" },
  "Нина": { en: "Nina", sex: "f" },
  "Катя": { en: "Katya", sex: "f" },
  "Соня": { en: "Sonya", sex: "f" },
  "Таня": { en: "Tanya", sex: "f" },
  "Иван": { en: "Ivan", sex: "m" },
  "Ваня": { en: "Vanya", sex: "m" },
  "Саша": { en: "Sasha", sex: "m" },
  "Олег": { en: "Oleg", sex: "m" },
  "Борис": { en: "Boris", sex: "m" },
  "Виктор": { en: "Viktor", sex: "m" },
  "Миша": { en: "Misha", sex: "m" },
  "Пётр": { en: "Pyotr", sex: "m" },
  "Петя": { en: "Petya", sex: "m" },
  "Юра": { en: "Yura", sex: "m" },
};

/* The sex of a named character, or null for a name the table does not carry —
   a corpus scene has no cast at all, and an unknown name must fall back rather
   than be guessed at. */
export function sexOf(ru) {
  const p = PEOPLE[ru];
  return p ? p.sex : null;
}

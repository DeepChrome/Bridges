/* One line icon per subject, drawn inline so the app carries its own artwork and
   works offline. Shared verbatim with the native app, which renders the same paths
   through react-native-svg. */
export const ICONS = {
  core: "M4 7h9M4 12h13M4 17h16",
  family: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M17 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15 20a4.5 4.5 0 0 1 7-3.7",
  time: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  food: "M5 8h11v5a5.5 5.5 0 0 1-11 0zM16 9h2a2 2 0 0 1 0 4h-2M4 20h13",
  home: "M4 11 12 4l8 7M6 10v9h12v-9M10 19v-5h4v5",
  city: "M3 20h18M5 20V9l5-3v14M14 20V11h5v9M8 12h1M8 15h1M16 14h1M16 17h1",
  travel: "M4 16V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9M4 12h16M7 19v1M17 19v1M4 16h16v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  work: "M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16",
  school: "M4 6a2 2 0 0 1 2-2h11v15H6a2 2 0 0 0-2 2zM17 4h2v15h-2",
  body: "M12 20s-7-4.4-7-9.2A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.8C19 15.6 12 20 12 20z",
  clothes: "M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1a3 3 0 0 1-4 0z",
  nature: "M12 21v-6M12 15c-4 0-6-2.5-6-5.5S8 4 12 4s6 2.5 6 5.5-2 5.5-6 5.5z",
  animals: "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 21c-2.5 0-4-1.5-4-3.2 0-2 2-2.8 4-2.8s4 .8 4 2.8c0 1.7-1.5 3.2-4 3.2z",
  sport: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M6 18c2-3 2-9 0-12M18 18c-2-3-2-9 0-12",
  art: "M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  politics: "M3 20h18M5 20v-9M10 20v-9M14 20v-9M19 20v-9M3 11h18L12 4 3 11z",
  military: "M12 3l8 3v6c0 4.4-3.3 8-8 9-4.7-1-8-4.6-8-9V6z",
  tech: "M4 5h16v10H4zM9 19h6M12 15v4",
  emotion: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  speech: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-5 4z",
};

/* The activities and the drills draw their own marks, because they were drawing
 * the subjects'. Practice borrowed `speech` for Listening *and* for Sounds, `art`
 * for Shadowing and for the Stress drill, `city` for Cases, `family` for
 * Agreement — so a screen of eleven rows carried eight pictures, two of them
 * twice, none of them about what the row does. An icon that is wrong is worse
 * than no icon: it is decoration that has to be read past (§25).
 *
 * Each of these says what the row asks of the learner: headphones for listening,
 * a waveform for a native speaker at speed, a microphone for saying it back, a
 * table for the conjugation table. Same 24×24 box and same stroke as above, so
 * they sit in a `Thumb` beside a subject icon without looking imported. */
export const ACTIVITY_ICONS = {
  quiz: "M4 6h8M4 12h8M4 18h8M16 6l1.5 1.5L21 4M16 12l1.5 1.5L21 10M16 18l1.5 1.5L21 16",
  listen: "M4 14v-2a8 8 0 0 1 16 0v2M6 12h1v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zM18 12h-1v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z",
  native: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2",
  shadow: "M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3M9 20h6",
  talk: "M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01",
  letters: "M5 19l6-14h2l6 14M8.5 14h7",
  /* Word building: three blocks growing left to right, which is the drill —
     one syllable, then two, then the word. The direction matters, and it is
     the direction core/buildup.js runs in. */
  buildup: "M4 16h4v4H4zM10 11h4v9h-4zM16 6h4v14h-4z",
  // A word turning into another word: what a case, and a case drill, is.
  cases: "M4 9h11l-3-3M15 9l-3 3M20 15H9l3-3M9 15l3 3",
  aspect: "M12 21a9 9 0 1 1 0-18M12 3a9 9 0 0 1 8.6 6.5M8 12l3 3 5-6",
  agreement: "M10 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1M14 12a3 3 0 0 1-3 3H8a3 3 0 0 1 0-6h1",
  conjugation: "M4 6h16v12H4zM4 12h16M12 6v12",
  stress: "M8 8l4-4 4 4M5 14h14M5 14v4M19 14v4",
  rules: "M5 4h10a2 2 0 0 1 2 2v6M5 4a2 2 0 0 0 0 4h10M5 4v14a2 2 0 0 0 2 2h5M15 18l2 2 4-4",
};

export const iconFor = (id) =>
  ICONS[id] || ACTIVITY_ICONS[id] ||
  (id.startsWith("core") ? ICONS.core : ICONS.speech);

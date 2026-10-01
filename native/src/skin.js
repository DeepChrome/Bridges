/* UI test: «Тетрадь», the exercise book (docs/ui-test-notebook.md).
 *
 * A second look for the whole app behind one switch in Settings, the owner,
 * 2026-09-30: *"Just have a settings button where I can flip 'UI test' mode on
 * … do not force this across the app in any way that we cannot quickly undo."*
 *
 * So this is the only file that knows about it, and it works through the
 * places the app already takes its look from: `useTheme` (colours), `faceFor`
 * (the typeface), `radius`, `useShadow`, and `Screen` (the paper). Off, every
 * one of them answers exactly as before. The choice is the phone's, kept in
 * AsyncStorage beside the Worker token, never in a profile: it is a display
 * experiment, not something a learner's history should carry.
 *
 * Switching remounts the navigator (App.js keys it on the skin), because the
 * radius and the typeface are read at render and a screen already drawn would
 * otherwise keep the old ones until something redrew it. */

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SKIN_KEY = "rb.uitest";
export const SKINS = ["default", "notebook"];

let current = "default";
const listeners = new Set();

export const isNotebook = () => current === "notebook";

/* What changes with the skin and is not a hook: the radius, which theme.js
   owns and registers here (theme.js imports this file, never the reverse). */
const onChange = new Set();
export const onSkin = (f) => { onChange.add(f); f(current); };

export function setSkin(name) {
  current = SKINS.includes(name) ? name : "default";
  onChange.forEach((f) => f(current));
  listeners.forEach((f) => f(current));
  AsyncStorage.setItem(SKIN_KEY, current).catch(() => {});
}

export async function loadSkin() {
  try {
    const v = await AsyncStorage.getItem(SKIN_KEY);
    if (v && SKINS.includes(v)) { current = v; onChange.forEach((f) => f(current)); }
  } catch { /* a skin that cannot be read is the default one */ }
  return current;
}

export function useSkin() {
  const [s, set] = useState(current);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return s;
}

/* ---------------------------------------------------------------- palettes */

/* Round two (the owner, 2026-09-30, on the first): the grid squares were
   ugly, the margin rule was a stray pink line, the handwriting was hard to
   read and the blackboard green looked "vomity" — but the contrast and the
   serif text were right. So what is left of the exercise book is ink on
   plain paper: a neutral page (not cream), dark blue ink for the brand, the
   teacher's red pen for a wrong answer and a mark. Every key the app's
   palettes have, so nothing reads undefined. */
export const paper = {
  bg: "#F5F5F2", surface: "#FFFFFF", surface2: "#ECECE8", surface3: "#DCDCD6",
  ink: "#1C1D22", ink2: "#43454D", ink3: "#5F626B",
  line: "#CFCFC9", lineSoft: "#E6E6E1",
  brand: "#233A8B", brandInk: "#1E327B", brandBg: "#E6EAF5", brandDim: "#18296A",
  good: "#2B7A4C", goodBg: "#E2F1E7", goodDim: "#21623C",
  bad: "#C42B3B", badBg: "#FAE5E7", badDim: "#A11F2E",
  info: "#2F5F9A", infoBg: "#E4ECF6",
  warn: "#986809",
  brandOn: "#FFFFFF", goodOn: "#FFFFFF", badOn: "#FFFFFF",
  pen: "#C42B3B",
};

/* Night: ink-dark blue rather than a board, chalk-white text, and a warm
   lamp gold for what matters — the contrast he liked, without the green. */
export const board = {
  bg: "#12151D", surface: "#1A1E28", surface2: "#232835", surface3: "#2E3443",
  ink: "#F0F1F4", ink2: "#C8CBD4", ink3: "#A2A7B5",
  line: "#363C4C", lineSoft: "#262B37",
  brand: "#F2C14E", brandInk: "#F5CD6B", brandBg: "#2D291D", brandDim: "#C89A2E",
  good: "#7FD3A0", goodBg: "#17302A", goodDim: "#5FB585",
  bad: "#F28B96", badBg: "#3A1F25", badDim: "#D46E79",
  info: "#8DB8EE", infoBg: "#1C2A40",
  warn: "#E8B44A",
  brandOn: "#12151D", goodOn: "#12151D", badOn: "#12151D",
  pen: "#F28B96",
};

/* ------------------------------------------------------------------- type */

/* PT Serif for everything (the handwriting face went in round two: hard to
   read). It ships a regular and a bold, so the app's four weights fold into
   two: a semibold that read as emphasis in Nunito is bold here. */
export const notebookFont = {
  regular: "PTSerif_400Regular",
  bold: "PTSerif_700Bold",
  italic: "PTSerif_400Italic",
};

export const skinFonts = {
  PTSerif_400Regular: require("../assets/fonts/PTSerif-Regular.ttf"),
  PTSerif_700Bold: require("../assets/fonts/PTSerif-Bold.ttf"),
  PTSerif_400Italic: require("../assets/fonts/PTSerif-Italic.ttf"),
};

export function notebookFace(weight) {
  const w = String(weight || "400");
  return w === "400" || w === "normal" || w === "300" ? notebookFont.regular : notebookFont.bold;
}

/* ------------------------------------------------------------ the date */

/* How a Russian pupil heads each day's page: the date in words, ordinal
   neuter nominative and the month in the genitive — «Тридцатое сентября». */
const ORD = ["Первое", "Второе", "Третье", "Четвёртое", "Пятое", "Шестое", "Седьмое", "Восьмое",
  "Девятое", "Десятое", "Одиннадцатое", "Двенадцатое", "Тринадцатое", "Четырнадцатое",
  "Пятнадцатое", "Шестнадцатое", "Семнадцатое", "Восемнадцатое", "Девятнадцатое", "Двадцатое",
  "Двадцать первое", "Двадцать второе", "Двадцать третье", "Двадцать четвёртое",
  "Двадцать пятое", "Двадцать шестое", "Двадцать седьмое", "Двадцать восьмое",
  "Двадцать девятое", "Тридцатое", "Тридцать первое"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
  "сентября", "октября", "ноября", "декабря"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export function dateInWords(d = new Date()) {
  return { ru: `${ORD[d.getDate() - 1]} ${MONTHS[d.getMonth()]}`,
           en: `${d.getDate()} ${MONTHS_EN[d.getMonth()]}` };
}

/* A Russian teacher's mark out of five. No 2: a demo that marks somebody
   down for trying is not one worth showing. */
export const markOutOfFive = (score) => (score >= 0.9 ? 5 : score >= 0.75 ? 4 : 3);

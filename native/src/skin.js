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

/* Paper: a cool white page, the 5 mm grid, violet school ink, the teacher's
   red pen. Every key the app's palettes have, so nothing reads undefined. */
export const paper = {
  bg: "#FAFBF8", surface: "#FFFFFF", surface2: "#EEF1F2", surface3: "#DCE1E5",
  ink: "#23262E", ink2: "#4A4F5A", ink3: "#646A76",
  line: "#C9D0D8", lineSoft: "#E6EBEF",
  brand: "#3F3A9E", brandInk: "#37328F", brandBg: "#ECEBF7", brandDim: "#2C2878",
  good: "#27704E", goodBg: "#E3F1EA", goodDim: "#1E5A3E",
  bad: "#C8243A", badBg: "#FBE7E9", badDim: "#A21C2F",
  info: "#2A5F9E", infoBg: "#E4EDF7",
  warn: "#9C6707",
  brandOn: "#FFFFFF", goodOn: "#FFFFFF", badOn: "#FFFFFF",
  // The paper's own marks: the grid, the margin rule, the teacher's pen.
  grid: "#DCE5EE", margin: "#E08A96", pen: "#C8243A", hand: "#3F3A9E",
};

/* The blackboard: deep green, chalk, yellow chalk for what matters. */
export const board = {
  bg: "#1D3A33", surface: "#244439", surface2: "#2B4F44", surface3: "#36594E",
  ink: "#EEF1E8", ink2: "#CBD5CC", ink3: "#B3C0B6",
  line: "#44685C", lineSoft: "#2F5147",
  brand: "#F0D35A", brandInk: "#F5DD7A", brandBg: "#35503D", brandDim: "#C9AE3E",
  good: "#9FDDB0", goodBg: "#25483A", goodDim: "#7FC093",
  bad: "#F09AA6", badBg: "#4A3438", badDim: "#D98190",
  info: "#9CC8F0", infoBg: "#274857",
  warn: "#E8C15A",
  brandOn: "#1D3A33", goodOn: "#1D3A33", badOn: "#1D3A33",
  grid: "#234439", margin: "#B77A84", pen: "#F09AA6", hand: "#F0D35A",
};

/* ------------------------------------------------------------------- type */

/* PT Serif for everything read; Caveat for the teacher's hand only. PT Serif
   ships a regular and a bold, so the app's four weights fold into two: a
   semibold that read as emphasis in Nunito is bold here. */
export const notebookFont = {
  regular: "PTSerif_400Regular",
  bold: "PTSerif_700Bold",
  italic: "PTSerif_400Italic",
  hand: "Caveat_400Regular",
};

export const skinFonts = {
  PTSerif_400Regular: require("../assets/fonts/PTSerif-Regular.ttf"),
  PTSerif_700Bold: require("../assets/fonts/PTSerif-Bold.ttf"),
  PTSerif_400Italic: require("../assets/fonts/PTSerif-Italic.ttf"),
  Caveat_400Regular: require("../assets/fonts/Caveat.ttf"),
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

#!/usr/bin/env node
/* The profile characters: animals, each in a costume (2026-09-29).
 *
 * The owner: *"rather than people can you make the avatars different animals.
 * Each should sort of have its own little persona."* Nine faces are Microsoft's
 * Fluent Emoji (flat style, MIT — data/curated/avatars/fluent/, with its
 * LICENSE); the squirrel, turtle, honey badger, Yorkie and alligator are not in
 * that set as faces, so they are drawn here in the same flat manner — the same
 * 32-unit grid, flat fills, no strokes on the animal, the set's eye and nose
 * shapes. Every costume is drawn here too.
 *
 * A character is layers in the base's own 32-unit space — `under` behind the
 * face, `over` on top — and one transform that fits the whole into the round
 * frame with room for a hat or a halo. No ids anywhere (no masks, no
 * gradients), so faces sharing a page cannot draw each other's shapes; holes
 * are even-odd paths.
 *
 *   node tools/build_avatars.mjs                  # writes core/avatars.js
 *   node tools/build_avatars.mjs --sheet out.html # a contact sheet, big and small
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = join(ROOT, "data", "curated", "avatars", "fluent");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const base = (name) => readFileSync(join(BASE, `${name}.svg`), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\n/g, "").trim();

const INK = "#1C1C1C";
const heart = (cx, cy, s) =>
  `M${cx} ${cy + 0.9 * s}C${cx - 1.9 * s} ${cy - 0.2 * s} ${cx - 1.1 * s} ${cy - 1.6 * s} ${cx} ${cy - 0.6 * s}` +
  `C${cx + 1.1 * s} ${cy - 1.6 * s} ${cx + 1.9 * s} ${cy - 0.2 * s} ${cx} ${cy + 0.9 * s}Z`;
// A round eye with a glint, the drawn heads' eye.
const eye = (x, y, r = 1.25) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;

/* ------------------------------------------------------------ the drawn heads */

const SQUIRREL = `
<path d="M18.5 29.5C27 29.5 31.2 23.5 31.2 17.2c0-5-3.2-8.8-7.3-8.8-3.1 0-5.4 2.3-5.4 5.1 0 2.3 1.7 4.1 4 4.1.9 0 1.6-.4 2-.9 0 4-2.5 7.6-6.8 9z" fill="#B85C2E"/>
<path d="M24 11.3c1.8.6 3.1 2.3 3.4 4.6" stroke="#D9793F" stroke-width="1" stroke-linecap="round" fill="none"/>
<path d="M8.6 10.2 7.6 3.2l5.2 4.4z" fill="#C8672F"/><path d="M8.1 6.5 7.6 3.2l2 1.7z" fill="#7A3A17"/>
<path d="M23.4 10.2l1-7-5.2 4.4z" fill="#C8672F"/><path d="M23.9 6.5l.5-3.3-2 1.7z" fill="#7A3A17"/>
<ellipse cx="16" cy="16.5" rx="8.6" ry="8.1" fill="#D9793F"/>
<ellipse cx="16" cy="20.2" rx="5.6" ry="4.1" fill="#F6D3A4"/>`;

const TURTLE = `
<path d="M2.5 33c0-8.5 6-13 13.5-13s13.5 4.5 13.5 13z" fill="#0F8A5F"/>
<path d="M9 23.5l3 3.5-1.5 5M23 23.5l-3 3.5 1.5 5M12 27h8M16 20v7" stroke="#0A6B49" stroke-width="1" fill="none" stroke-linejoin="round"/>
<rect x="11.6" y="17" width="8.8" height="8.5" rx="3.6" fill="#8BC34A"/>
<ellipse cx="16" cy="13.6" rx="8.6" ry="7.4" fill="#9CCC65"/>
<ellipse cx="16" cy="17.8" rx="5.2" ry="2.6" fill="#C5E1A5"/>
<circle cx="11.2" cy="10.6" r=".6" fill="#7CB342"/><circle cx="20.6" cy="9.8" r=".5" fill="#7CB342"/><circle cx="16" cy="8.4" r=".5" fill="#7CB342"/>`;

const BADGER = `
<path d="M5 32.5l5-5h12l5 5z" fill="#FAFAFA"/><path d="M16 27.5l-3.2 5M16 27.5l3.2 5" stroke="#D9D9D9" stroke-width=".8"/>
<circle cx="6.6" cy="12" r="3" fill="#2B2B2B"/><circle cx="6.6" cy="12" r="1.5" fill="#555"/>
<circle cx="25.4" cy="12" r="3" fill="#2B2B2B"/><circle cx="25.4" cy="12" r="1.5" fill="#555"/>
<ellipse cx="16" cy="18" rx="10.8" ry="9.8" fill="#2B2B2B"/>
<path d="M5.4 15.4C6.6 9.4 10.8 7 16 7s9.4 2.4 10.6 8.4c-3-1.9-6.6-2.9-10.6-2.9S8.4 13.5 5.4 15.4z" fill="#DADADA"/>
<ellipse cx="16" cy="23.4" rx="4.2" ry="3.1" fill="#3D3D3D"/>
<ellipse cx="16" cy="22.2" rx="1.7" ry="1.15" fill="#0E0E0E"/>
<path d="M14.2 25.1q1.8.9 3.6 0" stroke="#0E0E0E" stroke-width=".7" fill="none" stroke-linecap="round"/>
<ellipse cx="12" cy="18.7" rx="1.75" ry="1.5" fill="#fff"/><circle cx="12.4" cy="18.9" r=".95" fill="${INK}"/>
<ellipse cx="20" cy="18.7" rx="1.75" ry="1.5" fill="#fff"/><circle cx="19.6" cy="18.9" r=".95" fill="${INK}"/>
<path d="M9.6 16.3l4.2 1.3M22.4 16.3l-4.2 1.3" stroke="#BDBDBD" stroke-width=".9" stroke-linecap="round"/>`;

const YORKIE = `
<path d="M6 32.5c1-5 5-7.8 10-7.8s9 2.8 10 7.8z" fill="#6E7F99"/>
<path d="M8.2 12.5L6.6 4.4l6.3 4.6z" fill="#C98A48"/><path d="M7.4 8.4L6.6 4.4l3 2.2z" fill="#8A5A2B"/>
<path d="M23.8 12.5l1.6-8.1-6.3 4.6z" fill="#C98A48"/><path d="M24.6 8.4l.8-4-3 2.2z" fill="#8A5A2B"/>
<ellipse cx="16" cy="16.2" rx="8.9" ry="8.4" fill="#E0AA6A"/>
<path d="M8.6 18.2c.9 4.6 3.8 7.8 7.4 7.8s6.5-3.2 7.4-7.8l-1.4 1.6-1.3-1-1.3 1.4L18 19l-1 1.6-1-1.6-1 1.6-1-1.6-1.4 1.2-1.3-1.4-1.3 1z" fill="#F4CF95"/>
<path d="M13.9 9.2c-.4-2.1.7-3.7 2.1-4.1 1.4.4 2.5 2 2.1 4.1z" fill="#E0AA6A"/>
<path d="M16 7.3l-2.9-1.5v3zM16 7.3l2.9-1.5v3z" fill="#2F6FD6"/><circle cx="16" cy="7.3" r=".9" fill="#1D4FA8"/>
${eye(12.6, 15.6, 1.35)}${eye(19.4, 15.6, 1.35)}
<ellipse cx="16" cy="19.3" rx="1.45" ry="1.05" fill="${INK}"/>
<path d="M14.5 21.4q1.5 1.2 3 0" stroke="${INK}" stroke-width=".6" fill="none" stroke-linecap="round"/>`;

const GATOR = `
<path d="M5 32.5c1-4 5-6.5 11-6.5s10 2.5 11 6.5z" fill="#E8D98A"/>
<circle cx="10.3" cy="10" r="3.9" fill="#43A047"/><circle cx="21.7" cy="10" r="3.9" fill="#43A047"/>
<path d="M3.6 15c0-3.6 2.8-5.4 6-5.4h12.8c3.2 0 6 1.8 6 5.4v6c0 5-5.4 8.8-12.4 8.8S3.6 26 3.6 21z" fill="#4CAF50"/>
<path d="M6.8 19.2c0-2 1.9-3.1 4-3.1h10.4c2.1 0 4 1.1 4 3.1v2.6c0 3.1-4.1 5.2-9.2 5.2s-9.2-2.1-9.2-5.2z" fill="#66BB6A"/>
<circle cx="10.3" cy="10.2" r="2.35" fill="#F4E04D"/><ellipse cx="10.6" cy="10.5" rx=".55" ry="1.5" fill="${INK}"/>
<circle cx="21.7" cy="10.2" r="2.35" fill="#F4E04D"/><ellipse cx="21.4" cy="10.5" rx=".55" ry="1.5" fill="${INK}"/>
<path d="M7.6 9.6c.6-2.5 4.4-3.2 5.6-1.2l.2 2.3c-1.8-.9-3.9-1.1-5.8-1.1z" fill="#2E7D32"/>
<path d="M24.4 9.6c-.6-2.5-4.4-3.2-5.6-1.2l-.2 2.3c1.8-.9 3.9-1.1 5.8-1.1z" fill="#2E7D32"/>
<ellipse cx="13.6" cy="18" rx=".8" ry=".55" fill="#1B5E20"/><ellipse cx="18.4" cy="18" rx=".8" ry=".55" fill="#1B5E20"/>
<path d="M9 23.2c2.6-1.5 11.4-1.5 14 0" stroke="#1B5E20" stroke-width=".9" fill="none" stroke-linecap="round"/>
<path d="M10.4 22.7l.7 1.6.7-1.9zM20.2 22.4l.7 1.9.7-1.6z" fill="#fff"/>
<circle cx="13" cy="13.6" r=".55" fill="#388E3C"/><circle cx="16" cy="13" r=".55" fill="#388E3C"/><circle cx="19" cy="13.6" r=".55" fill="#388E3C"/>`;

/* --------------------------------------------------------------- the cast */

/* `t`: the group transform [scale, dx, dy]. Russian names, since the app is
   about Russian; several are the animal's own word or a character a Russian
   child knows (Тортила from Buratino, Гена from Cheburashka, the frog
   tsarevna of the folk tale). `role` is the persona, shown when one is picked. */
const CAST = [
  {
    id: "yuri", name: "Yuri", role: "Cosmonaut, obviously", bg: "#1D2B53",
    base: "monkey_face", t: [0.72, 4.5, 3.2],
    over: `<circle cx="16" cy="17.3" r="15.4" fill="#BFE3FF" fill-opacity=".2" stroke="#E6EEF7" stroke-width="1.5"/>
      <path d="M5.8 12.2a12 12 0 0 1 6.4-6.6" stroke="#fff" stroke-opacity=".9" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <path d="M7.5 7.8a10 10 0 0 1 1.6-1.2" stroke="#fff" stroke-opacity=".9" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <path d="M3.6 31h24.8c1.4 0 2.6 1.1 2.6 2.5V36H1v-2.5C1 32.1 2.2 31 3.6 31z" fill="#E8ECF2"/>
      <rect x="2.6" y="30.3" width="26.8" height="1.8" rx=".9" fill="#98A6B8"/>
      <circle cx="23.5" cy="33.6" r="1.2" fill="#E6394A"/><rect x="6.5" y="32.9" width="4" height="1.3" rx=".6" fill="#3D6FD9"/>`,
  },
  {
    id: "belka", name: "Belka", role: "Saves the day, hides the nuts", bg: "#FFD166",
    head: SQUIRREL, t: [0.86, 2.4, 3.2],
    over: `<path d="M3.5 33c.5-4 3-6.6 6.5-7.6h12c3.5 1 6 3.6 6.5 7.6z" fill="#E53935"/>
      <path d="M10 25.4h12l-1.4 2.2H11.4z" fill="#B71C1C"/>
      <circle cx="16" cy="30" r="2.1" fill="#FFD166"/><path d="M16.6 28.4l-1.6 1.9h1.2l-.8 1.7 1.8-2.2h-1.2z" fill="#E53935"/>
      <path fill-rule="evenodd" d="M7 14.6c0-1.8 1.8-2.8 4-2.8h10c2.2 0 4 1 4 2.8 0 1.6-1.3 2.9-3.2 2.9-1.4 0-2.3-.7-2.9-1.4h-1.8c-.6.7-1.5 1.4-2.9 1.4-2.2 0-3.2-1.3-3.2-2.9z M10 14.6a1.7 1.4 0 1 0 3.4 0a1.7 1.4 0 1 0-3.4 0z M18.6 14.6a1.7 1.4 0 1 0 3.4 0a1.7 1.4 0 1 0-3.4 0z" fill="#1E63D6"/>
      <circle cx="11.9" cy="14.7" r=".8" fill="${INK}"/><circle cx="20.1" cy="14.7" r=".8" fill="${INK}"/>
      <path d="M15 18.3h2l-1 1.1z" fill="#5A2E14"/>
      <path d="M13.8 20.2q2.2 1.5 4.4 0" stroke="#5A2E14" stroke-width=".6" fill="none" stroke-linecap="round"/>
      <rect x="15.1" y="20.8" width="1.8" height="1.6" rx=".3" fill="#fff"/>`,
  },
  {
    id: "zaya", name: "Zaya", role: "Too cool for carrots", bg: "#FF8FAB",
    base: "rabbit_face", t: [0.8, 3.2, 4.4],
    over: `<ellipse cx="9" cy="22" rx="2" ry="1.2" fill="#FF8FAB" fill-opacity=".7"/><ellipse cx="23" cy="22" rx="2" ry="1.2" fill="#FF8FAB" fill-opacity=".7"/>
      <path d="${heart(12, 18.4, 2.6)}" fill="#E91E63"/><path d="${heart(20, 18.4, 2.6)}" fill="#E91E63"/>
      <path d="M13.9 17.2q2.1-1 4.2 0" stroke="#AD1457" stroke-width=".7" fill="none"/>
      <path d="M8 17.3l-2.2-1M24 17.3l2.2-1" stroke="#AD1457" stroke-width=".7" stroke-linecap="round"/>
      <path d="M10.6 17.3q.7-.9 1.6-.6" stroke="#fff" stroke-opacity=".8" stroke-width=".5" fill="none" stroke-linecap="round"/>
      <path d="M18.6 17.3q.7-.9 1.6-.6" stroke="#fff" stroke-opacity=".8" stroke-width=".5" fill="none" stroke-linecap="round"/>
      <circle cx="11.3" cy="12.2" r="1.3" fill="none" stroke="#F5C542" stroke-width=".6"/>`,
  },
  {
    id: "lisa", name: "Lisa", role: "Master of the midnight heist", bg: "#2E3A59",
    base: "fox", t: [0.78, 3, 4.6],
    under: `<circle cx="25" cy="26.6" r="3.9" fill="#C9B18E"/><path d="M23.3 23.1l1.7 1.1 1.7-1.1-.7 1.8h-2z" fill="#A08660"/>
      <path d="M25.9 25.4q-.9-.8-1.8 0 1.8 1 0 2.2.9.8 1.8 0M25 24.8v.6M25 27.8v.6" stroke="#7B6445" stroke-width=".5" fill="none"/>`,
    over: `<path d="M8.6 5.9h14c.6 0 .7-3 0-3.6C21 1 18.3.4 15.6.4S10.2 1 8.6 2.3c-.7.6-.6 3.6 0 3.6z" fill="#263238"/>
      <path d="M8.9 4.2h13.4M9.3 2.4h12.6" stroke="#ECEFF1" stroke-width=".8"/>
      <circle cx="15.6" cy="-.4" r="1.3" fill="#ECEFF1"/>
      <path d="M6.2 18.6c0-1.9 2-2.8 4.5-2.8h9.9c2.5 0 4.5.9 4.5 2.8 0 1.6-1.4 2.6-3.4 2.6-1.4 0-2.5-.6-3.2-1.4h-5.6c-.7.8-1.8 1.4-3.2 1.4-2 0-3.5-1-3.5-2.6z" fill="#1A1A1A"/>
      <ellipse cx="12" cy="18.5" rx="1.8" ry="1.25" fill="#fff"/><circle cx="12.9" cy="18.6" r=".85" fill="${INK}"/>
      <ellipse cx="19.2" cy="18.5" rx="1.8" ry="1.25" fill="#fff"/><circle cx="20.1" cy="18.6" r=".85" fill="${INK}"/>`,
  },
  {
    id: "tortila", name: "Tortila", role: "Slow, wise, never wrong", bg: "#B9FBC0",
    head: TURTLE, t: [0.86, 2.2, 3.6],
    over: `${eye(12.4, 13.4, 1.15)}${eye(19.6, 13.4, 1.15)}
      <circle cx="12.4" cy="13.4" r="2.7" fill="#E3F2FD" fill-opacity=".35" stroke="#5D4037" stroke-width=".8"/>
      <circle cx="19.6" cy="13.4" r="2.7" fill="#E3F2FD" fill-opacity=".35" stroke="#5D4037" stroke-width=".8"/>
      <path d="M15.1 13.2q.9-.7 1.8 0M9.7 13l-1.9-.9M22.3 13l1.9-.9" stroke="#5D4037" stroke-width=".8" fill="none" stroke-linecap="round"/>
      <path d="M9.8 9.6q2.5-1.5 4.9-.2M17.3 9.4q2.4-1.3 4.9.2" stroke="#F5F5F5" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M13.8 17.4q2.2 1.4 4.4 0" stroke="#33691E" stroke-width=".7" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: "borsuk", name: "Borsuk", role: "Black belt, zero fear", bg: "#FFADAD",
    head: BADGER, t: [0.86, 2.2, 3.6],
    over: `<path d="M5 15c3.5-2.1 7.1-3.1 11-3.1s7.5 1 11 3.1l-.4 2.5c-3.4-1.9-6.9-2.8-10.6-2.8s-7.2.9-10.6 2.8z" fill="#E53935"/>
      <circle cx="16" cy="13.5" r="1.3" fill="#fff"/><circle cx="16" cy="13.5" r=".7" fill="#E53935"/>
      <path d="M26.6 15.4l4.6-3.4.4 2.2zM26.6 15.6l4 2.8-1.6 1.2z" fill="#C62828"/><circle cx="26.8" cy="15.6" r="1" fill="#B71C1C"/>`,
  },
  {
    id: "serafim", name: "Serafim", role: "Small dog, big halo", bg: "#A0C4FF",
    under: `<path d="M9 22.6C4.8 22.9 1.2 20.4.6 15.8c1.5.6 2.8.7 3.8.3-1.2-1-1.8-2.3-1.8-3.9 1.8 1.2 3.4 1.7 4.8 1.5-.6-.9-.8-1.9-.6-3 1.8 1.4 3.3 3.6 3.9 6.2z" fill="#fff"/>
      <path d="M23 22.6c4.2.3 7.8-2.2 8.4-6.8-1.5.6-2.8.7-3.8.3 1.2-1 1.8-2.3 1.8-3.9-1.8 1.2-3.4 1.7-4.8 1.5.6-.9.8-1.9.6-3-1.8 1.4-3.3 3.6-3.9 6.2z" fill="#fff"/>
      <path d="M1.7 16.4q2.4 1.4 5.2 1.2M3.5 13.2q2.2 1.6 4.6 1.4M30.3 16.4q-2.4 1.4-5.2 1.2M28.5 13.2q-2.2 1.6-4.6 1.4" stroke="#D5DEEA" stroke-width=".6" fill="none"/>`,
    head: YORKIE, t: [0.84, 2.6, 4.6],
    over: `<ellipse cx="16" cy="2.6" rx="6" ry="1.6" fill="none" stroke="#FFC83D" stroke-width="1.3"/>`,
  },
  {
    id: "gena", name: "Gena", role: "Not a morning crocodile", bg: "#FDFFB6",
    head: GATOR, t: [0.86, 2.2, 3.4],
    over: `<path d="M5.8 4.6q1.6-1.4.4-3M9 3.2q1.6-1.4.4-3M26.2 4.6q-1.6-1.4-.4-3M23 3.2q-1.6-1.4-.4-3" stroke="#90A4AE" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: "filin", name: "Filin", role: "Night owl, spins till dawn", bg: "#CDB4DB",
    base: "owl", t: [0.8, 3.6, 5],
    over: `<path d="M4.6 13C4.6 4.8 10 .6 16 .6s11.4 4.2 11.4 12.4" stroke="#263238" stroke-width="1.5" fill="none"/>
      <rect x="2.2" y="10.6" width="4.6" height="7.2" rx="2.2" fill="#E91E63"/><rect x="3.3" y="11.8" width="2" height="4.8" rx="1" fill="#263238"/>
      <rect x="25.2" y="10.6" width="4.6" height="7.2" rx="2.2" fill="#E91E63"/><rect x="26.7" y="11.8" width="2" height="4.8" rx="1" fill="#263238"/>
      <path d="M23.5 23.5l.5-3 2.3 1-.5 3.4a1.3 1.3 0 1 1-.8-1.4l.3-2-1.4-.5-.4 2.7a1.3 1.3 0 1 1-.8-1.4z" fill="#fff"/>`,
  },
  {
    id: "misha", name: "Misha", role: "Warm hat, warmer heart", bg: "#8ECAE6",
    base: "bear", t: [0.8, 3.2, 5],
    over: `<path d="M3.5 12.5C3.5 4.8 9 1.8 16.5 1.8S29.5 4.8 29.5 12.5c-4-1.4-8.3-2-13-2s-9 .6-13 2z" fill="#6D4C41"/>
      <path d="M2.2 13c3.8-2 8.8-3 14.3-3s10.5 1 14.3 3l-.3 2.6c-3.9-1.8-8.6-2.7-14-2.7s-10.1.9-14 2.7z" fill="#A1887F"/>
      <path d="M2.2 13.4c-.8 2.6-.6 5.3.4 7.3l2.4-.6c-.5-2-.4-4.2.2-6.4zM30.8 13.4c.8 2.6.6 5.3-.4 7.3l-2.4-.6c.5-2 .4-4.2-.2-6.4z" fill="#A1887F"/>
      <path d="M9 5.5q3-1.8 7.5-2" stroke="#8D6E63" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: "barsik", name: "Barsik", role: "Sails for fish, not gold", bg: "#90DBF4",
    base: "cat_face", t: [0.8, 3.2, 5],
    over: `<path d="M5.2 10.2c2-4 6.1-6 10.8-6s8.8 2 10.8 6c-3.4-1-7-1.5-10.8-1.5s-7.4.5-10.8 1.5z" fill="#D32F2F"/>
      <circle cx="11" cy="7.6" r=".6" fill="#fff"/><circle cx="16" cy="6.2" r=".6" fill="#fff"/><circle cx="21" cy="7.6" r=".6" fill="#fff"/>
      <path d="M26.6 9.6l3.6-1.4-1 2.2 1.8 1.3-4.1-.3z" fill="#B71C1C"/>
      <path d="M11 13.2l13.8 6.6" stroke="#1A1A1A" stroke-width=".7"/>
      <ellipse cx="19.6" cy="17.5" rx="2.2" ry="2" fill="#1A1A1A"/>
      <circle cx="26" cy="23.5" r=".9" fill="none" stroke="#F5C542" stroke-width=".5"/>`,
  },
  {
    id: "tsarevna", name: "Tsarevna", role: "Kiss optional", bg: "#FFC8DD",
    base: "frog", t: [0.8, 3.2, 5.6],
    over: `<path d="M11.4 7.2l.4-4.6 2.3 2.4L16 .9l1.9 4.1 2.3-2.4.4 4.6z" fill="#FFC83D"/>
      <rect x="11.2" y="6.4" width="9.6" height="1.6" rx=".6" fill="#F5A623"/>
      <circle cx="16" cy="3.6" r=".8" fill="#E91E63"/><circle cx="12.6" cy="5.2" r=".5" fill="#29B6F6"/><circle cx="19.4" cy="5.2" r=".5" fill="#29B6F6"/>
      <ellipse cx="8.6" cy="15.2" rx="1.8" ry="1" fill="#FF8FAB" fill-opacity=".7"/><ellipse cx="23.4" cy="15.2" rx="1.8" ry="1" fill="#FF8FAB" fill-opacity=".7"/>`,
  },
  {
    id: "pirozhok", name: "Pirozhok", role: "Chef of a thousand dumplings", bg: "#F4A261",
    base: "panda", t: [0.78, 3.5, 6.4],
    over: `<path d="M9.2 7.4c-2.6 0-4.4-1.9-4.4-4.2S6.8-.9 9.4-.9c.8-2 3.4-3.4 6.6-3.4s5.8 1.4 6.6 3.4c2.6 0 4.6 1.8 4.6 4.1s-1.8 4.2-4.4 4.2z" fill="#fff" stroke="#E0E0E0" stroke-width=".5"/>
      <rect x="9.2" y="5.6" width="13.6" height="3.4" rx=".8" fill="#fff" stroke="#E0E0E0" stroke-width=".5"/>
      <path d="M11.5 21.5c1.4-.9 3-.9 4.5.2 1.5-1.1 3.1-1.1 4.5-.2-1.3 1.1-3.1 1.4-4.5.5-1.4.9-3.2.6-4.5-.5z" fill="#3E2723"/>`,
  },
  {
    id: "senya", name: "Senya", role: "Paints in the moonlight", bg: "#06D6A0",
    base: "raccoon", t: [0.8, 3.2, 5.2],
    over: `<path d="M8 9.6c0-3.3 3.6-5.8 8.6-5.8s9.4 2.4 9.4 5.5c-2.8-.7-5.8-1-9-1s-6.4.5-9 1.3z" fill="#5C6BC0"/>
      <path d="M16.6 3.9l.3-1.8" stroke="#3949AB" stroke-width="1" stroke-linecap="round"/>
      <path d="M25.6 27.4l4.2-6.2 1.2.8-4.2 6.2z" fill="#8D6E63"/><path d="M29.8 21.2l1.2.8.9-2.3z" fill="#FFB300"/>
      <circle cx="9.4" cy="24.4" r=".8" fill="#FF7043"/><circle cx="22.8" cy="25.6" r=".6" fill="#29B6F6"/>`,
  },
];

/* Profiles from before the animals keep a character of their own rather than
   all falling to the first (rule 20.4's spirit: a profile's choices are its
   data). The monkeynaut was the owner's own picture and is Yuri. */
const LEGACY = {
  monkeynaut: "yuri", gymbun: "zaya", shadesduck: "senya", djcat: "filin", scarfbear: "misha",
  profowl: "tortila", kingfrog: "tsarevna", bowtiepen: "pirozhok", sneakfox: "lisa", spikelib: "belka",
  curls: "yuri", mint: "belka", blossom: "zaya", fern: "lisa", ginger: "tortila", frost: "borsuk",
  ace: "serafim", shades: "gena", bun: "filin", teal: "misha", bubblegum: "tsarevna", sunny: "barsik",
};

function markup(c) {
  const [s, dx, dy] = c.t;
  const inner = (c.under || "") + (c.base ? base(c.base) : "") + (c.head || "") + (c.over || "");
  return `<g transform="translate(${dx} ${dy}) scale(${s})">${inner.replace(/\n\s*/g, "")}</g>`;
}

const out = {};
for (const c of CAST) out[c.id] = { name: c.name, role: c.role, bg: c.bg, vb: "0 0 32 32", svg: markup(c) };
for (const [old, now] of Object.entries(LEGACY)) {
  if (!out[now]) throw new Error(`legacy id ${old} points at ${now}, which is not in the cast`);
}

const sheet = opt("--sheet");
if (sheet) {
  const face = (a, px) => `<div style="width:${px}px;height:${px}px;border-radius:50%;overflow:hidden;background:${a.bg}">` +
    `<svg viewBox="${a.vb}" width="${px}" height="${px}">${a.svg}</svg></div>`;
  let html = `<!doctype html><meta charset="utf-8"><style>body{font:13px system-ui;margin:14px;background:#f5f6f8}
    .row{display:flex;flex-wrap:wrap;gap:14px}.c{width:150px;text-align:center}.c>div{margin:auto}
    b{display:block;margin-top:6px}small{color:#666}</style><div class="row">`;
  for (const id in out) html += `<div class="c">${face(out[id], 140)}<b>${out[id].name}</b><small>${out[id].role}</small></div>`;
  html += `</div><div class="row" style="margin-top:18px">`;
  for (const id in out) html += face(out[id], 40);
  html += `</div>`;
  writeFileSync(sheet, html);
  console.log(`contact sheet: ${CAST.length} characters → ${sheet}`);
  process.exit(0);
}

const credit = {
  title: "Fluent Emoji",
  creator: "Microsoft",
  license: "MIT",
  url: "https://github.com/microsoft/fluentui-emoji",
  via: "nine of the faces",
};

const src = `/* GENERATED by tools/build_avatars.mjs — do not edit. Re-run the tool.
 *
 * The profile characters: ${CAST.length} animals, each in a costume with a name
 * and a persona. Nine faces are Microsoft's Fluent Emoji (MIT); the rest of the
 * art is drawn in the tool. Each is its viewBox and inner markup; a renderer
 * wraps it in its own <svg> at the size it needs.
 */

export const AV = ${JSON.stringify(out, null, 2)};

export const AV_IDS = Object.keys(AV);

/* Profiles made before the animals carry a hand-drawn or DiceBear id. Each
   keeps a character of its own rather than all falling to the first. */
export const AV_LEGACY = ${JSON.stringify(LEGACY, null, 2)};

export const avatarOf = (id) => AV[id] || AV[AV_LEGACY[id]] || AV[AV_IDS[0]];

/* The licence obligation (rule 20.10), drawn by the credits screen. */
export const AV_CREDIT = ${JSON.stringify(credit, null, 2)};
`;
writeFileSync(join(ROOT, "core", "avatars.js"), src);
const bytes = Object.values(out).reduce((n, a) => n + a.svg.length, 0);
console.log(`core/avatars.js: ${CAST.length} characters, ${(bytes / 1024).toFixed(1)} KB of markup`);

/* How a packed clip is found (2026-11-19). The generated audio modules list a
 * clip that is not in the app as `[pack, name]` (tools/build_word_assets.mjs);
 * whoever owns the packs on this platform registers a resolver — the phone's
 * audiopacks.js answers `{ uri }` for an installed pack and null for one not
 * yet fetched, the desktop answers its own asset URL, since it ships every
 * file. Without a resolver a packed clip is simply absent and the device
 * voice reads the word, which is what a build with no network gets. Kept
 * apart from the generated modules so a rebuild never touches it. */
let resolver = null;
export const setPackResolver = (fn) => { resolver = typeof fn === "function" ? fn : null; };
export function packedClip(entry, packs) {
  if (!resolver || !Array.isArray(entry)) return null;
  const pack = packs[entry[0]];
  return pack ? resolver(pack, entry[1]) : null;
}

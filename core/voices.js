/* Which of Android's Russian voices is a man, which a woman, and which is
 * silent.
 *
 * Established by ear, on the owner's Pixel 9, 2026-09-11. He listened to all
 * nineteen Russian voices the phone offers and reported what each one was —
 * and the answers came back **internally consistent in a way he could not have
 * arranged**: Google ships each voice twice, once `-local` and once
 * `-network`, and he never once split a pair. `rud` was a man both times,
 * `rue` a woman both times, and so on down the list. That is what makes this a
 * measurement rather than a guess, and it is why it generalises: the
 * three-letter code is the voice's identity, and the suffix is only how it is
 * delivered.
 *
 *     ruc  woman        rud  man
 *     rue  woman        ruf  man
 *     dfc  woman
 *
 * **The `star` voices say nothing at all.** Eight of the nineteen are
 * `ru-ru-x-starNN-local`, and every one of them was silent when tapped. They
 * are listed by the platform and cannot speak, which is the worst kind of
 * option: a character assigned one simply does not talk, and nothing reports
 * an error. They are ranked last rather than banned, because a device that has
 * only those is better served by trying them than by silence on purpose.
 *
 * `ru-RU-language` is deliberately **not** in the table. It is an alias for
 * whichever voice the phone is set to use by default, so its sex is a property
 * of that phone and not of the name — he heard a woman, another device would
 * hear whatever it is set to. It ranks as unknown, and with ten real voices
 * either side of it, nothing is lost.
 */

/* The three-letter code out of `ru-ru-x-ruf-local`, or null for a name that is
   not shaped like one — `ru-RU-language`, or anything iOS produces. */
export function voiceCode(identifier) {
  const m = /-x-([a-z0-9]+?)(?:-(?:local|network))?$/i.exec(String(identifier || ""));
  return m ? m[1].toLowerCase() : null;
}

export const RU_VOICE_SEX = {
  ruc: "f", rue: "f", dfc: "f",
  rud: "m", ruf: "m",
};

/* A voice that is listed but does not speak. Matched on the family rather than
   the exact name: they are numbered star02…star16 and the numbering is not a
   list anybody should be maintaining. */
const SILENT = /^star\d*$/;
export const isSilentVoice = (identifier) => SILENT.test(voiceCode(identifier) || "");

/* What we know about a voice, from its name alone: "f", "m", or null. */
export function knownVoiceSex(identifier) {
  const code = voiceCode(identifier);
  return (code && RU_VOICE_SEX[code]) || null;
}

/* Best first. A voice we can name the sex of beats one we cannot; among
   equals, `-local` beats `-network`, because local speaks with no connection
   and this app is used on a train. Anything silent goes to the back. */
export function rankVoice(identifier) {
  const id = String(identifier || "");
  if (isSilentVoice(id)) return 3;
  if (!knownVoiceSex(id)) return 2;
  return /-local$/i.test(id) ? 0 : 1;
}

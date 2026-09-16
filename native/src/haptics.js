/* The phone's answer to a press (PLAYBOOK 5.1, 5.2).
 *
 * One file, for the same reason `motion.js` is one file: a screen that
 * invents its own feedback is why an interface feels assembled. Four things
 * happen in this app that are worth feeling, and nothing else vibrates:
 *
 *   `tap()`      a primary control going down — the weight of a button
 *   `right()`    an answer that was correct
 *   `wrong()`    an answer that was not
 *   `done()`     a run finished, a lesson passed
 *
 * **Not on every press.** A phone that buzzes at everything is a phone people
 * turn off, and then the three that carry meaning are gone with it. Rows,
 * links, tabs and the transport stay silent.
 *
 * Every call is fire-and-forget and swallowed: haptics are unavailable on a
 * device with the motor disabled, on a simulator, and behind a system setting
 * the app cannot read. A missing buzz must never be able to break an answer
 * being graded, so nothing here is awaited and nothing here can throw.
 */

import * as Haptics from "expo-haptics";

let on = true;
/* Off in tests and wherever the platform has nothing to offer; `setHaptics`
   is how the settings switch reaches it without every call site knowing. */
export const setHaptics = (v) => { on = !!v; };
export const hapticsOn = () => on;

const fire = (fn) => {
  if (!on) return;
  try { const p = fn(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* no motor, or no permission */ }
};

export const tap = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const right = () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const wrong = () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
export const done = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/* Keyboard shortcuts, the desktop's native tongue.
 *
 * `useKeys(map, deps)` binds while the component is mounted: `map` is
 * { "1": fn, "Enter": fn, "ctrl+z": fn, " ": fn }. A key typed into a text
 * field is the field's, not ours, unless the binding says `always`. */

import { useEffect } from "react";

const inField = (e) => {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

function keyName(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return parts.join("+");
}

export function useKeys(map, deps = []) {
  useEffect(() => {
    const on = (e) => {
      const name = keyName(e);
      const entry = map[name];
      if (!entry) return;
      const fn = typeof entry === "function" ? entry : entry.fn;
      const always = typeof entry === "object" && entry.always;
      if (inField(e) && !always) return;
      if (e.repeat) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

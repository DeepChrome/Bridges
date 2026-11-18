/* The media-key bridge, from JavaScript (android/…/RemoteModule.kt). Absent
   in a build without the module — a test, a dev client made before it — every
   call is a no-op and nothing listens, so a screen asks `available` only to
   say so. */
import { requireOptionalNativeModule } from "expo-modules-core";

const Native = requireOptionalNativeModule("YaRemote");

export const available = !!Native;

/* Hold the session: this screen takes the media keys from now on. */
export function start(title, playing) {
  if (Native) Native.start(String(title || ""), !!playing);
}
export function setPlaying(on) { if (Native) Native.setPlaying(!!on); }
export function setTitle(title) { if (Native) Native.setTitle(String(title || "")); }
/* Let the session go. */
export function stop() { if (Native) Native.stop(); }

/* `fn(key)` for every press: play · pause · toggle · next · previous ·
   forward · rewind. Returns the unsubscribe. */
export function onKey(fn) {
  if (!Native) return () => {};
  const sub = Native.addListener("remoteKey", (e) => fn(e && e.key));
  return () => sub.remove();
}

/* expo-audio's media sessions hand their media keys to the app (CLAUDE.md 30cy).
 *
 * Every expo-audio player is built with a Media3 MediaSession, and Android
 * gives a headset's keys to the session that played most recently. In drive
 * mode that is a word clip for most of the time, and the clip's session — or
 * the silent carrier's, with expo-audio's own callback — swallows the press:
 * its callback removes next/previous outright and seeks its own player for
 * the rest, and nothing reaches JavaScript. This patch has both callbacks
 * broadcast the KeyEvent to this app instead, where modules/ya-remote's
 * receiver turns it into the same `remoteKey` event the app's own session
 * sends. Whichever session Android picked, the press lands.
 *
 * It edits node_modules, which `npm install` rewrites, so native/tools/build.ps1
 * runs it before Gradle on every build; it is idempotent and says what it did.
 *
 *   node tools/patch_expo_audio.mjs            # apply (no-op when applied)
 *   node tools/patch_expo_audio.mjs --check    # exit 1 unless every edit is in
 *
 * Pinned to expo-audio 57.x's source text: an upgrade that moves the lines
 * fails here with the file named, rather than building an app whose drive
 * mode misses presses again.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "native/node_modules/expo-audio/android/src/main/java/expo/modules/audio");
const MARK = "ya-remote";

const FORWARDER = `package expo.modules.audio

// ${MARK}: written by tools/patch_expo_audio.mjs. Hands a media key to the app
// (modules/ya-remote) instead of letting a clip's session act on it.
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.KeyEvent
import androidx.media3.session.MediaSession

object YaRemoteKeys {
  @Volatile var context: Context? = null

  /* True when the key was handed over (and so is handled here). */
  fun forward(intent: Intent?): Boolean {
    val c = context ?: return false
    val ev: KeyEvent = (if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      else @Suppress("DEPRECATION") intent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT)) ?: return false
    try {
      c.sendBroadcast(Intent(c.packageName + ".REMOTE_KEY").setPackage(c.packageName)
        .putExtra(Intent.EXTRA_KEY_EVENT, ev))
    } catch (e: Exception) {
      return false
    }
    return true
  }

  class Forwarding : MediaSession.Callback {
    override fun onMediaButtonEvent(session: MediaSession, controller: MediaSession.ControllerInfo, intent: Intent): Boolean =
      forward(intent) || super.onMediaButtonEvent(session, controller, intent)
  }
}
`;

const EDITS = [
  {
    file: "YaRemoteKeys.kt",
    apply: () => FORWARDER,
    applied: (s) => s === FORWARDER,
  },
  {
    file: "AudioUtils.kt",
    find: `  return MediaSession.Builder(context, player)
    .setId("ExpoAudioBasicMediaSession_\${player.hashCode()}")
    .build()`,
    replace: `  YaRemoteKeys.context = context.applicationContext   // ${MARK}
  return MediaSession.Builder(context, player)
    .setId("ExpoAudioBasicMediaSession_\${player.hashCode()}")
    .setCallback(YaRemoteKeys.Forwarding())   // ${MARK}
    .build()`,
  },
  {
    file: "service/AudioMediaSessionCallback.kt",
    find: `  override fun onCustomCommand(`,
    replace: `  // ${MARK}: a headset's key goes to the app, not to the carrier.
  override fun onMediaButtonEvent(session: MediaSession, controller: MediaSession.ControllerInfo, intent: android.content.Intent): Boolean =
    expo.modules.audio.YaRemoteKeys.forward(intent) || super.onMediaButtonEvent(session, controller, intent)

  override fun onCustomCommand(`,
  },
];

const check = process.argv.includes("--check");
let changed = 0, missing = 0;

/* SDK 57 ships expo-audio as a prebuilt AAR (local-maven-repo), which Gradle
   takes unless the app opts the package out; a patched source nobody compiles
   is no patch. native/package.json's expo.autolinking.android.buildFromSource
   must name it, and this says so rather than passing. */
{
  const pkg = JSON.parse(readFileSync(join(ROOT, "native/package.json"), "utf8"));
  const a = ((pkg.expo || {}).autolinking || {});
  const from = [].concat(a.buildFromSource || [], (a.android || {}).buildFromSource || []);
  if (from.includes("expo-audio")) console.log("  ok    package.json builds expo-audio from source");
  else { console.log("  FAIL  package.json: expo.autolinking.android.buildFromSource lacks expo-audio (the prebuilt AAR would ship, unpatched)"); missing++; }
}
for (const e of EDITS) {
  const path = join(SRC, e.file);
  const have = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (e.apply) {
    if (have !== null && e.applied(have)) { console.log(`  ok    ${e.file}`); continue; }
    if (check) { console.log(`  MISSING ${e.file}`); missing++; continue; }
    writeFileSync(path, e.apply(), "utf8"); changed++; console.log(`  wrote ${e.file}`);
    continue;
  }
  if (have === null) { console.log(`  MISSING ${e.file} (no such file — is expo-audio installed?)`); missing++; continue; }
  if (have.includes(MARK)) { console.log(`  ok    ${e.file}`); continue; }
  if (!have.includes(e.find)) {
    console.log(`  FAIL  ${e.file}: the lines to patch are not there (expo-audio changed?)`);
    missing++;
    continue;
  }
  if (check) { console.log(`  MISSING ${e.file}`); missing++; continue; }
  writeFileSync(path, have.replace(e.find, e.replace), "utf8"); changed++; console.log(`  patched ${e.file}`);
}
console.log(check ? `${missing} missing` : `${changed} changed, ${missing} failed`);
process.exit(missing ? 1 : 0);

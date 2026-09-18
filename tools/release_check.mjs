/* Is this artifact one Google Play would accept?
 *
 * Every build so far has been side-loaded, and the Expo template signs release
 * builds with the **debug** key (ROADMAP 13.41) — which Play refuses, and which
 * is impossible to see by looking at the file. A store upload is also the one
 * action in this project that cannot be taken back: the first bundle fixes the
 * package name and the signing identity for the life of the listing.
 *
 * So this reads the built artifact rather than the build files, and says what
 * is actually in it.
 *
 *   node tools/release_check.mjs                  # the .aab, then the .apk
 *   node tools/release_check.mjs --file <path>
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "native/android/app/build/outputs");
const AAB = join(OUT, "bundle/release/app-release.aab");
const APK = join(OUT, "apk/release/app-release.apk");

const KEYTOOL = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, "bin", "keytool.exe")
  : "keytool";

/* Play's ceiling for the base of an app bundle. An APK is capped far lower
   (100 MB), which is why the bundle is the format that ships. */
const AAB_MAX_MB = 150;

let pass = 0, fail = 0, warn = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "pass" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  cond ? pass++ : fail++;
};
const note = (label, detail) => { console.log(`  warn  ${label}${detail ? `  ${detail}` : ""}`); warn++; };

/* The newest `apksigner`, which is the only thing that reads an APK signed with
   Signature Scheme v2/v3 — the scheme every modern build uses. */
function apksigner() {
  const root = join(process.env.ANDROID_HOME || "C:/Android/sdk", "build-tools");
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root).sort();
  for (let i = dirs.length - 1; i >= 0; i--) {
    const p = join(root, dirs[i], "apksigner.bat");
    if (existsSync(p)) return p;
  }
  return null;
}

/* The signer's distinguished name, straight out of the file. The debug key is
   Android's own and always says so — CN=Android Debug.
 *
 * Two tools, because one does not cover both formats. An `.aab` carries a
 * JAR signature that `keytool` reads; an `.apk` is signed with Scheme v2/v3,
 * which `keytool -printcert -jarfile` cannot see at all — it returned **no
 * signer**, and the first version of this check read that as "not the debug
 * key" and passed. A check that cannot see the thing it is checking must say
 * so, never pass (§30r). */
function signer(path) {
  const apk = path.endsWith(".apk");
  const tool = apk ? apksigner() : KEYTOOL;
  if (!tool) return { owner: "", error: "no apksigner in the Android SDK build-tools" };
  const args = apk ? ["verify", "--print-certs", path] : ["-printcert", "-jarfile", path];
  try {
    /* `shell: true` because apksigner is a .bat, which Node refuses to spawn
       directly on Windows (EINVAL). Quoted for the same reason. */
    const out = execFileSync(`"${tool}"`, args.map((a) => `"${a}"`),
                             { encoding: "utf8", shell: true });
    const owner = (out.match(/(?:Owner|Signer #1 certificate DN):\s*(.+)/) || [])[1] || "";
    const until = (out.match(/Valid from:.*until:\s*(.+)/) || [])[1] || "";
    return { owner: owner.trim(), until: until.trim(), raw: out };
  } catch (e) {
    return { owner: "", until: "", error: String(e.message || e).split("\n")[0] };
  }
}

function check(path, kind) {
  console.log(`\n${kind}: ${path.replace(ROOT, ".")}`);
  if (!existsSync(path)) {
    note(`no ${kind} built`, kind === "aab" ? "gradlew bundleRelease" : "gradlew assembleRelease");
    return;
  }
  const mb = statSync(path).size / 1e6;
  console.log(`  size  ${mb.toFixed(1)} MB`);

  const s = signer(path);
  if (s.error) { note("could not read the signature", s.error); return; }
  /* An unreadable signer is a failure to identify, never an implicit pass. */
  if (!s.owner) { ok(false, "the signer could be identified", "no certificate found"); return; }
  const isDebug = /Android Debug/i.test(s.owner);
  ok(!isDebug, "signed with an upload key, not the debug key", s.owner);
  if (isDebug) {
    console.log("        set BRIDGES_UPLOAD_STORE and friends in ~/.gradle/gradle.properties,");
    console.log("        then rebuild — see docs/store-listing.md");
  }
  if (s.until) console.log(`  cert  valid until ${s.until}`);

  if (kind === "aab") ok(mb <= AAB_MAX_MB, `under Play's ${AAB_MAX_MB} MB bundle limit`, `${mb.toFixed(1)} MB`);
}

/* What the manifest promises, read from app.json rather than the compiled
   binary: these are the fields a reviewer checks against the Data Safety form,
   and a permission that crept in is the commonest reason a listing is held. */
function manifest() {
  const app = JSON.parse(readFileSync(join(ROOT, "native/app.json"), "utf8")).expo;
  const a = app.android || {};
  console.log(`\nmanifest`);
  console.log(`  package  ${a.package}`);
  console.log(`  version  ${app.version}`);
  ok(!!a.package && a.package !== "com.anonymous", "package id is the real one", a.package);
  const perms = a.permissions || [];
  console.log(`  permissions  ${perms.length ? perms.join(", ") : "(none declared)"}`);
  /* Anything here has to be justifiable on the Data Safety form. The three the
     app needs are the microphone, the audio session it opens, and notifications. */
  const allowed = new Set([
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.POST_NOTIFICATIONS",
  ]);
  const extra = perms.filter((p) => !allowed.has(p));
  ok(extra.length === 0, "no permission beyond the three the app can justify",
     extra.length ? extra.join(", ") : "mic, audio, notifications");
}

const k = process.argv.indexOf("--file");
if (k >= 0) {
  check(process.argv[k + 1], process.argv[k + 1].endsWith(".aab") ? "aab" : "apk");
} else {
  check(AAB, "aab");
  check(APK, "apk");
}
manifest();

console.log(`\n${pass} pass, ${fail} fail, ${warn} warn`);
process.exit(fail ? 1 : 0);

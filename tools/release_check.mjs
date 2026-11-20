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
 *   node tools/release_check.mjs --store --file <aab>   # a Google Play build: the
 *                                                       # side-load permission must be gone
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

/* Play's ceiling is on what one phone downloads (200 MB since 2022), not on
   the .aab file: a bundle carries every density and architecture and Play
   sends each device its slice. The file overstates the download by tens of
   megabytes — 217 MB of bundle was 167 MB to a phone (2026-10-03) — so the
   real figure comes from bundletool, the tool Play itself uses. */
const DOWNLOAD_MAX_MB = 200;
const BUNDLETOOL = process.env.BUNDLETOOL || "C:/Android/bundletool.jar";
const JAVA = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, "bin", "java.exe")
  : "java";

/* What the bundle's own manifest says, through the same tool. The permission
   list in app.json is what the beta build carries; a store build drops the
   side-load permission through a manifest overlay (plugins/withStoreBuild.js),
   and the only place that can be seen is the built bundle. */
function bundleManifest(aab) {
  if (!existsSync(BUNDLETOOL)) return { error: `no bundletool at ${BUNDLETOOL} (set BUNDLETOOL)` };
  try {
    return { xml: execFileSync(JAVA, ["-jar", BUNDLETOOL, "dump", "manifest", `--bundle=${aab}`],
                               { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { error: String(e.message || e).split("\n")[0] };
  }
}
const SIDELOAD = "android.permission.REQUEST_INSTALL_PACKAGES";

/* The largest download any device configuration gets, in bytes, or an error. */
function downloadMax(aab) {
  if (!existsSync(BUNDLETOOL)) return { error: `no bundletool at ${BUNDLETOOL} (set BUNDLETOOL)` };
  const apks = join(dirname(aab), "size-check.apks");
  try {
    execFileSync(JAVA, ["-jar", BUNDLETOOL, "build-apks", `--bundle=${aab}`,
                        `--output=${apks}`, "--overwrite"], { stdio: "pipe" });
    const out = execFileSync(JAVA, ["-jar", BUNDLETOOL, "get-size", "total",
                                    `--apks=${apks}`], { encoding: "utf8" });
    const max = Number((out.match(/^\s*(\d+),(\d+)/m) || [])[2]);
    return Number.isFinite(max) ? { max } : { error: `could not read: ${out.trim()}` };
  } catch (e) {
    return { error: String(e.message || e).split("\n")[0] };
  }
}

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

  if (kind === "aab") {
    const d = downloadMax(path);
    if (d.error) note("could not measure the per-device download", d.error);
    else ok(d.max / 1e6 <= DOWNLOAD_MAX_MB, `largest device download under Play's ${DOWNLOAD_MAX_MB} MB`,
            `${(d.max / 1e6).toFixed(1)} MB`);
    const m = bundleManifest(path);
    if (m.error) {
      if (store) ok(false, "the bundle's manifest could be read", m.error);
      else note("could not read the bundle's manifest", m.error);
    } else {
      const carries = m.xml.includes(SIDELOAD);
      if (store) ok(!carries, "no side-load install permission in the bundle (a Play build)",
                    carries ? "built without -Store, or the overlay did not merge" : "REQUEST_INSTALL_PACKAGES absent");
      else if (carries) note("carries the side-load install permission; a Play build must drop it", "build.ps1 -Store");
      else console.log("  info  no side-load install permission in the bundle");
    }
  }
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
  /* The fourth is the beta's own: the in-app update installs a side-loaded APK
     (src/update.js, 2026-11-17). Play policy reserves it for app stores, so
     a store build drops it along with LATEST_URL (build.ps1 -Store, checked
     above on the bundle itself) — here it is a warning, not a pass. */
  const extra = perms.filter((p) => !allowed.has(p) && p !== SIDELOAD);
  ok(extra.length === 0, "no permission beyond the three the app can justify",
     extra.length ? extra.join(", ") : "mic, audio, notifications");
  if (perms.includes(SIDELOAD) && !store) note("app.json carries the side-load install permission; a Play build drops it", "build.ps1 -Store");
}

const store = process.argv.includes("--store");
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

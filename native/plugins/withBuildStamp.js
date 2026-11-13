/* Let Gradle take the build's version code and name from the command line
 * (2026-11-12), so native/tools/build.ps1 can stamp every build it makes.
 *
 * Every local build used to carry app.json's `versionCode 27` and
 * `versionName "1.0.0-beta.10"`, so the phone could not tell one build from
 * the next, and the update check (src/update.js) had nothing to compare. With
 * this, `-PyaBuildCode=<n> -PyaBuildName=<s>` set them; without the
 * properties the defaults stay app.json's, so a plain `gradlew assembleRelease`
 * still builds — it just builds something no newer than anything.
 *
 * A config plugin rather than an edit to build.gradle, for the reason
 * withUploadSigning.js gives: native/android/ is generated and gitignored, and
 * a prebuild erases a hand edit without a word. The same edit is made by hand
 * in the current android/ tree, since no prebuild has run over it. */
const { withAppBuildGradle } = require("@expo/config-plugins");

/* The patch, apart from the plugin so a test can run it over a template. */
function patchGradle(src) {
  if (src.includes("yaBuildCode")) return src;           // idempotent: prebuild may rerun it
  /* Explicit call parentheses, deliberately: Groovy reads `versionCode (x) as
     Integer` as `versionCode(x) as Integer` — the cast applied to the call's
     result, the setter handed a String — and AGP fails the evaluation with
     "Value is null" and no line worth reading. Measured, 2026-11-12. */
  let out = src.replace(/\n(\s*)versionCode (\d+)\b/,
    "\n$1versionCode(((findProperty('yaBuildCode') ?: '$2') as String).toInteger())");
  out = out.replace(/\n(\s*)versionName "([^"]*)"/,
    "\n$1versionName((findProperty('yaBuildName') ?: \"$2\") as String)");
  if (!out.includes("yaBuildCode") || !out.includes("yaBuildName")) {
    throw new Error(
      "withBuildStamp: could not patch build.gradle — defaultConfig's versionCode/" +
      "versionName lines have moved. Fix the plugin rather than editing android/, " +
      "which is generated and gitignored.",
    );
  }
  return out;
}

module.exports = function withBuildStamp(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchGradle(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.patchGradle = patchGradle;

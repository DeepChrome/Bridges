/* The Google Play build drops the side-load install permission (2026-11-19).
 *
 * The beta installs its own updates: src/update.js fetches the newest APK from
 * the bridges-dl host and hands it to Android's package installer, which needs
 * `REQUEST_INSTALL_PACKAGES` in the manifest (app.json). Play policy reserves
 * that permission for app stores, so a store build must not carry it — and
 * the same build must not offer side-loaded APKs either, which src/update.js
 * settles by reading EXPO_PUBLIC_STORE_BUILD. Both are set by one switch,
 * `native/tools/build.ps1 -Store`, which passes `-PyaStore=true` to Gradle.
 *
 * How the permission goes: a manifest overlay for the release source set,
 * `app/src/store/AndroidManifest.xml`, removes the one element with
 * `tools:node="remove"`, and build.gradle points `sourceSets.release.manifest`
 * at it only when the property is set. Without the property nothing changes,
 * so a plain `gradlew assembleRelease` still builds the side-loading beta.
 *
 * A config plugin rather than an edit to android/, for the reason
 * withUploadSigning.js gives: that tree is generated and gitignored, and a
 * prebuild erases a hand edit without a word. The same edit is made by hand in
 * the current android/ tree, since no prebuild has run over it.
 * `tools/release_check.mjs --store` reads the built bundle's manifest and fails
 * if the permission is still there, so the switch cannot quietly stop working. */
const { withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
  <!-- Added by plugins/withStoreBuild.js: a Google Play build may not hold
       the side-load install permission. Merged into the release manifest only
       when Gradle is given -PyaStore=true (native/tools/build.ps1 -Store). -->
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" tools:node="remove"/>
</manifest>
`;

const GRADLE = (indent) => [
  "",
  `${indent}// Added by plugins/withStoreBuild.js: -PyaStore=true (build.ps1 -Store) drops the`,
  `${indent}// side-load install permission for a Google Play build. Do not edit here: generated.`,
  `${indent}if (findProperty('yaStore')) {`,
  `${indent}    sourceSets { release { manifest.srcFile 'src/store/AndroidManifest.xml' } }`,
  `${indent}}`,
  "",
].join("\n");

/* The patch, apart from the plugin so a test can run it over a template. */
function patchGradle(src) {
  if (src.includes("yaStore")) return src;                // idempotent: prebuild may rerun it
  const out = src.replace(/\n(\s*)buildTypes\s*\{/, (m, indent) => `${GRADLE(indent)}\n${indent}buildTypes {`);
  if (!out.includes("yaStore")) {
    throw new Error(
      "withStoreBuild: could not patch build.gradle — the android block's buildTypes " +
      "has moved. Fix the plugin rather than editing android/, which is generated and gitignored.",
    );
  }
  return out;
}

module.exports = function withStoreBuild(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchGradle(cfg.modResults.contents);
    return cfg;
  });
  return withDangerousMod(config, ["android", async (cfg) => {
    const file = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "store", "AndroidManifest.xml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, MANIFEST);
    return cfg;
  }]);
};
module.exports.patchGradle = patchGradle;
module.exports.MANIFEST = MANIFEST;

/* Sign release builds with an upload key when one is configured (ROADMAP 13.41).
 *
 * **Why a config plugin and not an edit to build.gradle.** `native/android/` is
 * generated and gitignored, so a change made there is untracked and the next
 * `npx expo prebuild` erases it without saying anything. Editing it directly is
 * what was done first, and the signing setup would simply have vanished the next
 * time the project was regenerated — a fix that disappears is worse than no fix,
 * because it looks done.
 *
 * What it does: adds an `upload` signing config reading four Gradle properties,
 * and points `release` at it when they are present, falling back to the debug key
 * so a side-loaded build still works on a machine with no key set up.
 *
 * **Nothing secret is here or in the repo** (rule 20.11). The keystore lives
 * outside the project and the four values come from ~/.gradle/gradle.properties
 * or ORG_GRADLE_PROJECT_* in the environment. See docs/store-listing.md.
 *
 * `node tools/release_check.mjs` reads the signature off the built artifact, so
 * a debug-signed bundle cannot reach Play by accident.
 */
const { withAppBuildGradle } = require("@expo/config-plugins");

const CONFIG = `
        // Added by plugins/withUploadSigning.js — do not edit here, this file is generated.
        upload {
            def store = findProperty('BRIDGES_UPLOAD_STORE')
            if (store) {
                storeFile file(store)
                storePassword findProperty('BRIDGES_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('BRIDGES_UPLOAD_ALIAS') ?: 'upload'
                keyPassword findProperty('BRIDGES_UPLOAD_KEY_PASSWORD')
                    ?: findProperty('BRIDGES_UPLOAD_STORE_PASSWORD')
            }
        }
`;

const RELEASE_SIGNING =
  "signingConfig findProperty('BRIDGES_UPLOAD_STORE') ? signingConfigs.upload : signingConfigs.debug";

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    /* Idempotent: prebuild may run over an already-patched file, and a second
       `upload {}` block is a Gradle error rather than a no-op. */
    if (!src.includes("BRIDGES_UPLOAD_STORE")) {
      // Into signingConfigs, straight after the debug block's closing brace.
      src = src.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s{8}\})/,
        `$1\n${CONFIG}`,
      );
      /* The template's release block carries a "Caution!" comment and
         `signingConfig signingConfigs.debug`. Anchor on the assignment inside
         `release {` rather than on the comment, which Expo has reworded before. */
      src = src.replace(
        /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1${RELEASE_SIGNING}`,
      );
      if (!src.includes("BRIDGES_UPLOAD_STORE")) {
        throw new Error(
          "withUploadSigning: could not patch build.gradle — the template's " +
          "signingConfigs/release blocks have moved. Fix the plugin rather than " +
          "editing android/, which is generated and gitignored.",
        );
      }
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};

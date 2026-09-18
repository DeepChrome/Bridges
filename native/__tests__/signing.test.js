/* The upload-signing config plugin (ROADMAP 13.41).
 *
 * `native/android/` is generated and gitignored, so the only version of this
 * that survives `npx expo prebuild` is the plugin — and the only way to know the
 * plugin works is to run its transform over the template it has to patch. The
 * text below is the Expo/RN template's own, verbatim, including the "Caution!"
 * comment that ships with it.
 *
 * Tested here rather than by running prebuild because prebuild regenerates the
 * whole Android project, which is slow and destroys the working build to prove
 * a regex.
 */
/* Mocked, not spied. The plugin destructures `withAppBuildGradle` at require
   time, so replacing the property on the module object afterwards does nothing —
   the reference it holds is already the real one. The mock has to be in place
   before the require, which is what jest.mock hoisting is for. */
let captured = null;
jest.mock("@expo/config-plugins", () => ({
  withAppBuildGradle: (config, cb) => { captured = cb(config); return config; },
}));

const withUploadSigning = require("../plugins/withUploadSigning");

/* Captured from native/android/app/build.gradle before it was patched. */
const TEMPLATE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

/* The plugin is a config-plugin: it hands its work to withAppBuildGradle, which
   calls back with { modResults: { contents } }. Driving that callback directly
   is what makes this a unit test rather than a prebuild. */
function patch(contents) {
  captured = null;
  withUploadSigning({ modResults: { contents } });
  return captured.modResults.contents;
}

test("adds an upload signing config the template did not have", () => {
  const out = patch(TEMPLATE);
  expect(out).toMatch(/upload\s*\{/);
  expect(out).toContain("BRIDGES_UPLOAD_STORE");
  expect(out).toContain("BRIDGES_UPLOAD_STORE_PASSWORD");
});

test("release uses the upload key when it is configured, the debug key otherwise", () => {
  const out = patch(TEMPLATE);
  expect(out).toContain(
    "signingConfig findProperty('BRIDGES_UPLOAD_STORE') ? signingConfigs.upload : signingConfigs.debug");
  /* The debug *build type* keeps signing with the debug key — only `release`
     was meant to change, and a greedy replace would have taken both. */
  expect(out).toMatch(/debug\s*\{\s*\n\s*signingConfig signingConfigs\.debug\s*\n/);
});

test("the debug keystore block itself is left alone", () => {
  const out = patch(TEMPLATE);
  expect(out).toContain("storeFile file('debug.keystore')");
  expect(out).toContain("keyAlias 'androiddebugkey'");
});

/* Prebuild can run over an already-patched file, and a second `upload {}` block
   is a Gradle error rather than a harmless repeat. */
test("running twice changes nothing the second time", () => {
  const once = patch(TEMPLATE);
  const twice = patch(once);
  expect(twice).toBe(once);
  expect(twice.match(/BRIDGES_UPLOAD_STORE=/g) || []).toHaveLength(0);
  expect((twice.match(/upload\s*\{/g) || []).length).toBe(1);
});

/* If Expo reshapes the template, the plugin must fail loudly rather than
   silently leaving release builds debug-signed — which is the one outcome that
   looks fine and is refused at the store. */
test("refuses to pass silently when the template has moved", () => {
  expect(() => patch("android {\n  buildTypes {\n    release { }\n  }\n}\n")).toThrow(/could not patch/);
});

/* plugins/withStoreBuild.js: a Google Play build drops the side-load install
   permission, and only when Gradle is told it is a store build. */

const { patchGradle, MANIFEST } = require("../plugins/withStoreBuild");

const TEMPLATE = `android {
    defaultConfig {
        applicationId 'app.bridges.russian'
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
    }
}`;

test("the overlay is applied only under -PyaStore, ahead of buildTypes", () => {
  const out = patchGradle(TEMPLATE);
  expect(out).toContain("if (findProperty('yaStore'))");
  expect(out).toContain("manifest.srcFile 'src/store/AndroidManifest.xml'");
  expect(out.indexOf("yaStore")).toBeLessThan(out.indexOf("buildTypes {"));
  // The rest of the file is untouched.
  expect(out).toContain("applicationId 'app.bridges.russian'");
  expect(out).toContain("signingConfig signingConfigs.debug");
});

test("running it twice adds nothing", () => {
  const once = patchGradle(TEMPLATE);
  expect(patchGradle(once)).toBe(once);
});

test("a template without buildTypes fails loudly rather than silently", () => {
  expect(() => patchGradle("android { defaultConfig { applicationId 'x' } }")).toThrow(/could not patch/);
});

test("the overlay removes exactly the side-load permission", () => {
  expect(MANIFEST).toMatch(/REQUEST_INSTALL_PACKAGES"\s+tools:node="remove"/);
  expect(MANIFEST).toContain('xmlns:tools="http://schemas.android.com/tools"');
  expect((MANIFEST.match(/uses-permission/g) || []).length).toBe(1);
});

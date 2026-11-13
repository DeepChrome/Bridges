/* plugins/withBuildStamp.js: Gradle takes the build's code and name from
   properties, with app.json's values as the defaults, and the patch is safe to
   run twice (prebuild may). */

const { patchGradle } = require("../plugins/withBuildStamp");

const TEMPLATE = `
android {
    defaultConfig {
        applicationId 'app.bridges.russian'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 27
        versionName "1.0.0-beta.10"
    }
}
`;

it("reads both from properties and falls back to app.json's values", () => {
  const out = patchGradle(TEMPLATE);
  expect(out).toContain("versionCode(((findProperty('yaBuildCode') ?: '27') as String).toInteger())");
  expect(out).toContain("versionName((findProperty('yaBuildName') ?: \"1.0.0-beta.10\") as String)");
  expect(out).not.toMatch(/\n\s*versionCode 27\b/);
  expect(out).not.toContain('versionName "1.0.0-beta.10"\n');
});

it("is idempotent", () => {
  const once = patchGradle(TEMPLATE);
  expect(patchGradle(once)).toBe(once);
});

it("fails loudly when the template has moved", () => {
  expect(() => patchGradle("android { defaultConfig { applicationId 'x' } }")).toThrow(/could not patch/);
});

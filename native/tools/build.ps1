# Release build of the native app, stamped so the phone can tell builds apart.
#
#   .\native\tools\build.ps1                       arm64 + x86_64 (phone and emulator)
#   .\native\tools\build.ps1 -Arch arm64-v8a       phone only, about half the size
#   .\native\tools\build.ps1 -Out C:\somewhere     where the APK and its sidecar land
#   .\native\tools\build.ps1 -Store                the Google Play bundle (.aab), every
#                                                  architecture, upload-signed, no
#                                                  side-load update check or permission
#
# Takes about 40 minutes. Run it detached (Start-Process powershell -ArgumentList
# "-File", $PSCommandPath) so a tool timeout cannot cut it short, and watch the
# log in the output folder for its final "exit" line.
#
# What the stamp is (src/update.js, plugins/withBuildStamp.js): versionCode is
# the minute the build started, UTC, so every build is newer than the last and
# an APK installs over any earlier one; versionName is app.json's version plus
# the short commit, with ".dirty" when the tree had uncommitted changes. Both
# go to Gradle as properties. Beside the APK a JSON sidecar records them with
# the size and SHA-256; tools/dl/upload.mjs reads it to publish the build as
# the latest one the app will offer.
#
# -Store (CLAUDE.md 30cv, 30dd): Gradle runs bundleRelease with -PyaStore=true,
# which merges app/src/store/AndroidManifest.xml over the release manifest and
# drops REQUEST_INSTALL_PACKAGES (plugins/withStoreBuild.js); Metro sees
# EXPO_PUBLIC_STORE_BUILD=1, which src/update.js reads as "no update host".
# The bundle lands as Ya-<commit>-store.aab beside a sidecar marked store, and
# is checked with: node tools/release_check.mjs --store --file <aab>
#
# The five generated trees are cleared first (CLAUDE.md 23): a stale bundle
# ships the previous core/, stale res/ keeps media that has left the disk, and
# a stale package step fails with no stated cause. Metro's transform cache goes
# too: it does not key on EXPO_PUBLIC_* values, so a store build after a beta
# build (or the reverse) could otherwise reuse the other's inlined constants.
#
# ASCII only, deliberately (CLAUDE.md 23: PowerShell 5.1 reads a .ps1 without a
# byte-order mark as ANSI, and one UTF-8 dash breaks the parse). No
# $ErrorActionPreference = "Stop": gradlew writes ordinary progress to stderr,
# which Stop would make fatal; the exit code decides.

param(
    [string]$Arch = "",
    [string]$Out = "",
    [switch]$Store
)
# A bundle carries every architecture and Play sends each phone its slice; an
# APK is for the phone and the emulator.
if (-not $Arch) { if ($Store) { $Arch = "armeabi-v7a,arm64-v8a,x86,x86_64" } else { $Arch = "arm64-v8a,x86_64" } }

$native = Split-Path $PSScriptRoot -Parent
$root = Split-Path $native -Parent
if (-not $Out) { $Out = Join-Path $native "build-out" }
New-Item -ItemType Directory -Force $Out | Out-Null

$commit = (git -C $root rev-parse --short HEAD).Trim()
if (-not $commit) { Write-Output "no commit: is this a git checkout?"; exit 2 }
$dirty = @(git -C $root status --porcelain).Count -gt 0
$version = (Get-Content (Join-Path $native "app.json") -Raw | ConvertFrom-Json).expo.version
$code = [int][math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 60)
$name = "$version+$commit"
if ($dirty) { $name = "$name.dirty" }

$suffix = ""
if ($Store) { $suffix = "-store" }
$log = Join-Path $Out "build-$commit$suffix.log"
"started $(Get-Date -Format o) code $code name $name arch $Arch store $Store" | Out-File $log -Encoding ascii
Write-Output "building $name (code $code), log $log"

$build = Join-Path $native "android\app\build"
foreach ($d in @("generated\assets\react\release", "generated\res\react\release",
                 "intermediates\incremental\release\packageRelease", "outputs\apk\release",
                 "outputs\bundle\release", "intermediates\apk\release", "intermediates\bundle")) {
  $p = Join-Path $build $d
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
foreach ($p in @((Join-Path $env:TEMP "metro-cache"), (Join-Path $native "node_modules\.cache"))) {
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}

if ($Store) {
  # Read by src/update.js at bundle time; PowerShell deletes a variable set to
  # "", so the flag is a value and the code tests for it.
  $env:EXPO_PUBLIC_STORE_BUILD = "1"
  if (-not (Test-Path (Join-Path $native "android\app\src\store\AndroidManifest.xml"))) {
    Write-Output "no store manifest overlay; run plugins/withStoreBuild.js (prebuild) or restore android/app/src/store"; exit 5
  }
} else {
  Remove-Item Env:EXPO_PUBLIC_STORE_BUILD -ErrorAction SilentlyContinue
}

# expo-audio's sessions hand their media keys to the app (CLAUDE.md 30cy). The
# patch lives in node_modules, which npm install rewrites, so it is applied
# before every build; a failure here is a build whose drive mode misses presses.
& node (Join-Path $root "tools\patch_expo_audio.mjs") 2>&1 | Out-File $log -Append -Encoding ascii
if ($LASTEXITCODE -ne 0) { Write-Output "patch_expo_audio failed; see $log"; exit 4 }

$gradlew = Join-Path $native "android\gradlew.bat"
$task = "assembleRelease"
$gradleArgs = @("-PreactNativeArchitectures=$Arch", "-PyaBuildCode=$code", "-PyaBuildName=$name", "--max-workers=2")
if ($Store) { $task = "bundleRelease"; $gradleArgs += "-PyaStore=true" }
& $gradlew -p (Join-Path $native "android") $task @gradleArgs 2>&1 | Out-File $log -Append -Encoding ascii
$exit = $LASTEXITCODE
"exit $exit $(Get-Date -Format o)" | Out-File $log -Append -Encoding ascii
if ($exit -ne 0) { Write-Output "gradle failed ($exit); see $log"; exit $exit }

if ($Store) {
  $artifact = Join-Path $build "outputs\bundle\release\app-release.aab"
  $dest = Join-Path $Out "Ya-$commit-store.aab"
} else {
  $artifact = Join-Path $build "outputs\apk\release\app-release.apk"
  $dest = Join-Path $Out "Ya-$commit.apk"
}
if (-not (Test-Path $artifact)) { Write-Output "no artifact at $artifact"; exit 3 }
Copy-Item $artifact $dest -Force
$size = (Get-Item $dest).Length
$sha = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
$side = @{
  code = $code; name = $name; commit = $commit; dirty = $dirty; version = $version; store = [bool]$Store
  arch = $Arch; size = $size; sha256 = $sha; builtAt = (Get-Date).ToUniversalTime().ToString("o")
}
$sidePath = Join-Path $Out "Ya-$commit$suffix.json"
[IO.File]::WriteAllText($sidePath, ($side | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
if ($Store) { Write-Output "AAB $dest" } else { Write-Output "APK $dest" }
Write-Output "size $size sha256 $sha"
Write-Output "sidecar $sidePath"

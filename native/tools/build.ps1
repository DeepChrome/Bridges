# Release build of the native app, stamped so the phone can tell builds apart.
#
#   .\native\tools\build.ps1                       arm64 + x86_64 (phone and emulator)
#   .\native\tools\build.ps1 -Arch arm64-v8a       phone only, about half the size
#   .\native\tools\build.ps1 -Out C:\somewhere     where the APK and its sidecar land
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
# The five generated trees are cleared first (CLAUDE.md 23): a stale bundle
# ships the previous core/, stale res/ keeps media that has left the disk, and
# a stale package step fails with no stated cause.
#
# ASCII only, deliberately (CLAUDE.md 23: PowerShell 5.1 reads a .ps1 without a
# byte-order mark as ANSI, and one UTF-8 dash breaks the parse). No
# $ErrorActionPreference = "Stop": gradlew writes ordinary progress to stderr,
# which Stop would make fatal; the exit code decides.

param(
    [string]$Arch = "arm64-v8a,x86_64",
    [string]$Out = ""
)

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

$log = Join-Path $Out "build-$commit.log"
"started $(Get-Date -Format o) code $code name $name arch $Arch" | Out-File $log -Encoding ascii
Write-Output "building $name (code $code), log $log"

$build = Join-Path $native "android\app\build"
foreach ($d in @("generated\assets\react\release", "generated\res\react\release",
                 "intermediates\incremental\release\packageRelease", "outputs\apk\release",
                 "intermediates\apk\release")) {
  $p = Join-Path $build $d
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}

# expo-audio's sessions hand their media keys to the app (CLAUDE.md 30cy). The
# patch lives in node_modules, which npm install rewrites, so it is applied
# before every build; a failure here is a build whose drive mode misses presses.
& node (Join-Path $root "tools\patch_expo_audio.mjs") 2>&1 | Out-File $log -Append -Encoding ascii
if ($LASTEXITCODE -ne 0) { Write-Output "patch_expo_audio failed; see $log"; exit 4 }

$gradlew = Join-Path $native "android\gradlew.bat"
& $gradlew -p (Join-Path $native "android") assembleRelease "-PreactNativeArchitectures=$Arch" `
  "-PyaBuildCode=$code" "-PyaBuildName=$name" --max-workers=2 2>&1 | Out-File $log -Append -Encoding ascii
$exit = $LASTEXITCODE
"exit $exit $(Get-Date -Format o)" | Out-File $log -Append -Encoding ascii
if ($exit -ne 0) { Write-Output "gradle failed ($exit); see $log"; exit $exit }

$apk = Join-Path $build "outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { Write-Output "no APK at $apk"; exit 3 }
$dest = Join-Path $Out "Ya-$commit.apk"
Copy-Item $apk $dest -Force
$size = (Get-Item $dest).Length
$sha = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
$side = @{
  code = $code; name = $name; commit = $commit; dirty = $dirty; version = $version
  arch = $Arch; size = $size; sha256 = $sha; builtAt = (Get-Date).ToUniversalTime().ToString("o")
}
$sidePath = Join-Path $Out "Ya-$commit.json"
[IO.File]::WriteAllText($sidePath, ($side | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Output "APK $dest"
Write-Output "size $size sha256 $sha"
Write-Output "sidecar $sidePath"

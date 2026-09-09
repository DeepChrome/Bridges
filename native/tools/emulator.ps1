# Boot the Android emulator and (optionally) install a build on it.
#
#   .\native\tools\emulator.ps1              boot and wait for it
#   .\native\tools\emulator.ps1 -Apk x.apk   boot, then install and launch
#   .\native\tools\emulator.ps1 -Shot name   boot, then screenshot to screenshots/
#
# The SDK lives outside the repo at C:\Android so it survives a clone, and the JDK
# beside it. Both were installed from archives rather than installers: an MSI wants
# UAC elevation, which a non-interactive shell cannot answer - it hangs indefinitely
# rather than failing, which cost an hour once.
#
# ASCII only, deliberately. PowerShell 5.1 reads a .ps1 with no byte-order mark as
# ANSI, so a UTF-8 em-dash arrives as three characters, the last of which cp1252
# calls a right double quote - it closes a string early and the whole script fails
# to parse. This one did (2026-09-09).

param(
    [string]$Avd = "bridges",
    [string]$Apk = "",
    [string]$Shot = "",
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Android\jdk\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "C:\Android\sdk"
$env:ANDROID_SDK_ROOT = "C:\Android\sdk"
$adb = "C:\Android\sdk\platform-tools\adb.exe"
$emu = "C:\Android\sdk\emulator\emulator.exe"
$shots = Join-Path (Split-Path $PSScriptRoot -Parent) "screenshots"

if (-not (Test-Path $adb)) { throw "Android SDK not found at C:\Android\sdk - see native/README.md" }

# adb writes ordinary progress to stderr - "device offline" while an emulator boots,
# "1 file pulled" after a successful pull - and PowerShell 5.1 turns any native stderr
# line into a NativeCommandError, which ErrorActionPreference = Stop makes terminating.
# Redirecting to $null does not help: the record exists before the redirect. So every
# adb call goes through here and only the exit code decides. (2026-09-09; see walk.ps1.)
function Invoke-Adb {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & $adb @args 2>&1
        return @($out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] })
    } finally { $ErrorActionPreference = $prev }
}

$running = (Invoke-Adb devices | Select-String "emulator-\d+\s+device")
if (-not $running) {
    Write-Host "booting $Avd..." -ForegroundColor Cyan
    # swiftshader_indirect: software GL. Slower to draw but it does not depend on the
    # host GPU being reachable, which is what makes this work over a remote session.
    Start-Process -FilePath $emu `
        -ArgumentList "-avd",$Avd,"-no-snapshot","-no-boot-anim","-gpu","swiftshader_indirect","-no-audio" `
        -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        if (((Invoke-Adb shell getprop sys.boot_completed) -join "") -match "1") { break }
    }
    if ((Get-Date) -ge $deadline) { throw "emulator did not finish booting in ${TimeoutSeconds}s" }
}
Write-Host "device ready" -ForegroundColor Green
Invoke-Adb devices | Select-String "emulator"

if ($Apk) {
    if (-not (Test-Path $Apk)) { throw "no APK at $Apk" }
    # A locally built APK is signed with the debug keystore, so it cannot update one
    # installed from EAS: Android refuses with INSTALL_FAILED_UPDATE_INCOMPATIBLE and
    # the only way through is to uninstall, which erases the learner's progress.
    $out = Invoke-Adb install -r $Apk
    if ("$out" -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
        throw ("this APK is signed differently from the installed one. On a device with " +
               "real progress, use 'Back up progress' in Settings first, then " +
               "'adb uninstall app.bridges.russian' and install again.")
    }
    Invoke-Adb shell monkey -p app.bridges.russian -c android.intent.category.LAUNCHER 1 | Out-Null
    Start-Sleep -Seconds 10
}

if ($Shot) {
    New-Item -ItemType Directory -Force $shots | Out-Null
    Invoke-Adb shell screencap -p /sdcard/_s.png | Out-Null
    Invoke-Adb pull /sdcard/_s.png (Join-Path $shots "$Shot.png") | Out-Null
    Write-Host "wrote screenshots/$Shot.png" -ForegroundColor Green
}

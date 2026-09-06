# Boot the Android emulator and (optionally) install a build on it.
#
#   .\native\tools\emulator.ps1              boot and wait for it
#   .\native\tools\emulator.ps1 -Apk x.apk   boot, then install and launch
#   .\native\tools\emulator.ps1 -Shot name   boot, then screenshot to screenshots/
#
# The SDK lives outside the repo at C:\Android so it survives a clone, and the JDK
# beside it. Both were installed from archives rather than installers: an MSI wants
# UAC elevation, which a non-interactive shell cannot answer — it hangs indefinitely
# rather than failing, which cost an hour once.

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

if (-not (Test-Path $adb)) { throw "Android SDK not found at C:\Android\sdk — see native/README.md" }

$running = (& $adb devices | Select-String "emulator-\d+\s+device")
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
        if (((& $adb shell getprop sys.boot_completed 2>$null) -join "") -match "1") { break }
    }
    if ((Get-Date) -ge $deadline) { throw "emulator did not finish booting in ${TimeoutSeconds}s" }
}
Write-Host "device ready" -ForegroundColor Green
& $adb devices | Select-String "emulator"

if ($Apk) {
    if (-not (Test-Path $Apk)) { throw "no APK at $Apk" }
    & $adb install -r $Apk
    & $adb shell monkey -p app.bridges.russian -c android.intent.category.LAUNCHER 1 | Out-Null
    Start-Sleep -Seconds 10
}

if ($Shot) {
    New-Item -ItemType Directory -Force $shots | Out-Null
    & $adb shell screencap -p /sdcard/_s.png
    & $adb pull /sdcard/_s.png (Join-Path $shots "$Shot.png") | Out-Null
    Write-Host "wrote screenshots/$Shot.png" -ForegroundColor Green
}

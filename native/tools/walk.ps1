# Drive the app on the emulator by what is on screen, and photograph it.
#
#   .\native\tools\walk.ps1 -Flow native\flows\walkthrough.txt
#   .\native\tools\walk.ps1 -Steps "tap:Continue","shot:learn"
#
# Steps, one per line in a flow file (blank lines and # comments ignored):
#   tap:<regex>        tap the centre of the first node whose text/description matches
#   tapn:<regex>:<k>   the k-th match (0-based)
#   tapxy:<x>:<y>      a raw tap, for a control the tree does not label (note it!)
#   type:<text>        type into the focused field
#   shot:<name>        screenshot to native/screenshots/walk/<name>.png
#   back               Android back
#   key:<keycode>      an Android key event
#   clear              empty the focused text field
#   wait:<seconds>
#   scroll             swipe up one screen
#   scrolltop          back to the top of a list
#   texts              print every text on screen (for writing the next step)
#   expect:<regex>     fail the walk if no node matches
#
# Reads the accessibility tree through `uiautomator dump`, so it finds things the
# way a screen reader does — which is also a check that they are labelled at all.
# No Maestro: it needs WSL on Windows, and this covers the click-through the UX
# audit needs with nothing to install.

param(
    [string]$Flow = "",
    [string[]]$Steps = @(),
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$adb = "C:\Android\sdk\platform-tools\adb.exe"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $OutDir) { $OutDir = Join-Path $root "native\screenshots\walk" }
New-Item -ItemType Directory -Force $OutDir | Out-Null

function Get-Tree {
    & $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
    $xml = (& $adb shell cat /sdcard/ui.xml) -join ""
    # Every node with a label and bounds. Text and content-desc both count.
    $nodes = @()
    foreach ($m in [regex]::Matches($xml, '<node [^>]*>')) {
        $n = $m.Value
        $text = [regex]::Match($n, 'text="([^"]*)"').Groups[1].Value
        $desc = [regex]::Match($n, 'content-desc="([^"]*)"').Groups[1].Value
        $b = [regex]::Match($n, 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
        if (-not $b.Success) { continue }
        $label = if ($text) { $text } else { $desc }
        if (-not $label) { continue }
        $label = [System.Net.WebUtility]::HtmlDecode($label)
        $nodes += [pscustomobject]@{
            label = $label
            x = [int](([int]$b.Groups[1].Value + [int]$b.Groups[3].Value) / 2)
            y = [int](([int]$b.Groups[2].Value + [int]$b.Groups[4].Value) / 2)
        }
    }
    return $nodes
}

function Find-Node([string]$pattern, [int]$k = 0) {
    for ($try = 0; $try -lt 6; $try++) {
        $hits = @(Get-Tree | Where-Object { $_.label -match $pattern })
        if ($hits.Count -gt $k) { return $hits[$k] }
        Start-Sleep -Milliseconds 700
    }
    return $null
}

function Do-Step([string]$step) {
    $parts = $step -split ":", 3
    $op = $parts[0]
    switch ($op) {
        "tap" {
            $n = Find-Node $parts[1]
            if (-not $n) { throw "tap: nothing on screen matches '$($parts[1])'" }
            & $adb shell input tap $n.x $n.y | Out-Null
            Start-Sleep -Milliseconds 900
        }
        "tapxy" {
            & $adb shell input tap $parts[1] $parts[2] | Out-Null
            Start-Sleep -Milliseconds 900
        }
        "tapn" {
            $n = Find-Node $parts[1] ([int]$parts[2])
            if (-not $n) { throw "tapn: no match #$($parts[2]) for '$($parts[1])'" }
            & $adb shell input tap $n.x $n.y | Out-Null
            Start-Sleep -Milliseconds 900
        }
        "type" {
            & $adb shell input text ($parts[1] -replace " ", "%s") | Out-Null
            Start-Sleep -Milliseconds 400
        }
        "shot" {
            Start-Sleep -Milliseconds 600
            & $adb shell screencap -p /sdcard/_w.png | Out-Null
            & $adb pull /sdcard/_w.png (Join-Path $OutDir "$($parts[1]).png") | Out-Null
            Write-Host "  shot $($parts[1])"
        }
        "back" { & $adb shell input keyevent 4 | Out-Null; Start-Sleep -Milliseconds 800 }
        "key" { & $adb shell input keyevent $parts[1] | Out-Null; Start-Sleep -Milliseconds 200 }
        "clear" {
            # Delete whatever is in the focused field: end of text, then backspaces.
            & $adb shell input keyevent 123 | Out-Null
            for ($i = 0; $i -lt 30; $i++) { & $adb shell input keyevent 67 | Out-Null }
        }
        "wait" { Start-Sleep -Seconds ([double]$parts[1]) }
        "scroll" { & $adb shell input swipe 540 1700 540 700 300 | Out-Null; Start-Sleep -Milliseconds 800 }
        "scrolltop" {
            for ($i = 0; $i -lt 8; $i++) { & $adb shell input swipe 540 700 540 1900 200 | Out-Null }
            Start-Sleep -Milliseconds 800
        }
        "texts" { Get-Tree | ForEach-Object { Write-Host "    [$($_.x),$($_.y)] $($_.label)" } }
        "expect" {
            if (-not (Find-Node $parts[1])) { throw "expect: nothing on screen matches '$($parts[1])'" }
        }
        default { throw "unknown step '$step'" }
    }
}

$list = @()
if ($Flow) {
    $list = Get-Content $Flow -Encoding UTF8 | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("#") }
}
$list += $Steps
foreach ($s in $list) {
    Write-Host $s -ForegroundColor Cyan
    Do-Step $s.Trim()
}

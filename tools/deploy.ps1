# Bridges — rebuild the app from the current databases and push it to Netlify.
#
#   .\tools\deploy.ps1              rebuild + deploy to production
#   .\tools\deploy.ps1 -Draft       deploy to a preview URL instead
#   .\tools\deploy.ps1 -SkipBuild   deploy whatever is already in site/
#
# Auth comes from $env:NETLIFY_AUTH_TOKEN, or from `netlify login` having been run
# once on this machine. The project folder is already linked to the bridges-jf project
# via .netlify/state.json (linked by id, so the rename did not break it).

param(
    [switch]$Draft,
    [switch]$SkipBuild,
    [int]$Lemmas = 2500
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $SkipBuild) {
    Write-Host "rebuilding page..." -ForegroundColor Cyan
    & python tools\build_site.py --lemmas $Lemmas
    if ($LASTEXITCODE -ne 0) { throw "build_site.py failed" }
}

if (-not (Test-Path "site\index.html")) { throw "site\index.html not found" }

# Not $args — that is a PowerShell automatic variable and assigning to it is unsafe.
$deployArgs = @("deploy", "--dir=site", "--no-build")
if (-not $Draft) { $deployArgs += "--prod" }

Write-Host "deploying$(if ($Draft) { ' (draft)' })..." -ForegroundColor Cyan
& netlify @deployArgs

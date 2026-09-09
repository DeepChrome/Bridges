# Bridges - rebuild the app from the current databases and push it to Netlify.
#
# ASCII only: PowerShell 5.1 reads a .ps1 with no byte-order mark as ANSI, so a
# UTF-8 em-dash becomes three characters ending in what cp1252 calls a right
# double quote, which closes a string early and breaks the parse.
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
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $SkipBuild) {
    # No --lemmas override. It used to pass 2500, which shipped a different app than
    # the suites ever saw: 25,852 indexed forms against the 40,499 built locally, so
    # thousands of words silently failed to resolve when tapped in a sentence. That
    # saved 0.56 MB back when those lemmas carried the paradigms; the deep dictionary
    # carries them now and does not vary with this flag. Build what you tested.
    Write-Host "rebuilding page..." -ForegroundColor Cyan
    & python tools\build_site.py
    if ($LASTEXITCODE -ne 0) { throw "build_site.py failed" }
}

if (-not (Test-Path "site\index.html")) { throw "site\index.html not found" }

# Not $args - that is a PowerShell automatic variable and assigning to it is unsafe.
$deployArgs = @("deploy", "--dir=site", "--no-build")
if (-not $Draft) { $deployArgs += "--prod" }

Write-Host "deploying$(if ($Draft) { ' (draft)' })..." -ForegroundColor Cyan
& netlify @deployArgs

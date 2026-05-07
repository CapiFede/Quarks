#!/usr/bin/env pwsh
# Release helper. Bumps pubspec.yaml, commits, tags, pushes — which triggers
# the GitHub Actions Release workflow that builds the installer, uploads the
# binary to GitHub Releases, and publishes appcast.xml.
#
# Usage:
#   pwsh scripts/release.ps1 patch   # 2.1.3 -> 2.1.4
#   pwsh scripts/release.ps1 minor   # 2.1.3 -> 2.2.0
#   pwsh scripts/release.ps1 major   # 2.1.3 -> 3.0.0
#   pwsh scripts/release.ps1 patch -Yes   # skip the confirmation prompt
#
# The script refuses to run if the working tree is dirty. Commit, stash, or
# discard your changes first.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$BumpType,

    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

# Wrap git so non-zero exits actually fail the script. By default pwsh does
# not stop on native-command errors, which is exactly the bug that left the
# release workflow reporting green while pushing a broken appcast.
function Invoke-Git {
    $output = & git @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($args -join ' ') failed (exit $LASTEXITCODE):`n$output"
    }
    return $output
}

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

# --- Pre-flight checks -----------------------------------------------------

$branch = (Invoke-Git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') {
    throw "Must be on main; current branch is '$branch'."
}

Invoke-Git fetch origin main | Out-Null
$behind = [int]((Invoke-Git rev-list --count 'HEAD..origin/main').Trim())
if ($behind -gt 0) {
    throw "Local main is behind origin/main by $behind commit(s). Run 'git pull' first."
}

$dirty = @((Invoke-Git status --porcelain) -split "`n" | Where-Object { $_ })
if ($dirty.Count -gt 0) {
    Write-Host "Working tree has uncommitted changes:" -ForegroundColor Red
    $dirty | ForEach-Object { Write-Host "  $_" }
    throw "Commit, stash, or discard your changes before releasing."
}

# --- Compute new version ---------------------------------------------------

$pubspecPath = Join-Path $repoRoot 'pubspec.yaml'
$pubspec     = Get-Content $pubspecPath -Raw
if ($pubspec -notmatch '(?m)^version:\s*(\d+)\.(\d+)\.(\d+)\s*$') {
    throw "Could not find 'version: X.Y.Z' in pubspec.yaml."
}
$major = [int]$matches[1]
$minor = [int]$matches[2]
$patch = [int]$matches[3]
$currentVersion = "$major.$minor.$patch"

switch ($BumpType) {
    'patch' { $patch += 1 }
    'minor' { $minor += 1; $patch = 0 }
    'major' { $major += 1; $minor = 0; $patch = 0 }
}
$newVersion = "$major.$minor.$patch"
$tag        = "v$newVersion"

if ((Invoke-Git tag -l $tag)) {
    throw "Tag $tag already exists locally."
}
$remoteTag = Invoke-Git ls-remote --tags origin "refs/tags/$tag"
if ($remoteTag) {
    throw "Tag $tag already exists on origin."
}

# --- Confirm ---------------------------------------------------------------

Write-Host ""
Write-Host "Releasing $currentVersion -> $newVersion ($tag)" -ForegroundColor Cyan
Write-Host ""

if (-not $Yes) {
    $reply = Read-Host "Proceed? [y/N]"
    if ($reply -notmatch '^[yY]') {
        Write-Host "Aborted." -ForegroundColor Yellow
        return
    }
}

# --- Bump, commit, tag, push -----------------------------------------------

$updatedPubspec = $pubspec -replace '(?m)^version:\s*\d+\.\d+\.\d+\s*$', "version: $newVersion"
[System.IO.File]::WriteAllText($pubspecPath, $updatedPubspec)

Invoke-Git add pubspec.yaml | Out-Null
Invoke-Git commit -m "chore: bump version to $tag" | Out-Null
Invoke-Git tag $tag | Out-Null
Invoke-Git push origin main | Out-Null
Invoke-Git push origin $tag | Out-Null

Write-Host ""
Write-Host "Released $tag." -ForegroundColor Green
Write-Host "Workflow: https://github.com/CapiFede/Quarks/actions" -ForegroundColor Cyan

param(
    [string]$DestinationHome
)
$ErrorActionPreference = 'Stop'
$sourcePack = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\pets\usagi-codex'))
if (-not $DestinationHome) {
    if ($env:CODEX_HOME) { $DestinationHome = $env:CODEX_HOME }
    else { $DestinationHome = Join-Path $env:USERPROFILE '.codex' }
}
$petsRoot = [IO.Path]::GetFullPath((Join-Path $DestinationHome 'pets'))
$targetPack = [IO.Path]::GetFullPath((Join-Path $petsRoot 'usagi'))
if ([IO.Path]::GetDirectoryName($targetPack) -ne $petsRoot) { throw 'Invalid destination.' }
$metadata = Get-Content -LiteralPath (Join-Path $sourcePack 'pet.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($metadata.id -ne 'usagi' -or $metadata.spritesheetPath -ne 'spritesheet.webp') { throw 'Invalid Usagi pet manifest.' }
$files = @('pet.json', 'spritesheet.webp')
foreach ($name in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePack $name) -PathType Leaf)) { throw "Missing source: $name" }
}
# Retain a dated copy before replacing a different installed version.
$changed = $false
foreach ($name in $files) {
    $existing = Join-Path $targetPack $name
    if (Test-Path -LiteralPath $existing -PathType Leaf) {
        if ((Get-FileHash -LiteralPath $existing).Hash -ne (Get-FileHash -LiteralPath (Join-Path $sourcePack $name)).Hash) { $changed = $true }
    } elseif (Test-Path -LiteralPath $targetPack) { $changed = $true }
}
$backupPath = $null
if ($changed) {
    $backupRoot = Join-Path $DestinationHome 'pet-backups'
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $backupPath = Join-Path $backupRoot ('usagi-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    Copy-Item -LiteralPath $targetPack -Destination $backupPath -Recurse
}
New-Item -ItemType Directory -Path $targetPack -Force | Out-Null
foreach ($name in $files) {
    $sourceFile = Join-Path $sourcePack $name
    $targetFile = Join-Path $targetPack $name
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
    if ((Get-FileHash -LiteralPath $sourceFile).Hash -ne (Get-FileHash -LiteralPath $targetFile).Hash) { throw "Installed file mismatch: $name" }
}
[pscustomobject]@{ installed = $true; directory = $targetPack; petId = 'custom:usagi'; backup = $backupPath } | ConvertTo-Json

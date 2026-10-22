<#
.SYNOPSIS
  Safely removes regeneratable build output.

.DESCRIPTION
  Deletes only directories that a build recreates from source:
    src-tauri/target   Rust/tauri build output (the 21.4GB offender)
    dist               Vite output
    dist-desktop       Tauri bundle output

  Deliberately NOT deleted, even though they live next to the targets:
    .tools                  local toolchains (node, rustup, cargo); re-downloading is slow
    .cache/node-index.json  dependency index cache that speeds up offline installs
    .local-data             collaboration data that no build recreates

  The sandbox this project is developed in refuses Remove-Item calls that touch
  multiple targets or more than roughly 500 items in one round. So each target
  is removed with its own single-target call. If a large recursive removal is
  still refused by a delete guard, the script says so and exits non-zero rather
  than working around the guard with a different deletion pattern: every target
  here is regeneratable, so a human can remove it from a normal terminal.

  Prints the total size before and after so the reclaim is visible.

  The script is ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 files
  without a BOM as ANSI, which mangles UTF-8 comments into parse errors.

.PARAMETER WhatIf
  Shows what would be removed without deleting anything.

.EXAMPLE
  ./scripts/clean-build.ps1
.EXAMPLE
  ./scripts/clean-build.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

# Only regeneratable output. Everything else in the repo root is source, data,
# toolchain or collaboration state and is never touched by this script.
$targets = @(
    'src-tauri/target',
    'dist',
    'dist-desktop'
)

function Format-Size([double]$bytes) {
    if ($bytes -ge 1GB) { return '{0:N2} GB' -f ($bytes / 1GB) }
    if ($bytes -ge 1MB) { return '{0:N2} MB' -f ($bytes / 1MB) }
    if ($bytes -ge 1KB) { return '{0:N2} KB' -f ($bytes / 1KB) }
    return '{0:N0} B' -f $bytes
}

function Get-TreeSize([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return 0 }
    $sum = (Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0 }
    return [double]$sum
}

$beforeBytes = 0.0
foreach ($target in $targets) { $beforeBytes += Get-TreeSize $target }
Write-Host ("clean-build: reclaimable now {0}" -f (Format-Size $beforeBytes))

$failures = 0
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host ("  skip    {0} (not present)" -f $target)
        continue
    }
    if (-not $PSCmdlet.ShouldProcess($target, 'remove build output')) { continue }
    $size = Get-TreeSize $target
    try {
        # Fast path: one single-target recursive removal.
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
    }
    catch {
        # A sandbox delete guard (or a permission problem) can refuse a large
        # recursive removal. Report it instead of fighting the guard with a
        # different deletion pattern: the directory is regeneratable, so a
        # human can remove it from a normal terminal.
        $failures += 1
        Write-Warning ("  refused {0} ({1}); it is regeneratable, remove it manually from a normal terminal" -f $target, $_.Exception.GetType().Name)
        continue
    }
    if (Test-Path -LiteralPath $target) {
        $failures += 1
        Write-Warning ("  FAILED  {0} still exists" -f $target)
        continue
    }
    Write-Host ("  removed {0} ({1})" -f $target, (Format-Size $size))
}

$afterBytes = 0.0
foreach ($target in $targets) { $afterBytes += Get-TreeSize $target }
$freed = $beforeBytes - $afterBytes
Write-Host ("clean-build: freed {0}; remaining {1}" -f (Format-Size $freed), (Format-Size $afterBytes))
if ($failures -gt 0) {
    Write-Warning ("clean-build: {0} target(s) could not be removed (see warnings above)" -f $failures)
    exit 1
}
if ($freed -le 0) {
    Write-Host 'clean-build: nothing to reclaim (targets absent or already clean).'
}

param([switch]$WithRust, [switch]$WithWindowsSdk)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot '.cache'
$toolsRoot = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Path $cacheRoot, $toolsRoot -Force | Out-Null

function Get-OfficialFile([string]$Url, [string]$Target, [string]$Expected = '') {
    $resolvedTarget = [IO.Path]::GetFullPath($Target)
    if (-not $resolvedTarget.StartsWith($cacheRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Download target escapes project cache.' }
    if (Test-Path -LiteralPath $Target) {
        if (-not $Expected -or (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -eq $Expected) { return }
    }
    $downloadTarget = $Target + '.download'
    & curl.exe --fail --location --silent --show-error --retry 2 --max-time 300 --output $downloadTarget $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    if ($Expected) { Assert-Sha256 $downloadTarget $Expected }
    Move-Item -LiteralPath $downloadTarget -Destination $Target -Force
}

function Assert-Sha256([string]$Target, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -ne $Expected) { throw "SHA256 mismatch: $Target" }
}

$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$nodeFilename = "node-$nodeVersion-win-x64.zip"
$nodeArchive = Join-Path $cacheRoot $nodeFilename
$nodeHashes = Join-Path $cacheRoot "$nodeVersion-SHASUMS256.txt"
Get-OfficialFile "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" $nodeHashes
$hashLine = Get-Content -LiteralPath $nodeHashes | Where-Object { $_ -match "  $([regex]::Escape($nodeFilename))$" }
if (-not $hashLine) { throw 'Official Node hash not found.' }
Get-OfficialFile "https://nodejs.org/dist/$nodeVersion/$nodeFilename" $nodeArchive ($hashLine -split '\s+')[0]
if (-not (Test-Path -LiteralPath (Join-Path $toolsRoot "node-$nodeVersion-win-x64\node.exe"))) {
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $toolsRoot
}

if ($WithRust) {
    $installer = Join-Path $cacheRoot 'rustup-init.exe'
    $hashFile = Join-Path $cacheRoot 'rustup-init.exe.sha256'
    $rustBase = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
    Get-OfficialFile "$rustBase.sha256" $hashFile
    Get-OfficialFile $rustBase $installer ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0]
    $previousRustup = $env:RUSTUP_HOME
    $previousCargo = $env:CARGO_HOME
    try {
        $env:RUSTUP_HOME = Join-Path $toolsRoot 'rustup'
        $env:CARGO_HOME = Join-Path $toolsRoot 'cargo'
        $toolchainLine = Select-String -LiteralPath (Join-Path $projectRoot 'src-tauri\rust-toolchain.toml') -Pattern '^channel\s*=\s*"([^"]+)"'
        $toolchainVersion = $toolchainLine.Matches[0].Groups[1].Value
        & $installer -y --no-modify-path --profile minimal --default-toolchain "$toolchainVersion-x86_64-pc-windows-msvc"
        if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed.' }
        & (Join-Path $env:CARGO_HOME 'bin\rustup.exe') component add rustfmt clippy --toolchain $toolchainVersion
        if ($LASTEXITCODE -ne 0) { throw 'Rust component installation failed.' }
    } finally {
        $env:RUSTUP_HOME = $previousRustup
        $env:CARGO_HOME = $previousCargo
    }
}

if ($WithWindowsSdk) {
    $sdkLock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-sdk-lock.json') -Raw | ConvertFrom-Json
    foreach ($package in $sdkLock.packages) {
        $filename = "$($package.id).$($sdkLock.packageVersion).nupkg"
        $archive = Join-Path $cacheRoot "windows-sdk-$($package.id)-$($sdkLock.packageVersion).nupkg"
        Get-OfficialFile "https://api.nuget.org/v3-flatcontainer/$($package.id)/$($sdkLock.packageVersion)/$filename" $archive $package.sha256
        $destination = Join-Path $toolsRoot "windows-sdk\$($sdkLock.packageVersion)\$($package.directory)"
        $marker = Join-Path $destination '.complete'
        if (-not (Test-Path -LiteralPath $marker)) {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
            try {
                foreach ($entry in $zip.Entries) {
                    $entryPath = [IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
                    if (-not $entryPath.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes SDK directory.' }
                    if ($entry.Name -eq '') { New-Item -ItemType Directory -Path $entryPath -Force | Out-Null }
                    else {
                        New-Item -ItemType Directory -Path (Split-Path -Parent $entryPath) -Force | Out-Null
                        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $entryPath, $true)
                    }
                }
                Set-Content -LiteralPath $marker -Value $package.sha256
            } finally { $zip.Dispose() }
        }
    }
}
Write-Output 'Project tools are ready. Use scripts/project.ps1 and npm ci with Node 24.'

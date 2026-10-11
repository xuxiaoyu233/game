param(
    [Parameter(Position = 0)]
    [ValidateSet('deps', 'dev', 'desktop', 'check', 'build', 'native-check', 'native-build', 'e2e', 'format')]
    [string]$Task = 'dev',
    [string]$TauriConfig = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalDirectory = Get-Location
$originalEnvironment = @{}
Get-ChildItem Env: | ForEach-Object { $originalEnvironment[$_.Name] = $_.Value }
$taskExitCode = 1
try {
    Set-Location -LiteralPath $projectRoot
    $nodeVersion = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
    $nodeDirectory = Join-Path $projectRoot ".tools\node-$nodeVersion-win-x64"
    if (Test-Path -LiteralPath (Join-Path $nodeDirectory 'node.exe')) { $env:Path = $nodeDirectory + ';' + $env:Path }
    $cargoDirectory = Join-Path $projectRoot '.tools\cargo'
    if (Test-Path -LiteralPath (Join-Path $cargoDirectory 'bin\cargo.exe')) {
        $env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
        $env:CARGO_HOME = $cargoDirectory
        $cargoShim = Join-Path $cargoDirectory 'bin\cargo.exe'
        if ((Get-Item -LiteralPath $cargoShim).Length -gt 0) {
            $env:Path = (Join-Path $cargoDirectory 'bin') + ';' + $env:Path
        }
    }
    $rustToolchain = Select-String -LiteralPath (Join-Path $projectRoot 'src-tauri\rust-toolchain.toml') -Pattern '^channel\s*=\s*"([^"]+)"'
    $env:RUSTUP_TOOLCHAIN = $rustToolchain.Matches[0].Groups[1].Value
    $rustToolchainBin = Join-Path $projectRoot ".tools\rustup\toolchains\$($env:RUSTUP_TOOLCHAIN)-x86_64-pc-windows-msvc\bin"
    if (Test-Path -LiteralPath (Join-Path $rustToolchainBin 'cargo.exe')) {
        $env:Path = $rustToolchainBin + ';' + $env:Path
    }
    $testTemp = Join-Path $projectRoot '.cache\temp'
    New-Item -ItemType Directory -Path $testTemp -Force | Out-Null
    $env:TEMP = $testTemp
    $env:TMP = $testTemp

    if ($Task -in @('desktop', 'native-check', 'native-build')) {
        $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path -LiteralPath $vswhere) {
            $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
            if ($installation) {
                $vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
                $vcvarsCommand = 'call "' + $vcvars + '" >nul && set'
                $environmentLines = & $env:ComSpec /d /c $vcvarsCommand
                $importedPath = $false
                foreach ($line in $environmentLines) {
                    if ($line -match '^([^=]+)=(.*)$') {
                        if ($Matches[1] -ieq 'PATH') {
                            if (-not $importedPath) {
                                $env:Path = $Matches[2]
                                $importedPath = $true
                            }
                        }
                        else { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
                    }
                }
                $msvcToolRoot = Get-ChildItem -LiteralPath (Join-Path $installation 'VC\Tools\MSVC') -Directory |
                    Sort-Object { [version]$_.Name } -Descending |
                    Select-Object -First 1 -ExpandProperty FullName
                if ($msvcToolRoot) {
                    $msvcLinker = Join-Path $msvcToolRoot 'bin\Hostx64\x64\link.exe'
                    $msvcCompiler = Join-Path $msvcToolRoot 'bin\Hostx64\x64\cl.exe'
                    $msvcArchiver = Join-Path $msvcToolRoot 'bin\Hostx64\x64\lib.exe'
                    $msvcLibrary = Join-Path $msvcToolRoot 'lib\x64'
                    $msvcInclude = Join-Path $msvcToolRoot 'include'
                    if ((Test-Path -LiteralPath $msvcLinker) -and (Test-Path -LiteralPath $msvcCompiler) -and (Test-Path -LiteralPath $msvcArchiver) -and (Test-Path -LiteralPath $msvcLibrary)) {
                        $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $msvcLinker
                        $env:CC = $msvcCompiler
                        $env:CXX = $msvcCompiler
                        $env:AR = $msvcArchiver
                        $env:Path = (Split-Path -Parent $msvcLinker) + ';' + $env:Path
                        $env:LIB = $msvcLibrary + ';' + $env:LIB
                        $env:INCLUDE = $msvcInclude + ';' + $env:INCLUDE
                    }
                }
            }
        }
        $sdkLock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-sdk-lock.json') -Raw | ConvertFrom-Json
        $sdkRoot = Join-Path $projectRoot ".tools\windows-sdk\$($sdkLock.packageVersion)"
        $sdkBin = Join-Path $sdkRoot "cpp\c\bin\$($sdkLock.sdkVersion)\x64"
        if (Test-Path -LiteralPath (Join-Path $sdkBin 'rc.exe')) {
            $env:RC = Join-Path $sdkBin 'rc.exe'
            $sdkInclude = Join-Path $sdkRoot "cpp\c\Include\$($sdkLock.sdkVersion)"
            $env:Path = $sdkBin + ';' + $env:Path
            $env:LIB = (Join-Path $sdkRoot 'x64\c\um\x64') + ';' + (Join-Path $sdkRoot 'x64\c\ucrt\x64') + ';' + $env:LIB
            $sdkIncludes = @('ucrt', 'shared', 'um', 'winrt', 'cppwinrt') | ForEach-Object { Join-Path $sdkInclude $_ }
            $env:INCLUDE = ($sdkIncludes -join ';') + ';' + $env:INCLUDE
            $env:WindowsSdkDir = (Join-Path $sdkRoot 'cpp\c') + '\'
            $env:WindowsSDKVersion = $sdkLock.sdkVersion + '\'
        }
    }

    $localToolDirectories = @($nodeDirectory, (Join-Path $cargoDirectory 'bin'), $rustToolchainBin) | Where-Object { Test-Path -LiteralPath $_ }
    if ($localToolDirectories.Count -gt 0) {
        $env:Path = ($localToolDirectories -join ';') + ';' + $env:Path
    }
    switch ($Task) {
        'deps' { & npm.cmd ci }
        'dev' { & npm.cmd run dev }
        'desktop' { & npm.cmd run tauri -- dev -- --portable }
        'check' { & npm.cmd run check }
        'build' { & npm.cmd run build }
        'e2e' {
            $nodeExecutable = Join-Path $nodeDirectory 'node.exe'
            $viteStdout = Join-Path $testTemp 'vite-e2e.out.log'
            $viteStderr = Join-Path $testTemp 'vite-e2e.err.log'
            $viteProcess = $null
            try {
                $e2ePort = 1420
                if ($env:PROJECT_E2E_PORT) {
                    if (-not [int]::TryParse($env:PROJECT_E2E_PORT, [ref]$e2ePort) -or $e2ePort -lt 1024 -or $e2ePort -gt 65535) {
                        throw 'PROJECT_E2E_PORT must be an integer from 1024 to 65535.'
                    }
                }
                if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Pinned Node.js executable is missing.' }
                $viteProcess = Start-Process -FilePath $nodeExecutable `
                    -ArgumentList "node_modules/vite/bin/vite.js --mode web --host 127.0.0.1 --strictPort --port $e2ePort" `
                    -WorkingDirectory $projectRoot `
                    -WindowStyle Hidden `
                    -RedirectStandardOutput $viteStdout `
                    -RedirectStandardError $viteStderr `
                    -PassThru

                $serverReady = $false
                for ($attempt = 0; $attempt -lt 60; $attempt++) {
                    if ($viteProcess.HasExited) {
                        $serverOutput = Get-Content -LiteralPath $viteStdout, $viteStderr -Raw -ErrorAction SilentlyContinue
                        if ($serverOutput -match "Port $e2ePort is already in use") {
                            throw "E2E port $e2ePort is already in use; set PROJECT_E2E_PORT to an available port."
                        }
                        break
                    }
                    $serverOutput = Get-Content -LiteralPath $viteStdout, $viteStderr -Raw -ErrorAction SilentlyContinue
                    if ($serverOutput -match "Local:\s+http://127\.0\.0\.1:$e2ePort/") {
                        $serverReady = $true
                        break
                    }
                    Start-Sleep -Milliseconds 500
                }
                if (-not $serverReady) { throw "Vite test server did not become ready. See $viteStderr" }

                $env:PLAYWRIGHT_REUSE_SERVER = '1'
                $env:PROJECT_E2E_EXTERNAL_SERVER = '1'
                & npm.cmd run test:e2e
                $taskExitCode = $LASTEXITCODE
            }
            finally {
                if ($viteProcess -and -not $viteProcess.HasExited) {
                    Stop-Process -Id $viteProcess.Id -Force -ErrorAction SilentlyContinue
                    $viteProcess.WaitForExit(5000) | Out-Null
                }
            }
            $LASTEXITCODE = $taskExitCode
        }
        'format' { & npm.cmd run format }
        'native-build' {
            if ($TauriConfig) { & npm.cmd run tauri -- build --no-bundle --config $TauriConfig }
            else { & npm.cmd run tauri -- build --no-bundle }
            if ($LASTEXITCODE -eq 0 -and -not $TauriConfig) {
                $releaseExe = Join-Path $projectRoot 'src-tauri\target\x86_64-pc-windows-msvc\release\zhujie-rescue-bureau-desktop.exe'
                $deliveryDirectory = Join-Path $projectRoot 'artifacts\windows'
                New-Item -ItemType Directory -Path $deliveryDirectory -Force | Out-Null
                $deliveryVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
                if ($deliveryVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid delivery version.' }
                $deliveryFileName = "ZhuJieRescueBureau-v$deliveryVersion.exe"
                Copy-Item -LiteralPath $releaseExe -Destination (Join-Path $deliveryDirectory $deliveryFileName) -Force
                $newLauncherLines = @('@echo off', ("start `"`" `"%~dp0$deliveryFileName`" --portable"))
                Set-Content -LiteralPath (Join-Path $deliveryDirectory '启动游戏.cmd') -Value $newLauncherLines -Encoding ascii
                Set-Content -LiteralPath (Join-Path $deliveryDirectory '启动诸界救援局.cmd') -Value $newLauncherLines -Encoding ascii
                Write-Output ('Portable game: ' + $deliveryDirectory)
            }
        }
        'native-check' {
            & cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
            if ($LASTEXITCODE -ne 0) { throw 'Rust formatting failed.' }
            & cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
            if ($LASTEXITCODE -ne 0) { throw 'Rust clippy failed.' }
            & cargo test --manifest-path src-tauri/Cargo.toml --locked
        }
    }
    $taskExitCode = $LASTEXITCODE
} finally {
    Get-ChildItem Env: | Where-Object { -not $originalEnvironment.ContainsKey($_.Name) } | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, $null, 'Process') }
    foreach ($name in $originalEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
    Set-Location -LiteralPath $originalDirectory
}
exit $taskExitCode

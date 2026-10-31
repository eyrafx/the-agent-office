[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$toolsRoot=Join-Path $projectRoot '.tools'
$env:CARGO_HOME=Join-Path $toolsRoot 'cargo'
$env:RUSTUP_HOME=Join-Path $toolsRoot 'rustup'
$env:TEMP=Join-Path $toolsRoot 'tmp'
$env:TMP=$env:TEMP
$env:RUSTUP_INIT_SKIP_PATH_CHECK='yes'
New-Item -ItemType Directory -Force -Path $toolsRoot,$env:TEMP | Out-Null
$installer=Join-Path $toolsRoot 'rustup-init.exe'
$source='https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
Invoke-WebRequest -Uri $source -OutFile $installer
$expected=([string](Invoke-RestMethod -Uri ($source+'.sha256'))).Split(' ')[0].Trim()
$actual=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
if ($expected -ne $actual) { throw 'Official Rust installer checksum mismatch.' }
& $installer -y --no-modify-path --profile minimal --default-toolchain stable-x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw 'Project-local Rust installation failed.' }
& (Join-Path $env:CARGO_HOME 'bin/rustc.exe') --version

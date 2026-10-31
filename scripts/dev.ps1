[CmdletBinding()]
param(
  [ValidateSet('check','web','test','native','bundle')][string]$Action = 'check',
  [switch]$Demo,
  # bundle only: another version number for this one build (an update to install over the last), the
  # project's own version left as it is.
  [string]$Version
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:CARGO_HOME = Join-Path $projectRoot '.tools/cargo'
$env:RUSTUP_HOME = Join-Path $projectRoot '.tools/rustup'
$env:CARGO_TARGET_DIR = Join-Path $projectRoot '.artifacts/cargo-target'
$env:npm_config_cache = Join-Path $projectRoot '.cache/npm'
$env:AGENTOFFICE_DATA_DIR = Join-Path $projectRoot '.local-data'
$env:TEMP = Join-Path $projectRoot '.tools/tmp'
$env:TMP = $env:TEMP
$env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
New-Item -ItemType Directory -Force -Path $env:TEMP,$env:CARGO_TARGET_DIR,$env:npm_config_cache | Out-Null

# Import MSVC's environment into this process only. No profile or machine PATH writes.
$vswhere = 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = if (Test-Path $vswhere) { & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
if ($vsPath) {
  $vcvars = Join-Path $vsPath 'VC/Auxiliary/Build/vcvars64.bat'
  $compilerEnvironment = & $env:ComSpec /d /c "`"$vcvars`" >nul && set"
  foreach ($line in $compilerEnvironment) {
    if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2],'Process') }
  }
}
function Invoke-Checked([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Build step failed with exit code $LASTEXITCODE" }
}
Push-Location (Join-Path $projectRoot 'app')
try {
  # The std-only hook relay is a separate crate shipped as a bundle resource;
  # tauri-build checks resources exist, so build it before the app.
  if ($Action -in 'test','native','bundle') { Invoke-Checked { cargo build --release --manifest-path hook/Cargo.toml } }
  switch ($Action) {
    'check' {
      Invoke-Checked { node --version }
      Invoke-Checked { npm.cmd --version }
      Invoke-Checked { cargo --version }
      Invoke-Checked { rustc --version }
      if (-not $vsPath) { throw 'Visual Studio C++ Build Tools not found.' }
      Write-Output "Project-local tools ready. C++ Build Tools: $vsPath"
    }
    'web' { Invoke-Checked { npm.cmd run dev } }
    'test' {
      Invoke-Checked { npm.cmd test }
      Invoke-Checked { cargo test --manifest-path src-tauri/Cargo.toml }
    }
    'native' {
      if ($Demo) { Invoke-Checked { npm.cmd run tauri -- dev -- --demo } }
      else { Invoke-Checked { npm.cmd run tauri -- dev } }
    }
    'bundle' {
      if ($Version) { $override = Join-Path $env:TEMP 'agentoffice-version.json'; [IO.File]::WriteAllText($override, ('{"version":"' + $Version + '"}')); Invoke-Checked { npm.cmd run tauri -- build --bundles nsis --features custom-protocol --config $override } }
      else { Invoke-Checked { npm.cmd run tauri -- build --bundles nsis --features custom-protocol } }
      $installerDir=Join-Path $env:CARGO_TARGET_DIR 'release/bundle/nsis'
      Copy-Item -Path (Join-Path $installerDir '*.exe') -Destination (Join-Path $projectRoot '.artifacts') -Force
      Get-ChildItem -LiteralPath (Join-Path $projectRoot '.artifacts') -Filter '*setup.exe' | Select-Object Name,Length,FullName
    }
  }
} finally { Pop-Location }

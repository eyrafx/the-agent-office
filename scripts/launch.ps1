[CmdletBinding()]
param([switch]$Demo,[switch]$Release,[switch]$Background)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$env:AGENTOFFICE_DATA_DIR=Join-Path $projectRoot '.local-data'
$env:TEMP=Join-Path $projectRoot '.tools/tmp'
$env:TMP=$env:TEMP
$profile=if($Release){'release'}else{'debug'}
$binary=Join-Path $projectRoot ".artifacts/cargo-target/$profile/agentoffice.exe"
if(-not(Test-Path -LiteralPath $binary)){throw "Build AgentOffice first: $binary"}
$options=@{FilePath=$binary;WorkingDirectory=$projectRoot;PassThru=$true}
$arguments=@(); if($Demo){$arguments+='--demo'}; if($Background){$arguments+='--background'}
if($arguments){$options.ArgumentList=$arguments}
# AgentOffice is the visible application the user requested, not a background helper.
$process=Start-Process @options
[pscustomobject]@{ProcessId=$process.Id;Binary=$binary;DataDirectory=$env:AGENTOFFICE_DATA_DIR}

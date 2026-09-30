# VALKYRIE v4 one-click local run (Windows PowerShell 5.1+).
#   .\run.ps1              collect -> model -> snapshot -> check -> server (http://127.0.0.1:4134/)
#   .\run.ps1 -Offline     skip data collection (demo day / no network): rebuild from existing 00_RAW
#   .\run.ps1 -ServeOnly   start the server only
#   .\run.ps1 -Team        listen on all interfaces so teammates on the LAN can open it
# Collection failures are non-fatal: collectors keep the previous files for any series that fail.
param([switch]$Offline, [switch]$ServeOnly, [switch]$Team, [int]$Port = 4134)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONDONTWRITEBYTECODE = "1"

function Step($name, $script, [switch]$Soft) {
    Write-Host "==> $name" -ForegroundColor Cyan
    python $script
    if ($LASTEXITCODE -ne 0) {
        if ($Soft) { Write-Host "    $name reported failures (previous data kept)" -ForegroundColor Yellow }
        else { Write-Host "    $name FAILED - stopping" -ForegroundColor Red; exit $LASTEXITCODE }
    }
}

if (-not $ServeOnly) {
    if (-not $Offline) {
        Step "00_RAW  ECOS / FRED" "pipeline\collect.py" -Soft
        Step "00_RAW  Naver Finance" "pipeline\collect_naver.py" -Soft
        Step "00_RAW  research (CB Zero Finder / 38 / NAVER)" "pipeline\collect_research.py" -Soft
    }
    Step "10_MODEL" "pipeline\model.py"
    Step "20_SNAPSHOT + offline bundle" "pipeline\snapshot.py"
    Step "acceptance checks" "pipeline\check.py"
}

$bind = if ($Team) { "0.0.0.0" } else { "127.0.0.1" }
Write-Host "==> server  http://127.0.0.1:$Port/   (offline fallback: open web\index.html directly)" -ForegroundColor Green
$extra = if ($Offline) { @("--no-refresh") } else { @() }
python server.py --host $bind --port $Port @extra

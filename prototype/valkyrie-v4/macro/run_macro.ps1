# QUANT MACRO TERMINAL local run: http://localhost:8501
#   .\macro\run_macro.ps1            (app.py reads FRED_API_KEY from ..\.env)
#   .\macro\run_macro.ps1 -Port 8502
param([int]$Port = 8501)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$py = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
& $py -m streamlit run app.py --server.headless true --server.port $Port --browser.gatherUsageStats false

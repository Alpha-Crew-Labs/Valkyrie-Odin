# 채권 위기 진단 & 액션 플랜 앱 실행 (처음 실행 시 가상환경과 패키지를 자동 설치)
#   powershell -ExecutionPolicy Bypass -File .\run_bond_app.ps1            # 앱만 실행
#   powershell -ExecutionPolicy Bypass -File .\run_bond_app.ps1 -Refresh   # 데이터 갱신 후 실행
param([switch]$Refresh, [int]$Port = 8511)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$py = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "가상환경 생성 중 (.venv)..."
    python -m venv .venv
}
& $py -c "import streamlit, plotly, scipy, pandas" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "패키지 설치 중..."
    & $py -m pip install -q --disable-pip-version-check -r bond\requirements.txt
}

$data = "data\30_BOND\korea_bond_action_plan.json"
if ($Refresh -or -not (Test-Path $data)) {
    foreach ($s in "collect_korea_bonds", "kim_filter_korea_bond_real", "crisis_dashboard", "action_plan") {
        Write-Host "== $s =="
        & $py "bond\$s.py"
        if ($LASTEXITCODE -ne 0) { throw "$s 실패" }
    }
}

Write-Host "브라우저에서 http://localhost:$Port 를 여세요 (같은 네트워크의 다른 PC는 http://<이 PC IP>:$Port)"
& ".\.venv\Scripts\streamlit.exe" run bond\explainer_app.py --server.port $Port

# VALKYRIE demo video, one click (the app must be running: ..\run.ps1 → http://127.0.0.1:4134/).
#   .\make_demo.ps1            record (headless Chrome, narration-paced) →
#                              out\VALKYRIE_demo.mp4 (voice + subtitles, + .srt, stills\)
#                              out\VALKYRIE_demo_silent.mp4 (subtitles, no voice)
#                              out\VALKYRIE_demo_clean.mp4 (voice, no subtitles)
#   .\make_demo.ps1 -NoAI      layout check without the AI question / ODIN publish (writes nothing to data\state)
#   .\make_demo.ps1 -Compose   re-compose the last recording only (subtitle/overlay tweaks)
#   .\make_demo.ps1 -Voice ko-KR-InJoonNeural -Rate +10%
# A full run asks the AI one question (~$0.05) and publishes one ODIN comment into data\state\publish.json.
# The narration is synthesized with Microsoft's online TTS (edge-tts): only the narration text is sent; lines are cached in _work\tts.
param([switch]$NoAI, [switch]$Compose, [string]$Voice = "ko-KR-SunHiNeural", [string]$Rate = "+15%")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$py = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"

if (-not (Test-Path "_vendor\imageio_ffmpeg") -or -not (Test-Path "_vendor\edge_tts")) {
    Write-Host "==> installing imageio-ffmpeg + edge-tts into demo\_vendor" -ForegroundColor Cyan
    & $py -m pip install --quiet --disable-pip-version-check --target _vendor imageio-ffmpeg edge-tts
}
if (-not $Compose) {
    Write-Host "==> recording" -ForegroundColor Cyan
    $extra = @("--voice", $Voice, "--rate", $Rate)
    if ($NoAI) { $extra += "--no-ai" }
    & $py record_demo.py @extra
    if ($LASTEXITCODE -ne 0) { Write-Host "recording failed" -ForegroundColor Red; exit $LASTEXITCODE }
}
Write-Host "==> composing (voice + subtitles, and the subtitled silent cut)" -ForegroundColor Cyan
& $py compose_demo.py
Write-Host "==> composing (voice, no subtitles)" -ForegroundColor Cyan
& $py compose_demo.py --no-subs
Write-Host "==> done: $PSScriptRoot\out" -ForegroundColor Green

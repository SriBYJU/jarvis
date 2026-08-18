$ErrorActionPreference = 'Stop'
Write-Host "`nJ.A.R.V.I.S. LOCAL CORE // SETUP" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor DarkCyan

function Require-Command($name, $help) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "MISSING: $name" -ForegroundColor Red
    Write-Host $help -ForegroundColor Yellow
    exit 1
  }
  Write-Host "OK: $name" -ForegroundColor Green
}

Require-Command "node" "Install Node.js, then run this setup again."
Require-Command "npm" "Install Node.js/npm, then run this setup again."

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created companion/.env from the safe template." -ForegroundColor Green
}

Write-Host "Installing local-core dependencies..." -ForegroundColor Cyan
npm install

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($chrome) {
  Write-Host "OK: Google Chrome detected" -ForegroundColor Green
} else {
  Write-Host "Chrome was not auto-detected. Install Chrome or set JARVIS_CHROME_PATH in companion/.env for browser control." -ForegroundColor Yellow
}

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Write-Host "OK: Ollama detected" -ForegroundColor Green
  try { $models = ollama list 2>$null; Write-Host $models } catch {}
} else {
  Write-Host "Ollama is not installed yet. JARVIS Realtime requires Ollama for local conversation." -ForegroundColor Yellow
}

Write-Host "`nLocal services that will start:" -ForegroundColor Cyan
Write-Host "- 3003 JARVIS Core (tools / agents / missions)" -ForegroundColor Gray
Write-Host "- 3004 MCP Bridge" -ForegroundColor Gray
Write-Host "- 3005 Spotify Adapter" -ForegroundColor Gray
Write-Host "- 3006 Browser Service" -ForegroundColor Gray
Write-Host "- 3007 JARVIS Realtime (conversation / wake voice / instant HUD routing)" -ForegroundColor Green

Write-Host "`nSecurity reminder:" -ForegroundColor Cyan
Write-Host "- Keep real credentials only in companion/.env" -ForegroundColor Gray
Write-Host "- Do not commit .env" -ForegroundColor Gray
Write-Host "- Add extra folders only through JARVIS_WORKSPACES" -ForegroundColor Gray
Write-Host "- Log into sites only in the dedicated JARVIS Chrome profile when you want the agent to use those sessions" -ForegroundColor Gray

Write-Host "`nStarting J.A.R.V.I.S. v4 services..." -ForegroundColor Cyan
npm start

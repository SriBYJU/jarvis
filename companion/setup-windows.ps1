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

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Write-Host "OK: Ollama detected" -ForegroundColor Green
  try {
    $models = ollama list 2>$null
    Write-Host $models
  } catch {}
} else {
  Write-Host "Ollama is not installed yet. The web app will keep cloud fallback until you install/start Ollama." -ForegroundColor Yellow
}

Write-Host "`nSecurity reminder:" -ForegroundColor Cyan
Write-Host "- Keep real credentials only in companion/.env" -ForegroundColor Gray
Write-Host "- Do not commit .env" -ForegroundColor Gray
Write-Host "- Add extra folders only through JARVIS_WORKSPACES" -ForegroundColor Gray

Write-Host "`nStarting J.A.R.V.I.S. Local Core..." -ForegroundColor Cyan
npm start

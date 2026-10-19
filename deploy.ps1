# SahaTN - Deploiement local (production-like)
# Lancer dans PowerShell : .\deploy.ps1

$ErrorActionPreference = "Stop"

# Racine du projet
$root = $PSScriptRoot

# 1. Variables environnement backend
$env:NODE_ENV = "production"
$env:PORT = "4000"
$env:API_PREFIX = "api"
$env:CORS_ORIGIN = "http://localhost:3000"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/sahatn_prod"
$env:SESSION_COOKIE_NAME = "sahatn_session"
$env:CSRF_COOKIE_NAME = "sahatn_csrf"
$env:SESSION_TTL_SECONDS = "604800"
$env:LOGIN_MAX_ATTEMPTS = "5"
$env:LOGIN_LOCK_MINUTES = "15"
$env:ENABLE_API_DOCS = "false"

Write-Host "`n== 1. Build backend (production) ==" -ForegroundColor Cyan
Push-Location $root\backend
npm ci --no-audit --no-fund
npx prisma generate
npm run build
Pop-Location

Write-Host "`n== 2. Base PostgreSQL embarquee persistante (port 55435) ==" -ForegroundColor Cyan
Push-Location $root\backend
$devDbScript = "scripts/dev-db.mjs"
if (!(Test-Path $devDbScript)) {
  Write-Error "script manquant: $devDbScript"
}

$proc = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList "scripts/dev-db.mjs" `
  -WorkingDirectory (Get-Location).Path `
  -Environment @{ DEV_DB_PORT="55435"; DEV_DB_NAME="sahatn_prod"; NODE_ENV="development" } `
  -PassThru -WindowStyle Minimized

# Attendre qu'elle soit prete (environ 30s)
$timeout = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $timeout -and -not $proc.HasExited) {
  Start-Sleep -Seconds 2
}
if ($proc.HasExited) {
  Write-Warning "dev-db.mjs s'est arrete prematurement (exit $($proc.ExitCode))"
}
Pop-Location

Write-Host "`n== 3. Build frontend (production) ==" -ForegroundColor Cyan
Push-Location $root\frontend
$env:API_URL = "http://localhost:4000"
npm ci --no-audit --no-fund
npm run build
Pop-Location

Write-Host "`n== 4. Démarrage backend en production ==" -ForegroundColor Cyan
Push-Location $root\backend
$backendProc = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList "dist\main.js" `
  -WorkingDirectory (Get-Location).Path `
  -PassThru -WindowStyle Normal

Pop-Location

Write-Host "`n== 5. Démarrage frontend en production ==" -ForegroundColor Cyan
Push-Location $root\frontend
$frontendProc = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList "node_modules\next\dist\bin\next","start","-p","3000" `
  -WorkingDirectory (Get-Location).Path `
  -PassThru -WindowStyle Normal
Pop-Location

Write-Host "`nDéploiement local lancé !" -ForegroundColor Green
Write-Host "Frontend : http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend  : http://localhost:4000/api" -ForegroundColor Yellow
Write-Host "Santé    : http://localhost:4000/api/health" -ForegroundColor Yellow
Write-Host "PIDs backend=$($backendProc.Id) frontend=$($frontendProc.Id)" -ForegroundColor Gray
Write-Host "`nPour arrêter : taskkill /PID $($backendProc.Id) /T /F; taskkill /PID $($frontendProc.Id) /T /F" -ForegroundColor Gray

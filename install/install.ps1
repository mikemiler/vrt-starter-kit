# VRT Starter Kit · installer for Windows
# Run from the project folder in PowerShell:
#   powershell -ExecutionPolicy Bypass -File install\install.ps1
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host ""
Write-Host "  VRT Starter Kit · setup"
Write-Host "  -------------------------"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  X Node.js is not installed." -ForegroundColor Red
  Write-Host "    -> Download the LTS version from https://nodejs.org, install it,"
  Write-Host "       close this window, open a new one and run this script again."
  exit 1
}

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Host "  X Node.js $(node -v) is too old. Please install version 20 or newer from https://nodejs.org" -ForegroundColor Red
  exit 1
}
Write-Host "  OK Node.js $(node -v)" -ForegroundColor Green

Write-Host "  > Installing packages (about 10 MB) ..."
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
  Write-Host "  X npm install failed. Check your internet connection." -ForegroundColor Red
  exit 1
}

npm run doctor

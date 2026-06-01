# deploy.ps1 - Mosaic International
# Usage:
#   .\deploy.ps1 dev "message du commit"   -> push develop (Preview Vercel)
#   .\deploy.ps1 prod                      -> merge develop->main (Production Vercel)

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev","prod")]
    [string]$Target,

    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

if ($Target -eq "dev") {
    if (-not $Message) {
        $Message = Read-Host "Message du commit"
    }
    if (-not $Message) {
        Write-Host "ERREUR: message de commit requis." -ForegroundColor Red
        exit 1
    }

    Write-Host "[1/4] Passage sur develop..." -ForegroundColor Cyan
    git checkout develop

    Write-Host "[2/4] Ajout des fichiers..." -ForegroundColor Cyan
    git add .

    Write-Host "[3/4] Commit: $Message" -ForegroundColor Cyan
    git commit -m $Message

    Write-Host "[4/4] Push develop..." -ForegroundColor Cyan
    git push origin develop

    Write-Host ""
    Write-Host "OK - Preview en cours de deploiement sur Vercel." -ForegroundColor Green
    Write-Host "Attends 2 min puis teste l'URL Preview." -ForegroundColor Yellow
}

if ($Target -eq "prod") {
    Write-Host "[1/4] Passage sur main..." -ForegroundColor Cyan
    git checkout main

    Write-Host "[2/4] Merge develop dans main..." -ForegroundColor Cyan
    git merge develop --no-edit

    Write-Host "[3/4] Push main..." -ForegroundColor Cyan
    git push origin main

    Write-Host "[4/4] Retour sur develop..." -ForegroundColor Cyan
    git checkout develop

    Write-Host ""
    Write-Host "OK - Production en cours de deploiement sur Vercel." -ForegroundColor Green
    Write-Host "Attends 2-3 min puis teste : https://mosaic-sage-ten.vercel.app" -ForegroundColor Yellow
}

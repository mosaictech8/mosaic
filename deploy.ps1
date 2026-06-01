# ================================================================
#  deploy.ps1 — Mosaïc International
#  Usage :
#    .\deploy.ps1 dev   "message du commit"   → push develop (Preview)
#    .\deploy.ps1 prod                         → merge develop → main (Production)
# ================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev","prod")]
    [string]$Target,

    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($text) {
    Write-Host "`n▶ $text" -ForegroundColor Cyan
}
function Write-OK($text) {
    Write-Host "  ✓ $text" -ForegroundColor Green
}
function Write-Err($text) {
    Write-Host "  ✗ $text" -ForegroundColor Red
}

# ── DEV : commit + push develop → Vercel Preview
if ($Target -eq "dev") {
    if (-not $Message) {
        $Message = Read-Host "Message du commit"
    }
    if (-not $Message) {
        Write-Err "Message de commit requis."
        exit 1
    }

    Write-Step "Passage sur la branche develop..."
    git checkout develop
    Write-OK "Branche develop"

    Write-Step "Ajout de tous les fichiers modifiés..."
    git add .
    Write-OK "Fichiers stagés"

    Write-Step "Commit : $Message"
    git commit -m $Message
    Write-OK "Commit créé"

    Write-Step "Push develop → GitHub..."
    git push origin develop
    Write-OK "Pushed!"

    Write-Host "`n🚀 Preview Vercel en cours de déploiement..." -ForegroundColor Yellow
    Write-Host "   URL Preview : https://mosaic-git-develop-mosaictech8.vercel.app" -ForegroundColor White
    Write-Host "   Attends 1-2 minutes puis rafraîchis." -ForegroundColor Gray
}

# ── PROD : merge develop → main → Vercel Production
if ($Target -eq "prod") {
    Write-Step "Vérification de la branche courante..."
    $branch = git branch --show-current
    Write-OK "Branche actuelle : $branch"

    Write-Step "Passage sur main..."
    git checkout main
    Write-OK "Sur main"

    Write-Step "Merge develop → main..."
    git merge develop --no-edit
    Write-OK "Merge effectué"

    Write-Step "Push main → GitHub (déploiement Production)..."
    git push origin main
    Write-OK "Pushed!"

    Write-Step "Retour sur develop..."
    git checkout develop
    Write-OK "Sur develop"

    Write-Host "`n🚀 Production Vercel en cours de déploiement..." -ForegroundColor Yellow
    Write-Host "   URL Production : https://mosaic-sage-ten.vercel.app" -ForegroundColor White
    Write-Host "   Attends 2-3 minutes puis rafraîchis." -ForegroundColor Gray
}

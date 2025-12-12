# Deployment Script for Windows
# Builds frontend and prepares for deployment

Write-Host "🚀 Starting deployment process..." -ForegroundColor Green

# 1. Build frontend
Write-Host "`n📦 Building frontend..." -ForegroundColor Cyan
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# 2. Copy built files to public
Write-Host "`n📁 Copying files to public folder..." -ForegroundColor Cyan
Copy-Item -Path "frontend\dist\frontend\browser\*" -Destination "public\" -Recurse -Force

# 3. Stage changes
Write-Host "`n📝 Staging changes..." -ForegroundColor Cyan
git add frontend/dist public frontend/src

# 4. Show status
Write-Host "`n📊 Git status:" -ForegroundColor Cyan
git status

Write-Host "`n✅ Deployment preparation complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Review changes above"
Write-Host "  2. Run: git commit -m 'Your commit message'"
Write-Host "  3. Run: git push origin feature/crm-implementation"
Write-Host "`nOn AWS server, run:" -ForegroundColor Yellow
Write-Host "  sudo chown -R ubuntu:ubuntu /var/www/whatsapp-meta-bot-nodejs"
Write-Host "  git pull origin feature/crm-implementation"
Write-Host "  pm2 restart all"

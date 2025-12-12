# Deployment Guide

## Overview

This project uses a pre-built deployment strategy where the Angular frontend is built locally and committed to the repository. This eliminates the need to build on the AWS server, significantly reducing deployment time and server resource requirements.

## Quick Reference

### Local Development (Windows)
```powershell
# After making frontend changes
npm run deploy:prepare

# Review changes, then commit and push
git commit -m "Your commit message"
git push origin feature/crm-implementation
```

### AWS Server Deployment (Ubuntu)
```bash
# Deploy latest changes
./deploy.sh
```

---

## Detailed Workflow

### 1. Making Frontend Changes (Local)

After editing any frontend code in `frontend/src/`:

```powershell
# Option A: Use the automated script
npm run deploy:prepare

# Option B: Run the PowerShell script directly
.\deploy.ps1

# Option C: Manual steps
npm run build
Copy-Item -Path "frontend\dist\frontend\browser\*" -Destination "public\" -Recurse -Force
git add frontend/dist public frontend/src
```

All options will:
- Build the Angular frontend
- Copy compiled files to the `public/` folder
- Stage changes for commit

### 2. Commit and Push

```powershell
# Review staged changes
git status

# Commit with descriptive message
git commit -m "Add new feature X"

# Push to remote
git push origin feature/crm-implementation
```

### 3. Deploy to AWS Server

SSH into your AWS server and run:

```bash
cd /var/www/whatsapp-meta-bot-nodejs

# Option A: Use the deployment script (recommended)
./deploy.sh

# Option B: Manual deployment
sudo chown -R ubuntu:ubuntu /var/www/whatsapp-meta-bot-nodejs
git pull origin feature/crm-implementation
pm2 restart all
```

The deployment script will:
- Fix file permissions
- Pull latest changes from GitHub
- Restart the PM2 processes

### 4. Verify Deployment

- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Or open in incognito/private window
- Check that your changes are visible

---

## Important Notes

### Frontend Build Files
- ✅ **DO COMMIT** `frontend/dist/` and `public/` folders
- These folders contain the built frontend and are required for production
- `.gitignore` has been configured to allow these files

### Why This Approach?
- **Fast deployments**: No building on server (5-10 minutes → 30 seconds)
- **Works on small servers**: Even t2.micro instances can handle it
- **Reliable**: Same build everywhere, no environment differences
- **Immediate**: Just pull and restart

### Troubleshooting

#### Changes not showing on production
1. Clear browser cache (Ctrl+Shift+R)
2. Open in incognito/private window
3. Check if files were pulled: `ls -lh public/main-*.js`
4. Verify git status: `git log --oneline -5`

#### Permission errors on AWS
```bash
sudo chown -R ubuntu:ubuntu /var/www/whatsapp-meta-bot-nodejs
git reset --hard origin/feature/crm-implementation
pm2 restart all
```

#### Old files preventing pull
```bash
# Remove conflicting files and force pull
sudo rm -rf frontend/dist public/main-*.js public/styles-*.css
git pull origin feature/crm-implementation
pm2 restart all
```

---

## Script Reference

### `deploy.ps1` (Windows)
Automates frontend build and deployment preparation:
- Builds Angular frontend
- Copies files to public folder
- Stages changes for git
- Shows status and next steps

### `deploy.sh` (Ubuntu)
Automates server deployment:
- Fixes file permissions
- Pulls latest changes
- Restarts PM2 services

### NPM Scripts
- `npm run build` - Build frontend only (fast, 5-10 seconds)
- `npm run build:install` - Full build with dependency installation (slow, use when adding packages)
- `npm run deploy:prepare` - Complete deployment preparation (build + copy + stage)
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server

---

## First Time Setup on New Server

```bash
# 1. Clone repository
git clone https://github.com/DavidFlores79/whatsapp-meta-bot-nodejs.git
cd whatsapp-meta-bot-nodejs

# 2. Checkout correct branch
git checkout feature/crm-implementation

# 3. Install dependencies (backend only)
npm install

# 4. Set up environment variables
cp .env.example .env
nano .env

# 5. Make deployment script executable
chmod +x deploy.sh

# 6. Start with PM2
pm2 start src/app.js --name whatsapp-bot
pm2 save
```

No need to install frontend dependencies or build on the server - the built files are already in the repository!

---

## Best Practices

1. **Always run `npm run deploy:prepare` before pushing** to ensure built files are up to date
2. **Commit frontend source and built files together** so they stay in sync
3. **Use descriptive commit messages** to track what changed
4. **Test locally first** before deploying to production
5. **Hard refresh browser** after deployment to see changes
6. **Monitor PM2 logs** after deployment: `pm2 logs whatsapp-bot`

---

## Emergency Rollback

If something goes wrong after deployment:

```bash
# On AWS server
git log --oneline -10  # Find the commit hash to rollback to
git reset --hard <commit-hash>
pm2 restart all
```

Or rollback on GitHub and redeploy:
```bash
git pull origin feature/crm-implementation
pm2 restart all
```

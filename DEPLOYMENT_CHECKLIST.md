# Deployment Checklist

> **Quick Reference**: Steps to follow before pushing changes to ensure smooth deployment on the server

## Pre-Push Checklist (Run Locally)

### 1. Make Your Code Changes
```bash
# Edit backend files in src/
# Edit frontend files in frontend/src/
```

### 2. Build Frontend (if frontend changed)
```bash
cd frontend
npm run build
cd ..
```

### 3. Copy Built Files to Public
```bash
cp -r frontend/dist/frontend/browser/* public/
```

### 4. Test Locally (Optional but Recommended)
```bash
npm run dev
# Test on http://localhost:5000
```

### 5. Commit All Changes (Including Built Files)
```bash
git add -A
git commit -m "your descriptive commit message"
```

### 6. Push to Repository
```bash
git push origin feat/universal-ticket-system
```

---

## Server Deployment (Run on Ubuntu Server)

### SSH into Server
```bash
ssh ubuntu@your-server-ip
cd /var/www/whatsapp-meta-bot-nodejs
```

### Run Deploy Script
```bash
./deploy.sh
```

**That's it!** The script will:
- ✅ Pull latest changes
- ✅ Detect built files (skip rebuild)
- ✅ Install backend dependencies (if package.json changed)
- ✅ Restart PM2 services

---

## Common Scenarios

### Frontend Changes Only
```bash
# 1. Build frontend
cd frontend && npm run build && cd ..

# 2. Copy to public
cp -r frontend/dist/frontend/browser/* public/

# 3. Commit and push
git add -A
git commit -m "feat: update frontend feature"
git push origin feat/universal-ticket-system

# 4. On server
./deploy.sh
```

### Backend Changes Only
```bash
# 1. Make changes in src/

# 2. Commit and push
git add -A
git commit -m "fix: update backend logic"
git push origin feat/universal-ticket-system

# 3. On server
./deploy.sh
```

### Both Frontend & Backend Changes
```bash
# 1. Make all changes

# 2. Build frontend
cd frontend && npm run build && cd ..

# 3. Copy to public
cp -r frontend/dist/frontend/browser/* public/

# 4. Commit and push
git add -A
git commit -m "feat: update both frontend and backend"
git push origin feat/universal-ticket-system

# 5. On server
./deploy.sh
```

---

## Quick One-Liner (Frontend + Deploy)

For rapid frontend changes, use this one-liner:
```bash
cd frontend && npm run build && cd .. && cp -r frontend/dist/frontend/browser/* public/ && git add -A && git commit -m "feat: your message" && git push origin feat/universal-ticket-system
```

Then on server:
```bash
./deploy.sh
```

---

## Troubleshooting

### Deploy script says "Permission denied"
```bash
chmod +x deploy.sh
```

### Git conflicts on server
The deploy script automatically stashes local changes. If issues persist:
```bash
git reset --hard origin/feat/universal-ticket-system
./deploy.sh
```

### PM2 services not restarting
```bash
pm2 restart all
pm2 logs whatsapp-bot --lines 50
```

### Frontend not updating
Verify built files were committed:
```bash
git log --stat -1 | grep "public/"
```

If missing, rebuild and commit:
```bash
cd frontend && npm run build && cd ..
cp -r frontend/dist/frontend/browser/* public/
git add public/ && git commit --amend --no-edit
git push origin feat/universal-ticket-system --force-with-lease
```

---

## Important Notes

⚠️ **Always build frontend locally** - The server has limited resources

✅ **Commit built files** - Include `public/` directory changes

🔄 **Deploy script is smart** - Detects built files and skips rebuild

📦 **Dependencies** - Automatically installed only when package.json changes

🚀 **Fast deployments** - Usually takes < 10 seconds when following this workflow

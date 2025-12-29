#!/bin/bash
# Deployment Script for AWS Ubuntu Server
# Run this on the server after pushing changes
#
# OPTIMIZED WORKFLOW (Recommended for low-resource servers):
# 1. Build frontend locally: cd frontend && npm run build
# 2. Copy to public: cp -r frontend/dist/frontend/browser/* public/
# 3. Commit all changes including built files: git add -A && git commit -m "..."
# 4. Push: git push origin feat/universal-ticket-system
# 5. Deploy on server: ./deploy.sh (just pulls and restarts, no rebuild needed)
#
# The script automatically detects if frontend was built locally (checks for built files in commit)
# and skips rebuilding on the server to save resources.

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Fix permissions
echo "🔧 Fixing permissions..."
sudo chown -R ubuntu:ubuntu /var/www/whatsapp-meta-bot-nodejs

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "💾 Stashing local changes..."
    git stash push -u -m "Auto-stash before deployment $(date '+%Y-%m-%d %H:%M:%S')"
    STASHED=true
else
    echo "✨ Working directory clean"
    STASHED=false
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
BEFORE_PULL=$(git rev-parse HEAD)
git pull origin feat/universal-ticket-system
AFTER_PULL=$(git rev-parse HEAD)

# Check if there were actual changes
if [ "$BEFORE_PULL" = "$AFTER_PULL" ]; then
    echo "ℹ️  Already up to date"
else
    echo "✅ Successfully pulled changes"
    
    # Check if backend dependencies changed
    if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "^package.json\|^package-lock.json"; then
        echo "📦 Backend dependencies changed, reinstalling..."
        npm ci --only=production
    fi
    
    # Check if frontend built files are in the commit (committed from local build)
    if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "^public/main-.*\.js\|^public/styles-.*\.css"; then
        echo "✅ Frontend already built locally and committed, skipping rebuild"
    else
        # Only rebuild if source changed but built files weren't committed
        if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "frontend/src/"; then
            echo "⚠️  Frontend source changed but no built files found"
            echo "🔨 Building frontend on server (this may take time)..."
            
            # Check if frontend dependencies changed first
            if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "frontend/package.json"; then
                echo "📦 Installing frontend dependencies..."
                cd frontend && npm ci && npm run build && cd ..
            else
                # Just build without reinstalling deps
                cd frontend && npm run build && cd ..
            fi
            
            # Copy to public folder
            echo "📋 Copying built files to public..."
            cp -r frontend/dist/frontend/browser/* public/
        fi
    fi
fi

# Drop the stash if we created one (we don't need to keep lock file changes)
if [ "$STASHED" = true ]; then
    echo "🗑️  Cleaning up stashed changes..."
    git stash drop 2>/dev/null || echo "⚠️  Could not drop stash"
fi

# Restart services
echo "♻️  Restarting services..."
pm2 restart all

echo ""
echo "✅ Deployment complete!"
echo "🌐 Application is now running the latest version"
echo ""

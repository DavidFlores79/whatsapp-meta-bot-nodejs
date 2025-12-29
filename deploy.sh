#!/bin/bash
# Deployment Script for AWS Ubuntu Server
# Run this on the server after pushing changes

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
    
    # Check if dependencies changed
    if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "package.json\|package-lock.json"; then
        echo "📦 Dependencies changed, reinstalling..."
        npm ci --only=production
        
        # Check if frontend dependencies changed
        if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "frontend/package.json"; then
            echo "🎨 Frontend dependencies changed, rebuilding..."
            cd frontend && npm ci && npm run build && cd ..
        fi
    fi
    
    # Check if frontend source files changed
    if git diff $BEFORE_PULL $AFTER_PULL --name-only | grep -q "frontend/src/"; then
        echo "🔨 Frontend source changed, rebuilding..."
        cd frontend && npm run build && cd ..
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

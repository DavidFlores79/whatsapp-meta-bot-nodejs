#!/bin/bash
# Local Build & Push Script
# Automates the pre-push workflow: build frontend, copy to public, commit, and push

set -e  # Exit on error

echo "🚀 Starting local build and push workflow..."

# Check if commit message provided
if [ -z "$1" ]; then
    echo "❌ Error: Commit message required"
    echo "Usage: ./scripts/deploy-local.sh \"your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# Check if there are changes to commit
if ! git diff-index --quiet HEAD -- || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "📝 Changes detected"
else
    echo "✨ No changes to commit"
    exit 0
fi

# Check if frontend files changed
FRONTEND_CHANGED=false
if git status --short | grep -q "frontend/src/\|frontend/package.json\|frontend/angular.json"; then
    FRONTEND_CHANGED=true
    echo "🎨 Frontend changes detected"
fi

# Build frontend if changed
if [ "$FRONTEND_CHANGED" = true ]; then
    echo "🔨 Building frontend..."
    cd frontend
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Frontend build failed!"
        exit 1
    fi
    cd ..
    
    echo "📋 Copying built files to public..."
    cp -r frontend/dist/frontend/browser/* public/
    
    echo "✅ Frontend built and copied successfully"
else
    echo "⏭️  No frontend changes, skipping build"
fi

# Add all changes
echo "➕ Staging all changes..."
git add -A

# Commit
echo "💾 Committing changes..."
git commit -m "$COMMIT_MESSAGE"

# Push
echo "📤 Pushing to remote repository..."
git push origin feat/universal-ticket-system

echo ""
echo "✅ Local workflow complete!"
echo "🌐 Now run './deploy.sh' on the server to deploy"
echo ""

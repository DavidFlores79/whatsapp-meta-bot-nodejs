#!/bin/bash
# Deployment Script for AWS Ubuntu Server
# Run this on the server after pushing changes

echo "🚀 Starting deployment..."

# Fix permissions
echo "🔧 Fixing permissions..."
sudo chown -R ubuntu:ubuntu /var/www/whatsapp-meta-bot-nodejs

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin feature/crm-implementation

# Restart services
echo "♻️  Restarting services..."
pm2 restart all

echo "✅ Deployment complete!"
echo "🌐 Application should be updated now"

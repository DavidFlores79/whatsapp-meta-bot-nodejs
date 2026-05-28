#!/bin/bash
# Reads hook JSON from stdin; only acts on git commit commands
input=$(cat)
cmd=$(echo "$input" | jq -r ".tool_input.command // empty")

# Only intercept git commit calls
if ! echo "$cmd" | grep -q "git commit"; then
  exit 0
fi

# Check if any frontend/src/ files are staged
if ! git diff --cached --name-only | grep -q "^frontend/src/"; then
  exit 0
fi

echo "Frontend changes detected — building Angular app..."

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Build
cd frontend && npm run build
if [ $? -ne 0 ]; then
  echo '{"continue": false, "stopReason": "Frontend build failed. Fix the errors before committing."}'
  exit 0
fi
cd "$REPO_ROOT"

# Copy built files to public/
cp -r frontend/dist/frontend/browser/* public/

# Stage the built files
git add public/

echo "Frontend built and public/ staged successfully."

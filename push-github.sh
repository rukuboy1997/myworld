#!/bin/bash
# Push latest commits to GitHub (rukuboy1997/myworld-app)
# Requires GITHUB_TOKEN secret to be set in Replit Secrets

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set. Add it in the Replit Secrets tab."
  exit 1
fi

REMOTE="https://${GITHUB_TOKEN}@github.com/rukuboy1997/myworld-app.git"

echo "Pushing to GitHub..."
git push "$REMOTE" main

if [ $? -eq 0 ]; then
  echo "Done! GitHub is up to date."
else
  echo "Push failed. Check that GITHUB_TOKEN is valid and has write access."
  exit 1
fi

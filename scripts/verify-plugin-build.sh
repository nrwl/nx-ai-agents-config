#!/bin/bash
set -e

echo "Running build-claude-plugin..."
node scripts/build-claude-plugin.mjs

echo "Checking for uncommitted changes..."
if [ -n "$(git status --porcelain nx-claude-plugin/)" ]; then
  echo "Error: Generated files in nx-claude-plugin/ are out of sync with source."
  echo "Please run 'node scripts/build-claude-plugin.mjs' and commit the changes."
  echo ""
  echo "Changed files:"
  git status --porcelain nx-claude-plugin/
  echo ""
  echo "Diff:"
  git diff nx-claude-plugin/
  exit 1
fi

echo "Plugin build is up to date!"

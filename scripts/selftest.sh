#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"
bash scripts/check-branch-hygiene.sh || true
if [ -d "$REPO_DIR/../core" ] && [ -d "$REPO_DIR/../nodejs" ]; then
  npm install --no-save --no-package-lock \
    "$REPO_DIR/../core" \
    "$REPO_DIR/../nodejs" >/dev/null
fi
npm test

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"
bash scripts/check-branch-hygiene.sh || true
if [ -d "$REPO_DIR/../core/versions/10" ] && [ -d "$REPO_DIR/../nodejs/versions/10" ]; then
  npm install --no-save --no-package-lock \
    "$REPO_DIR/../core/versions/10" \
    "$REPO_DIR/../nodejs/versions/10" >/dev/null
fi
npm test

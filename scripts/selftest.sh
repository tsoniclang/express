#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXPRESS_CLR_DIR="$REPO_DIR/../express-clr"

echo "==> express-clr: dotnet test"
dotnet test "$EXPRESS_CLR_DIR/tests/express.Tests/express.Tests.csproj" -c Release

echo "==> express-clr: dotnet pack"
dotnet pack "$EXPRESS_CLR_DIR/src/express/express.csproj" -c Release

echo "==> express: generate"
cd "$REPO_DIR"
npm run generate:10

echo "==> express: docs check"
npm run docs:check:10

echo "==> express: contract and E2E tests"
npm run test:contracts:10

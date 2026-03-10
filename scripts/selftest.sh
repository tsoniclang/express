#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXPRESS_CLR_DIR="$REPO_DIR/../express-clr"
DOTNET_MAJOR="${1:-10}"

assert_local_dependency_alignment() {
  local dependency_name="$1"
  local dependency_version="$2"
  local sibling_package_json="$REPO_DIR/../${dependency_name#@tsonic/}/versions/$DOTNET_MAJOR/package.json"

  if [ ! -f "$sibling_package_json" ]; then
    return
  fi

  local sibling_version
  sibling_version="$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.version);' "$sibling_package_json")"

  if [ "$dependency_version" != "$sibling_version" ]; then
    echo "Local dependency drift detected for $dependency_name: package.json pins $dependency_version but sibling repo is $sibling_version" >&2
    exit 1
  fi
}

PINNED_JS_VERSION="$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.dependencies["@tsonic/js"]);' "$REPO_DIR/versions/$DOTNET_MAJOR/package.json")"
assert_local_dependency_alignment "@tsonic/js" "$PINNED_JS_VERSION"

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

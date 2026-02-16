#!/bin/bash
# Generate TypeScript declarations for express CLR library.
#
# Usage:
#   ./__build/scripts/generate.sh [dotnetMajor]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TSBINDGEN_DIR="$PROJECT_DIR/../tsbindgen"
EXPRESS_CLR_DIR="$PROJECT_DIR/../express-clr"

DOTNET_MAJOR="${1:-10}"
OUT_DIR="$PROJECT_DIR/versions/$DOTNET_MAJOR"
DOTNET_LIB="$PROJECT_DIR/../dotnet/versions/$DOTNET_MAJOR"
ASPNETCORE_LIB="$PROJECT_DIR/../aspnetcore"

DOTNET_VERSION="${DOTNET_VERSION:-10.0.1}"
DOTNET_HOME="${DOTNET_HOME:-$HOME/.dotnet}"
DOTNET_RUNTIME_PATH="$DOTNET_HOME/shared/Microsoft.NETCore.App/$DOTNET_VERSION"
ASPNETCORE_RUNTIME_PATH="$DOTNET_HOME/shared/Microsoft.AspNetCore.App/$DOTNET_VERSION"

EXPRESS_DLL="$EXPRESS_CLR_DIR/artifacts/bin/express/Release/net${DOTNET_MAJOR}.0/express.dll"

echo "================================================================"
echo "Generating Express CLR TypeScript Declarations"
echo "================================================================"
echo ""
echo "Configuration:"
echo "  express.dll: $EXPRESS_DLL"
echo "  .NET Runtime:  $DOTNET_RUNTIME_PATH"
echo "  ASP.NET Ref:   $ASPNETCORE_RUNTIME_PATH"
echo "  BCL Library:   $DOTNET_LIB"
echo "  ASP.NET Lib:   $ASPNETCORE_LIB"
echo "  tsbindgen:     $TSBINDGEN_DIR"
echo "  Output:        $OUT_DIR"
echo ""

if [ ! -f "$EXPRESS_DLL" ]; then
    echo "ERROR: express.dll not found at $EXPRESS_DLL"
    echo "Build it first: cd ../express-clr && dotnet build src/express/express.csproj -c Release"
    exit 1
fi

if [ ! -d "$DOTNET_RUNTIME_PATH" ]; then
    echo "ERROR: .NET runtime not found at $DOTNET_RUNTIME_PATH"
    echo "Set DOTNET_HOME or DOTNET_VERSION environment variables"
    exit 1
fi

if [ ! -d "$ASPNETCORE_RUNTIME_PATH" ]; then
    echo "ERROR: ASP.NET runtime not found at $ASPNETCORE_RUNTIME_PATH"
    echo "Set DOTNET_HOME or DOTNET_VERSION environment variables"
    exit 1
fi

if [ ! -d "$TSBINDGEN_DIR" ]; then
    echo "ERROR: tsbindgen not found at $TSBINDGEN_DIR"
    echo "Clone it: git clone https://github.com/tsoniclang/tsbindgen ../tsbindgen"
    exit 1
fi

if [ ! -d "$DOTNET_LIB" ]; then
    echo "ERROR: @tsonic/dotnet not found at $DOTNET_LIB"
    echo "Clone it: git clone https://github.com/tsoniclang/dotnet ../dotnet"
    exit 1
fi

if [ ! -d "$ASPNETCORE_LIB" ]; then
    echo "ERROR: @tsonic/aspnetcore not found at $ASPNETCORE_LIB"
    echo "Clone it: git clone https://github.com/tsoniclang/aspnetcore ../aspnetcore"
    exit 1
fi

mkdir -p "$OUT_DIR"

echo "[1/3] Cleaning output directory..."
cd "$OUT_DIR"
find . -maxdepth 1 -type d ! -name '.' -exec rm -rf {} \; 2>/dev/null || true
rm -f *.d.ts *.js 2>/dev/null || true
echo "  Done"

echo "[1.5/3] Rendering README..."
cd "$PROJECT_DIR"
node ./__build/scripts/render-readme.mjs "$DOTNET_MAJOR"
echo "  Done"

echo "[2/3] Building tsbindgen..."
cd "$TSBINDGEN_DIR"
dotnet build src/tsbindgen/tsbindgen.csproj -c Release --verbosity quiet
echo "  Done"

echo "[3/3] Generating TypeScript declarations..."
dotnet run --project src/tsbindgen/tsbindgen.csproj --no-build -c Release -- \
    generate -a "$EXPRESS_DLL" -o "$OUT_DIR" \
    -n "express" \
    --ref-dir "$DOTNET_RUNTIME_PATH" \
    --ref-dir "$ASPNETCORE_RUNTIME_PATH" \
    --lib "$DOTNET_LIB" \
    --lib "$ASPNETCORE_LIB" \
    --namespace-map "express=index"

cp -f "$PROJECT_DIR/README.md" "$OUT_DIR/README.md"
cp -f "$PROJECT_DIR/LICENSE" "$OUT_DIR/LICENSE"
rm -rf "$OUT_DIR/docs" 2>/dev/null || true
cp -R "$PROJECT_DIR/docs" "$OUT_DIR/docs"

echo "Post-processing generated declarations..."
cd "$PROJECT_DIR"
node ./__build/scripts/postprocess-generated.mjs "$DOTNET_MAJOR"

# Keep package output focused on express namespace surface.
find "$OUT_DIR" -mindepth 1 -maxdepth 1 -type d \
  ! -name 'index' \
  ! -name 'docs' \
  -exec rm -rf {} \;
find "$OUT_DIR" -mindepth 1 -maxdepth 1 -type f \
  ! -name 'index.d.ts' \
  ! -name 'index.js' \
  ! -name 'families.json' \
  ! -name 'tsonic.bindings.json' \
  ! -name 'package.json' \
  ! -name 'README.md' \
  ! -name 'LICENSE' \
  -delete

echo ""
echo "================================================================"
echo "Generation Complete"
echo "================================================================"

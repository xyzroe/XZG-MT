#!/bin/bash

# Build script for XZG-MT Go Bridge
# Creates binaries for multiple operating systems and architectures

set -e

VERSION="1.0.0"
BUILD_DIR="dist"
MAIN_FILE="main.go"

# Create build directory
mkdir -p $BUILD_DIR

# Build targets
TARGETS=(
    "linux/amd64"
    "linux/arm64"
    "darwin/amd64"
    "darwin/arm64"
    "windows/amd64"
    # legacy 32-bit Windows (Windows 7 / 32-bit systems)
    "windows/386"
    "windows/arm64"
)

echo "Building XZG-MT Go Bridge v$VERSION"
echo "=================================="

# Build for each target
for target in "${TARGETS[@]}"; do
    IFS='/' read -r os arch <<< "$target"
    
    echo "Building for $os/$arch..."
    
    # Set output filename
    output_name="XZG-MT-${os}-${arch}"
    if [ "$os" = "windows" ]; then
        output_name="${output_name}.exe"
    fi
    
    # Set GOOS and GOARCH
    export GOOS=$os
    export GOARCH=$arch
    
    # Build the binary
    go build -ldflags "-s -w -X main.VERSION=$VERSION" -o "$BUILD_DIR/$output_name" .
    
    # Get file size
    size=$(du -h "$BUILD_DIR/$output_name" | cut -f1)
    echo "  ✓ Built $output_name ($size)"
done

echo ""
echo "Build completed! Binaries are in the $BUILD_DIR directory:"
ls -la $BUILD_DIR/

echo ""
echo "To run locally:"
echo "  go run $MAIN_FILE"
echo ""
echo "To run a specific binary:"
echo "  ./$BUILD_DIR/XZG-MT-linux-amd64"
echo "  ./$BUILD_DIR/XZG-MT-darwin-arm64"
echo "  ./$BUILD_DIR/XZG-MT-windows-amd64.exe"
echo "  ./$BUILD_DIR/XZG-MT-windows-386.exe  # legacy 32-bit Windows build"

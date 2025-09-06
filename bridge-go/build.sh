#!/bin/bash

# Build script for XZG-MT Go Bridge
# Creates binaries for multiple operating systems and architectures

set -e



BUILD_DIR="dist"
MAIN_FILE="main.go"

# Size-reduction defaults. Can be overridden via environment.
# Set USE_UPX=1 to try to compress with upx if it's installed.
USE_UPX=${USE_UPX:-0}

# Switch to the directory of script
cd "$(dirname "$0")"

#VERSION="1.0.0"
#don't use static version
# read from ../web-page/package.json
if [ -f "../web-page/package.json" ]; then
    VERSION=$(jq -r '.version' ../web-page/package.json)
else
    # echo "Warning: ../package.json not found. Using default version."
    VERSION="0.0.0"
fi


# Create build directory
mkdir -p $BUILD_DIR

# Build targets
TARGETS=(
    "linux/amd64"
    "linux/arm64"
    "linux/386"
    "darwin/amd64"
    "darwin/arm64"
    "windows/amd64"
    # legacy 32-bit Windows (Windows 7 / 32-bit systems)
    "windows/386"
    "windows/arm64"
)

# Copy web assets with progress
echo "Copying web assets..."
# Copy web assets without rsync (portable)
SRC="../web-page/dist"
DST="./web"

if [ ! -d "$SRC" ]; then
    echo "Warning: source directory $SRC does not exist. Skipping copy."
else
    mkdir -p "$DST"

    total_files=$(find "$SRC" -type f | wc -l | tr -d ' ')
    total_size=$(du -sh "$SRC" 2>/dev/null | cut -f1 || echo "N/A")
    echo "Found $total_files files (≈ $total_size) to copy."

    if [ "$total_files" -eq 0 ]; then
        echo "No files to copy."
    else
        i=0
        # copy each file preserving directory structure
        while IFS= read -r -d '' file; do
            rel="${file#$SRC/}"
            mkdir -p "$(dirname "$DST/$rel")"
            # try to preserve mode/timestamps; fall back to plain cp if needed
            cp -p -- "$file" "$DST/$rel" 2>/dev/null || cp -- "$file" "$DST/$rel"
            i=$((i+1))
            percent=$((i * 100 / total_files))
            printf "\rCopying files: %d/%d (%d%%)" "$i" "$total_files" "$percent"
        done < <(find "$SRC" -type f -print0)
        echo
    fi

    # Summary
    copied_files=$(find "$DST" -type f | wc -l | tr -d ' ')
    copied_size=$(du -sh "$DST" 2>/dev/null | cut -f1 || echo "N/A")
    echo "Copy complete: $copied_files files (≈ $copied_size) in $DST"
fi


# echo "Building XZG-MT Go Bridge v$VERSION"
# echo "=================================="



# Build for each target
for target in "${TARGETS[@]}"; do
    IFS='/' read -r os arch <<< "$target"
    
    echo "Building for $os/$arch..."
    
    # Set output filename
    output_name="XZG-MT-Go-${os}-${arch}"
    if [ "$os" = "windows" ]; then
        output_name="${output_name}.exe"
    fi
    
    # Set GOOS and GOARCH
    export GOOS=$os
    export GOARCH=$arch

    # Common ldflags to strip debug and symbol tables.
    LDFLAGS="-s -w -X main.VERSION=$VERSION"

    # Additional flags for smaller builds and reproducibility
    # -trimpath removes file system paths from the binary (supported on modern Go versions)
    # Keep flags minimal and portable: avoid -buildvcs (not available in older toolchains)
    # GC/ASM flags to trim paths as well
    GCFLAGS="all=-trimpath=$(pwd)"
    ASMFLAGS="all=-trimpath=$(pwd)"
    
    # Build the binary
    echo "  → go build (GOOS=$GOOS GOARCH=$GOARCH)"
    go build -trimpath -ldflags "$LDFLAGS" -gcflags "$GCFLAGS" -asmflags "$ASMFLAGS" -o "$BUILD_DIR/$output_name" .
    
    # Get file size before optional compression
    size_before=$(du -h "$BUILD_DIR/$output_name" | cut -f1)
    echo "  ✓ Built $output_name (before compression: $size_before)"

    # Optional: compress the executable with upx (if requested and available)
    if [ "$USE_UPX" = "1" ] && command -v upx >/dev/null 2>&1; then
        echo -n "  → compressing with upx... "
        # use maximum compression; skip if upx fails
        if upx --best --lzma -- "$BUILD_DIR/$output_name" >/dev/null 2>&1; then
            size_after=$(du -h "$BUILD_DIR/$output_name" | cut -f1)
            echo "done (after: $size_after)"
        else
            echo "failed (upx returned non-zero)"
        fi
    fi
done

echo ""
echo "Build completed! Binaries are in the $BUILD_DIR directory:"
ls -la $BUILD_DIR/

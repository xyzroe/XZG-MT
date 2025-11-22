# XZG-MT Go Bridge Makefile

#read version from # read from ../web-page/package.json or set 0.0.0 if error
VERSION := $(shell cat ../web-page/package.json | jq -r .version || echo "0.0.0")
BUILD_DIR := dist
MAIN_FILE := main.go

# Default target
.PHONY: all
all: build

# Build all targets
.PHONY: build
build:
	@echo "Building XZG-MT Go Bridge v$(VERSION)"
	@echo "=================================="
	@mkdir -p $(BUILD_DIR)
	@USE_UPX=1 ./build.sh

# Build for current platform only
.PHONY: build-local
build-local:
	@echo "Building for current platform..."
	@mkdir -p $(BUILD_DIR)
	@go build -ldflags "-s -w -X main.VERSION=$(VERSION)" -o $(BUILD_DIR)/XZG-MT-local .
	@echo "✓ Built $(BUILD_DIR)/XZG-MT-local"

# Run locally
.PHONY: run
run:
	@echo "Running XZG-MT Go Bridge locally..."
	@go run -ldflags "-X main.VERSION=$(VERSION)" .

# Clean build artifacts
.PHONY: clean
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@echo "✓ Cleaned"

# Install dependencies
.PHONY: deps
deps:
	@echo "Installing dependencies..."
	@go mod tidy
	@go mod download
	@echo "✓ Dependencies installed"

# Run tests
.PHONY: test
test:
	@echo "Running tests..."
	@go test ./...
	@echo "✓ Tests completed"

# Format code
.PHONY: fmt
fmt:
	@echo "Formatting code..."
	@go fmt ./...
	@echo "✓ Code formatted"

# Lint code
.PHONY: lint
lint:
	@echo "Linting code..."
	@go vet ./...
	@echo "✓ Code linted"

# Show help
.PHONY: help
help:
	@echo "XZG-MT Go Bridge - Available targets:"
	@echo ""
	@echo "  build        - Build binaries for all platforms"
	@echo "  build-local  - Build binary for current platform only"
	@echo "  run          - Run the application locally"
	@echo "  clean        - Clean build artifacts"
	@echo "  deps         - Install dependencies"
	@echo "  test         - Run tests"
	@echo "  fmt          - Format code"
	@echo "  lint         - Lint code"
	@echo "  help         - Show this help"
	@echo ""
	@echo "Examples:"
	@echo "  make run                    # Run locally"
	@echo "  make build-local            # Build for current platform"
	@echo "  make build                  # Build for all platforms"
	@echo "  make clean && make build    # Clean and rebuild"

# Multi-stage Dockerfile for the Go bridge
# - builder: compile a static linux binary
# - runtime: small alpine image with HA-friendly utilities

ARG VERSION=0.0.0
ARG TARGETOS
ARG TARGETARCH
FROM --platform=$BUILDPLATFORM golang:1.20-alpine AS builder

WORKDIR /src

# git may be needed for some modules
RUN apk add --no-cache git

# Download modules first for better caching
COPY bridge-go/go.mod bridge-go/go.sum ./
RUN go mod download

# Copy full source and build
COPY bridge-go .

# Build a static binary for the target platform supplied by buildx.
# When using docker buildx, TARGETOS and TARGETARCH are passed automatically.
RUN CGO_ENABLED=0 \
  GOOS=${TARGETOS:-linux} \
  GOARCH=${TARGETARCH:-amd64} \
  go build -v -ldflags "-s -w -X main.VERSION=${VERSION}" -o /src/xzg-mt-bridge .

FROM alpine:3.18

# Install runtime tools useful for HA addon wrapper and healthchecks
RUN apk add --no-cache jq su-exec netcat-openbsd eudev ca-certificates

# Create non-root user (for standalone mode) and add to dialout for serial access
RUN addgroup -g 1001 -S xzg && \
  adduser -S xzg -u 1001 && \
  addgroup xzg dialout

WORKDIR /app

# Copy the compiled binary from the builder stage
COPY --from=builder /src/xzg-mt-bridge ./xzg-mt-bridge

# Copy HA addon wrapper script (optional; exists only when used as addon)
COPY xzg-multi-tool-addon/run.sh ./run.sh
RUN chmod +x ./run.sh ./xzg-mt-bridge || true

# Add a small entrypoint wrapper to choose HA wrapper vs standalone binary
COPY bridge-go/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh || true

# Default environment
ENV PORT=8765

# Expose default WS port
EXPOSE 8765

# Health check - fast port probe
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD nc -z localhost ${PORT} || exit 1

# Smart entrypoint: use `entrypoint.sh` to choose HA wrapper vs standalone runtime
ENTRYPOINT ["/bin/sh", "-c", "./entrypoint.sh \"$@\"", "--"]

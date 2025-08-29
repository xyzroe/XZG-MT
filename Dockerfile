# Multi-stage: build web UI with Debian builder, then build node_modules for musl and produce tiny Alpine runtime (Node 18)

####################
# 1) Web builder
####################
FROM node:20-bullseye AS web-builder
ARG TARGETOS=linux
ARG TARGETARCH
ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA:-}
# Do not force npm platform/arch here. Forcing these can make npm install native
# binaries (like esbuild) for the wrong architecture which leads to "Exec format error"
# during the web build. If you intentionally cross-build, pass npm_config_platform
# and npm_config_arch via --build-arg or use buildx with --platform so the correct
# binaries are fetched for the target platform.
# ENV npm_config_platform=${TARGETOS} npm_config_arch=${TARGETARCH}

WORKDIR /app

# Install only web deps required for build
# Note: the `--mount=type=cache` syntax requires Docker BuildKit (use
# DOCKER_BUILDKIT=1). This speeds up npm package fetches and avoids
# repeatedly downloading the same packages in CI.
COPY web-page/package*.json ./web-page/
RUN --mount=type=cache,target=/root/.npm \
    npm --prefix ./web-page ci --no-audit --prefer-offline

# Copy web sources and build (lite -> smaller output)
COPY web-page ./web-page
COPY bridge/scripts ./bridge/scripts
# If the local `web-page` contains a host `node_modules`, it can overwrite the
# node_modules we installed earlier (for caching). We avoid copying host
# node_modules via .dockerignore, so do not remove the installed dependencies
# here — the devDependencies (esbuild, realfavicon, etc.) must be present to
# run the build step.
RUN npm --prefix ./web-page run build

####################
# 2) Alpine deps builder (compile native modules against musl)
####################
FROM node:18-alpine AS alpine-deps
WORKDIR /app

# Install build deps required to compile native modules for musl
RUN apk add --no-cache --virtual .build-deps \
      build-base \
      python3 \
      linux-headers \
      git

# Copy bridge package metadata and install production deps (compiled for musl)
COPY bridge/package*.json ./
RUN npm ci --only=production --no-audit --prefer-offline

# keep node_modules in this stage (we'll copy to final runtime)

####################
# 3) Final minimal runtime
####################
FROM node:18-alpine AS runtime

# runtime utilities (keep minimal)
RUN apk add --no-cache \
      jq \
      su-exec \
      netcat-openbsd \
      eudev \
      ca-certificates

# Create non-root user/group (UID/GID 1001 to match HA convention)
RUN addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S -G nodejs -h /nonexistent -s /sbin/nologin nodejs || true

WORKDIR /app

# Copy compiled node_modules from Alpine build stage
COPY --from=alpine-deps /app/node_modules ./node_modules

# Copy built web UI from web-builder stage
COPY --from=web-builder /app/web-page/dist ./web

# Copy bridge runtime files and addon wrapper
COPY bridge/bridge.js ./
COPY bridge/scripts ./bridge/scripts
COPY xzg-multi-tool-addon/run.sh ./
RUN chmod +x ./run.sh

# Environment & port
ENV NODE_ENV=production
ENV PORT=8765

EXPOSE 8765

# Fast healthcheck using netcat
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD nc -z localhost ${PORT} || exit 1

# Entrypoint:
# - HA addon mode: run wrapper (root, full device access)
# - Standalone: drop to nodejs user via su-exec (keeps dialout group access if mounted)
ENTRYPOINT ["/bin/sh", "-c", "if [ -f /data/options.json ]; then exec ./run.sh; else exec su-exec nodejs node /app/bridge.js \"$@\"; fi"]
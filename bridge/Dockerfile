WORKDIR /app

# Copy root package metadata
COPY package*.json ./

# Copy web-page package metadata so we can install its deps (devDeps needed for build)
COPY web-page/package*.json ./web-page/

# Install web-page deps (dev deps required for esbuild/typescript) and bridge production deps
RUN npm --prefix ./web-page ci && \
    npm ci --only=production && npm cache clean --force

# Copy web-page sources and any scripts used during build
COPY web-page ./web-page
COPY scripts ./scripts

# Build web (use build:lite if you want faster build without favicons/inject)
RUN npm --prefix ./web-page run build

# Production stage
FROM node:18-alpine

# Install jq, su-exec, netcat, and udev for Home Assistant addon support
RUN apk add --no-cache jq su-exec netcat-openbsd eudev

# Create non-root user (for non-HA mode) and add to dialout group for serial access
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    addgroup nodejs dialout

# Create app directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy web folder from builder stage so it ends up in the final image
COPY --from=builder /app/web-page/dist ./web

# Copy app source
COPY bridge/package*.json ./
COPY bridge/bridge.js ./

# Copy HA addon wrapper script
COPY xzg-multi-tool-addon/run.sh ./
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production
ENV PORT=8765

# Expose default WS port
EXPOSE 8765

# Health check - fast and reliable port check
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD nc -z localhost ${PORT} || exit 1

# Smart entrypoint: 
# - HA mode: run as root with full device access
# - Standalone: switch to nodejs user but keep dialout group access
ENTRYPOINT ["/bin/sh", "-c", "if [ -f /data/options.json ]; then exec ./run.sh; else exec su-exec nodejs node /app/bridge.js \"$@\"; fi", "--"]

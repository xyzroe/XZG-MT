# Multi-stage build for better optimization
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy fetch script and run it to populate web/ before packaging into image
COPY scripts ./scripts
RUN node scripts/fetch-web.js || true

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
COPY --from=builder /app/web ./web

# Copy app source
COPY package*.json ./
COPY ws-tcp-bridge.js ./

# Copy HA addon wrapper script
COPY ws-tcp-bridge-ha/run.sh ./run.sh
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
ENTRYPOINT ["/bin/sh", "-c", "if [ -f /data/options.json ]; then exec ./run.sh; else exec su-exec nodejs node /app/ws-tcp-bridge.js \"$@\"; fi", "--"]

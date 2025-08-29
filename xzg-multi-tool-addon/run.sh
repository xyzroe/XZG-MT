#!/bin/sh
set -euo pipefail

OPTIONS_FILE="/data/options.json"

PORT=8765
ADVERTISE_HOST=""
DEBUG_MODE="false"
SERIAL_SCAN_INTERVAL=5000

if [ -f "$OPTIONS_FILE" ]; then
    if command -v jq >/dev/null 2>&1; then
        PORT=$(jq -r '.port // 8765' "$OPTIONS_FILE")
        ADVERTISE_HOST=$(jq -r '.advertise_host // ""' "$OPTIONS_FILE")
        DEBUG_MODE=$(jq -r '.debug_mode // false' "$OPTIONS_FILE")
        SERIAL_SCAN_INTERVAL=$(jq -r '.serial_scan_interval // 5000' "$OPTIONS_FILE")
    else
        PORT=$(grep -oP '"port"\s*:\s*\K[0-9]+' "$OPTIONS_FILE" || echo 8765)
        ADVERTISE_HOST=$(grep -oP '"advertise_host"\s*:\s*"\K[^"]+' "$OPTIONS_FILE" || true)
        if grep -q '"debug_mode"\s*:\s*true' "$OPTIONS_FILE"; then DEBUG_MODE=true; fi
        SERIAL_SCAN_INTERVAL=$(grep -oP '"serial_scan_interval"\s*:\s*\K[0-9]+' "$OPTIONS_FILE" || echo 5000)
    fi
fi

export PORT
export SERIAL_SCAN_INTERVAL
if [ -n "$ADVERTISE_HOST" ] && [ "$ADVERTISE_HOST" != "null" ]; then
    export ADVERTISE_HOST
fi
if [ "$DEBUG_MODE" = "true" ]; then
    export DEBUG_MODE=1
fi

echo "Starting bridge on port ${PORT} (ADVERTISE_HOST=${ADVERTISE_HOST:-<auto>}, SERIAL_SCAN_INTERVAL=${SERIAL_SCAN_INTERVAL})"
exec node /app/bridge.js "$PORT" "$SERIAL_SCAN_INTERVAL"

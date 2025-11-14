#!/bin/sh
set -e

# Entrypoint wrapper:
# - If running as HA addon (presence of /data/options.json) -> run wrapper script as root
# - Otherwise run the compiled binary as the non-root user 'xzg' using su-exec when available

if [ -f /data/options.json ]; then
  exec ./run.sh "$@"
else
  if command -v su-exec >/dev/null 2>&1; then
    exec su-exec xzg /app/xzg-mt-bridge "$@"
  else
    exec /app/xzg-mt-bridge "$@"
  fi
fi

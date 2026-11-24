#!/bin/sh
# Make sure the (possibly freshly mounted) data volume is writable by the
# unprivileged "node" user, then run the app as that user.
set -e

mkdir -p "${DATA_DIR:-/app/data}"
chown -R node:node "${DATA_DIR:-/app/data}" 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
fi
exec "$@"

#!/usr/bin/env bash
# Stop the server and tunnel started by start-public.sh.
set -uo pipefail
cd "$(dirname "$0")"

for f in .server.pid .tunnel.pid; do
  if [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null; then
    kill "$(cat "$f")" 2>/dev/null || true
    echo "Stopped $( [ "$f" = .server.pid ] && echo server || echo tunnel ) (pid $(cat "$f"))"
  fi
  rm -f "$f"
done

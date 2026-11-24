#!/usr/bin/env bash
# Start RootQuest and a public Cloudflare quick tunnel in one command.
# Usage: ./start-public.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
export PORT
export NODE_ENV="${NODE_ENV:-production}"
export TRUST_PROXY="${TRUST_PROXY:-1}"
export DATA_DIR="${DATA_DIR:-$PWD/data}"

mkdir -p logs

say() { printf '%s\n' "$*"; }

# ---------------------------------------------------------------- Node.js ---
# Prefer a system Node >= 18. If there is none, install one into the home
# directory (survives reboots, unlike /tmp) and reuse it on later runs.
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; }

if ! node_ok; then
  NODE_DIR="$HOME/.local/rootquest-node"
  NODE_VERSION="v22.14.0"
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    say "Node.js 18+ not found. Installing Node $NODE_VERSION into $NODE_DIR ..."
    case "$(uname -m)" in
      x86_64|amd64) ARCH=x64 ;;
      aarch64|arm64) ARCH=arm64 ;;
      *) say "Unsupported CPU: $(uname -m). Install Node 18+ manually, then rerun."; exit 1 ;;
    esac
    TMP="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$ARCH.tar.xz" -o "$TMP/node.tar.xz"
    mkdir -p "$NODE_DIR"
    tar -xf "$TMP/node.tar.xz" -C "$NODE_DIR" --strip-components=1
    rm -rf "$TMP"
  fi
  export PATH="$NODE_DIR/bin:$PATH"
fi
say "Node $(node -v)"

# ------------------------------------------------------------ dependencies ---
if [ ! -d node_modules ]; then
  say "Installing dependencies (first run only)..."
  npm ci --omit=dev --no-audit --no-fund
fi
# A different Node major version than last time can break the native SQLite
# module; rebuild it quietly if it cannot be loaded.
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  say "Rebuilding the SQLite driver for Node $(node -v) ..."
  npm rebuild better-sqlite3 --no-audit --no-fund >/dev/null 2>&1 || npm ci --omit=dev --no-audit --no-fund
fi

# -------------------------------------------------------------- web server ---
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  say "RootQuest already running on port $PORT."
else
  say "Starting RootQuest on port $PORT ..."
  nohup node server.js >> logs/server.log 2>&1 < /dev/null &
  echo $! > .server.pid
  for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break
    sleep 0.5
  done
  if ! curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    say "Server did not start. Last log lines:"
    tail -20 logs/server.log || true
    exit 1
  fi
fi

# ----------------------------------------------------------- public tunnel ---
find_cloudflared() {
  for c in "$(command -v cloudflared 2>/dev/null || true)" "$HOME/.local/bin/cloudflared" /tmp/opencode/cloudflared; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

if ! CLOUDFLARED="$(find_cloudflared)"; then
  say "cloudflared not found. Downloading it to $HOME/.local/bin ..."
  mkdir -p "$HOME/.local/bin"
  case "$(uname -m)" in
    x86_64|amd64) CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) say "Unsupported CPU: $(uname -m)."; exit 1 ;;
  esac
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o "$HOME/.local/bin/cloudflared"
  chmod +x "$HOME/.local/bin/cloudflared"
  CLOUDFLARED="$HOME/.local/bin/cloudflared"
fi

# Replace a tunnel this script started earlier, so the printed URL is alive.
if [ -f .tunnel.pid ] && kill -0 "$(cat .tunnel.pid)" 2>/dev/null; then
  kill "$(cat .tunnel.pid)" 2>/dev/null || true
  sleep 0.5
fi
: > logs/tunnel.log
say "Opening a public tunnel ..."
nohup "$CLOUDFLARED" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> logs/tunnel.log 2>&1 < /dev/null &
echo $! > .tunnel.pid

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' logs/tunnel.log | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  say "Tunnel did not come up. Last log lines:"
  tail -20 logs/tunnel.log || true
  exit 1
fi

say ""
say "============================================================"
say " RootQuest is live:  $URL"
say " Local address:      http://localhost:$PORT"
say " Logs:               logs/server.log  logs/tunnel.log"
say " Stop everything:    ./stop-public.sh"
say "============================================================"
say ""
say "This URL is temporary: it works while this machine stays awake and"
say "both processes keep running. A new URL is issued next time."

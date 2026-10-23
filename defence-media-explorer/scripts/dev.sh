#!/usr/bin/env bash
# One command for the local demo. Bash 3.2 safe (macOS /bin/bash).
# Starts the API, the ingestion worker, and the frontend. Ctrl+C stops all three.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

missing=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing $1. $2"
    missing=1
  fi
}

need python3 "Install Python 3.11 or newer."
need node "Install Node.js 20 or newer. https://nodejs.org"
need npm "npm is included with Node.js."
need ffmpeg "Install FFmpeg. On macOS: brew install ffmpeg"
need ffprobe "ffprobe ships with FFmpeg. On macOS: brew install ffmpeg"

if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "Python 3.11 or newer is required. This machine has: $(python3 --version 2>/dev/null || echo unknown)"
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  exit 1
fi

# .env is gitignored, so a new machine does not have the file you already saved.
# The user store survives across cloud agents, same place as the tunnel certificate.
ENV_STORE="/cursor/stores/user/bastion.env"
if [ -d /cursor/stores/user ]; then
  if [ -f "$ENV_STORE" ] && [ ! -f .env ]; then
    cp "$ENV_STORE" .env
    chmod 600 .env
    echo "Restored .env from the user store."
  elif [ -f .env ] && [ -f "$ENV_STORE" ] && [ "$ENV_STORE" -nt .env ]; then
    cp "$ENV_STORE" .env
    chmod 600 .env
    echo "Updated .env from the user store."
  elif [ -f .env ] && { [ ! -f "$ENV_STORE" ] || [ .env -nt "$ENV_STORE" ]; }; then
    cp .env "$ENV_STORE"
    chmod 600 "$ENV_STORE" || true
  fi
fi

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set MONGODB_URI, SESSION_SECRET, and VOYAGE_API_KEY."
  echo "Do not commit .env."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Creating .venv"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate

echo "Installing Python dependencies"
python -m pip install -r backend/requirements.txt

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies"
  (cd frontend && npm ci)
fi

echo "Checking Atlas and search indexes"
(cd backend && python -m app.preflight)

export PYTHONUNBUFFERED=1

pids=""
kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  for pid in $pids; do
    kill_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

echo "Starting API on http://127.0.0.1:8000"
(cd backend && exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
pids="$pids $!"

echo "Starting ingestion worker"
(cd backend && exec python -m app.workers) &
pids="$pids $!"

echo "Starting frontend on http://localhost:3000"
(cd frontend && exec npm run dev -- --hostname 127.0.0.1 --port 3000) &
pids="$pids $!"

# Reuse the saved Cloudflare tunnel. Never opens a browser.
cf=""
if command -v cloudflared >/dev/null 2>&1; then
  cf="cloudflared"
elif [ -x "$HOME/.local/bin/cloudflared" ]; then
  cf="$HOME/.local/bin/cloudflared"
fi
token=""
if [ -f .env ]; then
  token="$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi
store="/cursor/stores/user/cloudflared"
if [ -d "$store" ]; then
  mkdir -p "$HOME/.cloudflared"
  cp -n "$store"/* "$HOME/.cloudflared/" 2>/dev/null || true
fi
if [ -z "$token" ] && [ -f "$HOME/.cloudflared/tunnel.token" ]; then
  token="$(tr -d '\n' <"$HOME/.cloudflared/tunnel.token")"
fi
if [ -n "$cf" ] && [ -n "$token" ]; then
  echo "Attaching https://bastion-app.com"
  "$cf" tunnel --no-autoupdate run --token "$token" --url http://127.0.0.1:3000 &
  pids="$pids $!"
elif [ -n "$cf" ] && ls "$HOME/.cloudflared"/*.json >/dev/null 2>&1; then
  echo "Attaching https://bastion-app.com"
  "$cf" tunnel --no-autoupdate run --url http://127.0.0.1:3000 bastion &
  pids="$pids $!"
fi

echo "Bastion: http://localhost:3000"
echo "Logs from the API, worker, and frontend follow. Ctrl+C stops all three."
echo "A worker on this Mac means ingestion runs only while this command is running."

while true; do
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "A process exited (pid $pid). Stopping the others."
      cleanup
      exit 1
    fi
  done
  sleep 1
done

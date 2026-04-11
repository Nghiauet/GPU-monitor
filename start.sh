#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-prod}"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID 2>/dev/null || true
  [[ -n "${CLIENT_PID:-}" ]] && kill $CLIENT_PID 2>/dev/null || true
  wait 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

# Install dependencies if needed
if [[ ! -d "$ROOT_DIR/server/node_modules" ]]; then
  echo "Installing server dependencies..."
  (cd "$ROOT_DIR/server" && npm install)
fi

if [[ ! -d "$ROOT_DIR/client/node_modules" ]]; then
  echo "Installing client dependencies..."
  (cd "$ROOT_DIR/client" && npm install)
fi

if [[ "$MODE" == "dev" ]]; then
  # Development mode: backend with auto-restart + Vite dev server with hot reload
  echo "Starting in DEVELOPMENT mode..."
  echo "  Backend:  http://localhost:3001 (auto-restart on changes)"
  echo "  Frontend: http://localhost:3000 (hot reload, proxies API to :3001)"
  echo ""

  (cd "$ROOT_DIR/server" && node --watch src/index.js) &
  SERVER_PID=$!

  (cd "$ROOT_DIR/client" && npx vite --host 0.0.0.0) &
  CLIENT_PID=$!

  echo "Press Ctrl+C to stop both servers."
  wait
else
  # Production mode: build frontend, serve everything from Express
  echo "Starting in PRODUCTION mode..."

  # Build frontend if dist/ is missing or source is newer
  if [[ ! -d "$ROOT_DIR/client/dist" ]] || [[ "$ROOT_DIR/client/src" -nt "$ROOT_DIR/client/dist" ]]; then
    echo "Building frontend..."
    (cd "$ROOT_DIR/client" && npm run build)
  fi

  echo "  Server: http://localhost:${PORT:-3001}"
  echo ""

  cd "$ROOT_DIR/server"
  node src/index.js &
  SERVER_PID=$!

  echo "Press Ctrl+C to stop."
  wait
fi

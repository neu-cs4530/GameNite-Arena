#!/usr/bin/env bash
#
# start_up.sh — one-command local startup for graders.
#
# Brings the whole project up from a fresh checkout: installs Node + Python
# dependencies, starts Redis and the Python inference service, then runs the
# client and server together. Each step echoes where it is in the process.
#
#   Usage:  ./start_up.sh          (run from the repo root)
#   Stop:   Ctrl-C                 (stops the app AND the inference service)
#
# Assumes you have Node 22+, npm, and Python 3.11+ installed. Everything else
# (npm packages, Redis, the Python venv + torch, etc.) is installed for you.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

REDIS_PORT=6379
INFERENCE_PORT=8001
CLIENT_PORT=4530
SERVER_PORT=8000

step() { echo ""; echo "▶ $1"; echo "------------------------------------------------------------"; }
info() { echo "   $1"; }
die()  { echo ""; echo "✗ $1" >&2; exit 1; }

OS="$(uname -s)"
INFERENCE_PID=""

cleanup() {
  echo ""
  step "Shutting down"
  if [ -n "$INFERENCE_PID" ] && kill -0 "$INFERENCE_PID" 2>/dev/null; then
    info "Stopping inference service (pid $INFERENCE_PID)..."
    kill "$INFERENCE_PID" 2>/dev/null || true
  fi
  info "Redis is left running. Stop it with: redis-cli -p $REDIS_PORT shutdown nosave"
}
trap cleanup EXIT

echo "============================================================"
echo "  GameNite Arena — local startup"
echo "============================================================"

# 1. Prerequisites -----------------------------------------------------------
step "[1/6] Checking prerequisites"
command -v node    >/dev/null || die "Node.js 22+ is required — install from https://nodejs.org and re-run."
command -v npm     >/dev/null || die "npm is required (ships with Node.js)."
command -v python3 >/dev/null || die "Python 3.11+ is required — install Python and re-run."
command -v curl    >/dev/null || die "curl is required."
info "node $(node -v)  |  npm $(npm -v)  |  $(python3 --version)"

# 2. Node dependencies -------------------------------------------------------
step "[2/6] Installing Node dependencies (npm install)"
npm install || die "npm install failed."
info "Installed client, server, and shared workspaces."

# 3. Redis -------------------------------------------------------------------
step "[3/6] Starting Redis on port $REDIS_PORT"
if redis-cli -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then
  info "Redis is already running."
else
  if ! command -v redis-server >/dev/null; then
    info "Redis not found — installing..."
    case "$OS" in
      Darwin)
        command -v brew >/dev/null || die "Homebrew is needed to auto-install Redis on macOS (https://brew.sh)."
        brew install redis || die "brew install redis failed." ;;
      Linux)
        (sudo apt-get update -y && sudo apt-get install -y redis-server) \
          || die "Could not auto-install Redis — install redis-server with your package manager and re-run." ;;
      *)
        die "Unsupported OS for auto-install — install Redis manually and re-run." ;;
    esac
  fi
  info "Launching redis-server (daemonized)..."
  redis-server --port "$REDIS_PORT" --daemonize yes || die "Failed to start redis-server."
  for _ in $(seq 1 20); do
    if redis-cli -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then break; fi
    sleep 0.5
  done
  redis-cli -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG || die "Redis did not come up on port $REDIS_PORT."
  info "Redis is up."
fi

# 4. Python inference: venv + dependencies -----------------------------------
step "[4/6] Setting up the Python inference service (first run installs torch — this can take a few minutes)"
if [ ! -d ai/.venv ]; then
  info "Creating virtualenv at ai/.venv..."
  python3 -m venv ai/.venv || die "Could not create the Python virtualenv."
fi
info "Installing Python dependencies (torch, stable-baselines3, fastapi, uvicorn, ...)..."
ai/.venv/bin/pip install -q --upgrade pip || die "pip upgrade failed."
ai/.venv/bin/pip install -q -r ai/requirements.txt || die "Installing Python dependencies failed."
info "Inference dependencies installed."

# 5. Start the inference service ---------------------------------------------
step "[5/6] Starting the inference service on port $INFERENCE_PORT"
( cd ai/inference-service && exec ../.venv/bin/uvicorn inference_service:app --host 0.0.0.0 --port "$INFERENCE_PORT" ) \
  >/tmp/gamenite-inference.log 2>&1 &
INFERENCE_PID=$!
info "Inference starting (pid $INFERENCE_PID; logs: /tmp/gamenite-inference.log)..."
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$INFERENCE_PORT/inference/health" >/dev/null 2>&1; then break; fi
  kill -0 "$INFERENCE_PID" 2>/dev/null || die "Inference service exited early — see /tmp/gamenite-inference.log"
  sleep 0.5
done
if curl -sf "http://localhost:$INFERENCE_PORT/inference/health" >/dev/null 2>&1; then
  info "Inference is healthy."
else
  info "Inference health check timed out — continuing anyway (AI features may warm up slowly)."
fi

# 6. Start the app (client + server) -----------------------------------------
step "[6/6] Starting the app — client on :$CLIENT_PORT, server on :$SERVER_PORT"
info "Open  ->  http://localhost:$CLIENT_PORT"
info "Press Ctrl-C to stop the app and the inference service."
echo ""
# The server requires REDIS_URL; the client/server talk to local inference.
export REDIS_URL="redis://localhost:$REDIS_PORT"
export INFERENCE_SERVICE_URL="http://localhost:$INFERENCE_PORT"
npm run dev

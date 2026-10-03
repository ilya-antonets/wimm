#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Stopping services..."
    [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null || true
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

[[ -d "$ROOT/backend/.venv" ]]         || { echo "Backend venv missing. Run: cd backend && uv sync"; exit 1; }
[[ -d "$ROOT/frontend/node_modules" ]] || { echo "Frontend deps missing. Run: cd frontend && npm install"; exit 1; }

(
    cd "$ROOT/backend"
    source .venv/bin/activate
    uvicorn app.main:app --reload
) &
BACKEND_PID=$!

(
    cd "$ROOT/frontend"
    npm run dev
) &
FRONTEND_PID=$!

echo "Backend  → http://localhost:8000"
echo "Frontend → http://localhost:5173"
echo "Press Ctrl+C to stop both."

wait

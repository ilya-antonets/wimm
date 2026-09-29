#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

component="${1:-all}"

run_backend() {
    if [ -d backend ]; then
        echo "=== Backend checks ==="
        ruff check backend/
        ruff format --check backend/
        mypy --config-file backend/pyproject.toml backend/app/
        pytest backend/ --tb=short
    fi
}

run_frontend() {
    if [ -d frontend ]; then
        echo "=== Frontend checks ==="
        (cd frontend && npm run lint && npm run typecheck && npm run format:check && npm test -- --run)
    fi
}

case "$component" in
    backend)  run_backend ;;
    frontend) run_frontend ;;
    all)      run_backend; run_frontend ;;
    *)        echo "Usage: $0 [backend|frontend|all]" >&2; exit 1 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

if [ -d backend ]; then
    echo "=== Backend checks ==="
    ruff check backend/
    ruff format --check backend/
    mypy backend/app/
    pytest backend/ --tb=short
fi

if [ -d frontend ]; then
    echo "=== Frontend checks ==="
    cd frontend
    npm run lint
    npm run typecheck
    npm run format:check
    npm test -- --run
fi

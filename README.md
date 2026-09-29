# WIMM — Where Is My Money

A personal finance tracker that ingests bank CSV statements, manages a category tree, and renders an interactive Sankey diagram of income and expenses.

**Stack:** Python 3.12 + FastAPI / SQLite + SQLAlchemy + Alembic / scikit-learn TF-IDF  
**Frontend:** React 18 + TypeScript + Vite / ECharts / react-arborist / TanStack Table+Query / Zustand

---

## Developer Quickstart

```bash
# Backend (once backend/ exists)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install            # installs deps and generates package-lock.json
npm run dev            # Vite dev server on http://localhost:5173

# Run all checks locally
bash scripts/check.sh
```

The frontend dev server proxies API calls to the backend at `http://localhost:8000/api`
by default. Override with `VITE_API_BASE_URL` (e.g. in `frontend/.env.local`). Log
verbosity is controlled by `VITE_LOG_LEVEL` (`debug`/`info`/`warn`/`error`).

### Frontend checks

```bash
cd frontend
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # ESLint (flat config)
npm run format:check   # Prettier
npm test -- --run      # Vitest
```

---

## Branch Protection

After pushing this branch and merging to `main`, enable branch protection on `main` requiring the following status checks (names are case-sensitive and must match exactly):

- `CI / backend`
- `CI / frontend`

Both checks are skipped until `backend/requirements.txt` and `frontend/package.json` exist, so they appear green from Stage 0 onward and become actively enforced starting at Stage 1 (backend) and Stage 8 (frontend).

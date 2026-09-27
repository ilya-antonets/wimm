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

# Frontend (once frontend/ exists)
cd frontend
npm install
npm run dev

# Run all checks locally
bash scripts/check.sh
```

---

## Branch Protection

After pushing this branch and merging to `main`, enable branch protection on `main` requiring the following status checks (names are case-sensitive and must match exactly):

- `CI / backend`
- `CI / frontend`

Both checks are skipped until `backend/requirements.txt` and `frontend/package.json` exist, so they appear green from Stage 0 onward and become actively enforced starting at Stage 1 (backend) and Stage 8 (frontend).

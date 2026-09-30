# WIMM — High-Level Architecture Design

_Version 1.0 · Based on [requirements_v1.md](requirements_v1.md)_

---

## 1. Overview

**WIMM** (Where is my money) is a single-user personal finance tracker. It ingests bank statements, lets the user build a custom expense category tree, and renders the result as an interactive Sankey diagram showing income versus categorized expenses for any chosen period.

The application is a **local client-server SPA**: a Python REST API backend and a React single-page application, both running on localhost. There is no cloud component, no authentication layer, and no multi-user model. All data — including ML computation — stays on the user's machine.

```
┌──────────────────────┐       HTTP/JSON        ┌──────────────────────────────┐
│   Browser            │ ─────────────────────► │   Python Backend             │
│   React 18 + TS      │                         │   FastAPI + SQLAlchemy       │
│   localhost:5173     │ ◄───────────────────── │   localhost:8000             │
└──────────────────────┘                         └──────────────┬───────────────┘
                                                                │
                                                         SQLite file
                                                         /data/wimm.db
```

---

## 2. Technology Stack

| Layer | Choice | Key rationale |
|---|---|---|
| **Architecture** | Local client-server SPA | ML and CSV parsing need a real backend; no cloud or auth needed |
| **Database** | SQLite via SQLAlchemy | Zero-config embedded DB; single-file backup; supports recursive CTEs for tree queries |
| **Migrations** | Alembic | Auto-generated and custom data migrations; batch mode covers all SQLite ALTER TABLE limitations |
| **Backend runtime** | Python 3.12 + FastAPI | pandas for CSV; scikit-learn for TF-IDF; Pydantic validation; OpenAPI docs auto-generated |
| **ASGI server** | Uvicorn | Lightweight; pairs directly with FastAPI |
| **Frontend framework** | React 18 + TypeScript + Vite | Largest component ecosystem; best tree editor library available |
| **Sankey diagram** | Apache ECharts (`echarts-for-react`) | Native Sankey type; accepts `nodes + links` array; no layout code required |
| **Category tree UI** | react-arborist | Production-ready drag-and-drop tree with rename/add/remove |
| **Data table** | TanStack Table v8 | Headless, feature-complete |
| **Server state** | TanStack Query (React Query) | Caches backend responses; auto-invalidates on mutation |
| **Client state** | Zustand | Minimal store for UI state (selected period, active category) |
| **Packaging** | Docker Compose | `docker compose up -d` → `http://localhost:5173`; no host runtime dependencies |

### 2.1 Backend alternatives considered

| Criterion | Python + FastAPI | Spring Boot (Java) | Go + Gin |
|---|---|---|---|
| CSV parsing | Trivial (pandas) | Manual setup required | Barebones stdlib |
| TF-IDF / ML | Trivial (scikit-learn) | Moderate (Smile / Lucene) | Poor — no mature library |
| REST API complexity | Low | Medium-High (layered structure) | Low |
| Type safety | Good (mypy) | Excellent (compile-time) | Excellent (compile-time) |
| Docker image size | ~200 MB | ~400–600 MB | ~20 MB (single binary) |
| Dev iteration speed | Fast (reload on save) | Moderate (JVM cold-start) | Fast |

**Decision: Python + FastAPI.** The ML suggestion feature is the deciding factor. scikit-learn makes TF-IDF a 20-line implementation; reproducing it in Java or Go requires a less mature library or a custom build. pandas eliminates nearly all CSV edge-case handling. Docker image weight is irrelevant for a local tool.

### 2.2 Frontend alternatives considered

| Criterion | React 18 + TypeScript | Vue 3 + TypeScript | SvelteKit |
|---|---|---|---|
| Category tree editor | `react-arborist` (production-ready) | No equivalent — custom component needed | No equivalent — custom component needed |
| Sankey (ECharts) | `echarts-for-react` (mature) | `vue-echarts` (mature) | `svelte-echarts` (less mature) |
| SPA setup | Default Vite config | Default Vite config | Needs `adapter-static` |
| Ecosystem depth | Largest | Large | Smaller |
| Bundle size | Medium (~150 KB core) | Small (~35 KB core) | Smallest (compiled) |

**Decision: React 18 + TypeScript.** `react-arborist` eliminates a significant custom build for the category tree editor. Bundle size is irrelevant for a local tool loaded once.

**Why ECharts over D3 or Plotly for Sankey**: D3 requires building the Sankey layout algorithm from scratch. Plotly carries a heavier bundle and its Sankey is less configurable. ECharts ships a complete Sankey implementation, accepts a simple `nodes + links` array, and renders the deficit/proficit balancing node as just another node — no layout work required.

---

## 3. Frontend Architecture (MVVM-like)

React does not enforce a pattern, but the project follows a layered **MVVM-like** structure:

| Layer | Location | Responsibility |
|---|---|---|
| **Model / Data** | `src/services/` | Typed API client functions (`transactionService.ts`, `categoryService.ts`, …) |
| **ViewModel / Controller** | `src/hooks/` | Custom hooks (`useTransactions`, `useSankeyData`, `useCategoryTree`) — orchestrate fetching and mutation, expose clean state to views |
| **View** | `src/components/` | Presentational React components — receive props, call hook-provided callbacks; no direct API calls |
| **Server state cache** | TanStack Query | Caches backend responses; invalidated on mutation |
| **Client state** | Zustand store | Selected date range, active category node, UI modals |

Components in `src/components/` contain no business logic and make no direct API calls.

---

## 4. Data Model

Five tables. The category tree uses an **adjacency list** — the simplest representation for a mutable tree in a relational DB. SQLite's `WITH RECURSIVE` CTEs handle subtree traversal and aggregation efficiently.

### 4.1 Table definitions

**banks**

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL | Display name (e.g. "My Bank") |
| column_map | JSON | Maps semantic fields to CSV column indices/names: `date`, `amount`, `description`, and optionally `transaction_id` (bank-provided unique ID) |
| date_format | TEXT | strftime format string for the date column (e.g. `%d.%m.%Y`) |
| skip_header_rows | INTEGER | Rows before the CSV header row to skip (bank metadata lines); default 0 |
| skip_footer_rows | INTEGER | Rows after the last data row to skip (balance summary lines); default 0 |
| encoding | TEXT | CSV file encoding; default `utf-8` |

**import_batches** _(audit log only — does not control deduplication)_

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| bank_id | FK → banks | |
| imported_at | TIMESTAMP | |
| filename | TEXT | Original filename uploaded by user |

**transactions**

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| bank_id | FK → banks | |
| import_batch_id | FK → import_batches NULLABLE | First (and only) batch that introduced this row — `INSERT OR IGNORE` never updates existing rows |
| date | DATE | |
| amount | NUMERIC(12,4) | Signed: positive = income, negative = expense |
| description | TEXT | Raw payee/description from bank statement |
| type | TEXT | `income` or `expense` — derived from amount sign (or bank-specific logic) at import time |
| **dedup_key** | TEXT UNIQUE NOT NULL | Deduplication anchor — see §4.2 |

**categories**

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | id=1 is reserved for "Uncategorized" (system category, cannot be deleted or renamed) |
| name | TEXT NOT NULL | |
| parent_id | FK → categories NULLABLE | NULL = root node |
| sort_order | INTEGER | Preserves user-defined sibling ordering |

**mappings**

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| transaction_id | INTEGER UNIQUE FK → transactions | Enforces one-category-per-expense constraint |
| category_id | FK → categories | |

### 4.2 Deduplication

Idempotent import is enforced at the transaction level via `dedup_key`, not at the batch level.

- If the bank exports a unique transaction ID (configured in `banks.column_map`):
  `dedup_key = "{bank_id}:{external_transaction_id}"`
- Otherwise:
  `dedup_key = hex(SHA-256(f"{bank_id}|{date}|{Decimal(amount).quantize(Decimal('0.01'))}|{description}".encode()))`

On import, each row is inserted with `INSERT OR IGNORE`. Overlapping date ranges and re-uploaded files are handled silently. The user receives a summary: _"12 new transactions imported, 8 already existed."_

### 4.3 Category tree traversal (subtree aggregation)

```sql
WITH RECURSIVE subtree(id) AS (
  SELECT id FROM categories WHERE id = :root_id
  UNION ALL
  SELECT c.id FROM categories c
  JOIN subtree s ON c.parent_id = s.id
)
SELECT SUM(ABS(t.amount))
FROM transactions t
JOIN mappings m ON m.transaction_id = t.id
WHERE m.category_id IN (SELECT id FROM subtree)
  AND t.date BETWEEN :start AND :end;
```

### 4.4 Category deletion policy

When a user deletes a category node that has existing mappings, those transactions are **reassigned to the system "Uncategorized" category** (id=1). This category always exists, cannot be deleted, and cannot be renamed. The Sankey diagram remains consistent — no orphaned mappings, no null category nodes.

---

## 5. Schema Migration Strategy

Alembic manages all schema changes. The backend runs `alembic upgrade head` automatically on startup.

**Auto-generated migrations** (structural DDL changes):
```bash
alembic revision --autogenerate -m "add column X"
```
Alembic compares the live schema against SQLAlchemy model definitions and emits the appropriate `op.add_column()`, `op.drop_column()`, etc.

**Custom migration scripts** (data migrations, backfills, seeding):
```bash
alembic revision -m "backfill dedup_key"
```
Produces an empty script the developer fills in manually. DDL and DML can be mixed:

```python
def upgrade():
    op.add_column("transactions", sa.Column("dedup_key", sa.Text()))
    conn = op.get_bind()
    # Backfill using the real SHA-256 formula so re-importing the same CSV
    # after migration does not create duplicate rows.
    # SQLite has no built-in SHA-256, so we compute in Python and batch-update.
    import hashlib
    from decimal import Decimal
    rows = conn.execute(sa.text(
        "SELECT id, bank_id, date, amount, description FROM transactions WHERE dedup_key IS NULL"
    )).fetchall()
    for row in rows:
        amount_norm = str(Decimal(str(row.amount)).quantize(Decimal("0.01")))
        key = hashlib.sha256(
            f"{row.bank_id}|{row.date}|{amount_norm}|{row.description}".encode()
        ).hexdigest()
        conn.execute(
            sa.text("UPDATE transactions SET dedup_key = :key WHERE id = :id"),
            {"key": key, "id": row.id},
        )
    op.alter_column("transactions", "dedup_key", nullable=False)
    op.create_unique_constraint("uq_transactions_dedup_key", "transactions", ["dedup_key"])
```

**SQLite ALTER TABLE limitation**: SQLite natively supports only `ADD COLUMN` and `DROP COLUMN`. Type changes, renames, and constraint modifications require Alembic's **batch mode**, which creates a new temp table, copies data, and swaps:

```python
with op.batch_alter_table("transactions") as batch_op:
    batch_op.alter_column("amount", type_=sa.Numeric(precision=12, scale=4))
```

Required configuration in `alembic/env.py`:
```python
context.configure(..., render_as_batch=True)
```

---

## 6. ML Suggestion Engine

### Privacy constraint

**All ML computation runs locally inside the Python backend using scikit-learn. No financial data is sent to any external service or cloud API.** This constraint applies to any future upgrade of the suggestion engine (e.g., a local sentence-transformer model must also run locally).

### Two-phase pipeline

No offline training step is required. The engine works on data already in the DB.

**Phase 1 — Exact payee match (fast path)**

Normalize each description: uppercase, strip digits and punctuation, collapse whitespace. Check the result against a cache built from all existing manual mappings. If a normalized form matches, return that category at confidence 1.0.

**Phase 2 — TF-IDF cosine similarity (fallback)**

Fit a `TfidfVectorizer` (scikit-learn) over all manually-mapped transaction descriptions. For a new transaction, transform its description and compute cosine similarity against the training matrix. Return the category of the nearest neighbor. If the top-3 results agree on the same category, report higher confidence.

The vectorizer is fit lazily on the first suggestion request and invalidated whenever new manual mappings are added. On a personal dataset of a few thousand transactions, fitting takes under one second.

### API surface

```
POST /api/suggestions   { transaction_ids: [...] }
  → [{ transaction_id, suggested_category_id, confidence }]

POST /api/mappings      { transaction_id, category_id }   (user accepts or overrides)
  → 201 Created
```

---

## 7. Sankey Diagram

The Sankey diagram is assembled server-side and delivered to the frontend as a ready-to-render `{ nodes, links }` payload for ECharts.

**Node structure for a given period:**

```
[income_tx_1] ──────────────────────────────► [Expenses]
[income_tx_2] ──────────────────────────────► [Expenses]
                                               [Expenses] ──► [Food]
                                               [Expenses] ──► [Transport]
                                               [Expenses] ──► [Uncategorized]
                               [Proficit] ──► (if income > expenses, right/expense column)
                               or
[Deficit] ──►  [Expenses] ...  (if expenses > income, left/income column)
```

- One node per income transaction (as specified in requirements; grouping deferred to a future version)
- One separator node representing total expenses
- One node per leaf and branch category that has at least one mapped transaction in the period
- A **Proficit** node on the expense side / right column (if total income exceeds total expenses) or a **Deficit** node on the income side / left column (if expenses exceed income) to balance the diagram. No depth hints are needed: ECharts places Proficit naturally at depth 2 (sink of EXPENSES) and Deficit at depth 0 (synthetic source feeding EXPENSES). Depth overrides were removed because they created backward edges that ECharts Sankey does not reliably render.

---

## 8. Deployment

### Production (Docker Compose)

```yaml
services:
  backend:
    build: ./backend
    volumes:
      - wimm_data:/data        # SQLite at /data/wimm.db
    ports: ["8000:8000"]

  frontend:
    build: ./frontend           # Vite build → nginx static
    ports: ["5173:80"]
    depends_on: [backend]

volumes:
  wimm_data:
```

Start: `docker compose up -d`  
Access: `http://localhost:5173`  
Update: `git pull && docker compose up --build`  
Backup: `docker run --rm -v wimm_data:/data alpine tar czf - /data > wimm_backup.tar.gz`

### Developer mode (no Docker)

```bash
# Backend
cd backend && uvicorn app.main:app --reload   # auto-reloads on save

# Frontend
cd frontend && npm run dev                     # Vite HMR on localhost:5173
```

Requires Python 3.12 and Node 24 installed locally.

---

## 9. Deferred Decisions

1. **Bank CSV configuration UI**: How a user configures a new bank's CSV format (column mapping, date format, skip rows, encoding) is a separate development task. The approach — frontend wizard, CLI script, or other — may change in future versions.

---

## 10. Key Implementation Files

Once implementation begins, these are the critical files to create or modify:

| File | Purpose |
|---|---|
| `backend/app/models.py` | SQLAlchemy ORM definitions for all five tables, including the self-referential `categories` relationship and the `dedup_key` unique constraint |
| `backend/alembic/versions/001_initial_schema.py` | Initial migration: creates all tables and seeds the "Uncategorized" category (id=1) |
| `backend/app/services/csv_importer.py` | pandas-based CSV parser; applies `skip_header_rows`/`skip_footer_rows`/`encoding` from `banks.column_map`; computes `dedup_key`; uses `INSERT OR IGNORE` |
| `backend/app/services/ml_suggester.py` | TF-IDF vectorizer, payee fingerprint cache, cosine similarity pipeline |
| `backend/app/routers/sankey.py` | Assembles `{ nodes, links }` payload via recursive CTE aggregation for a given date range |
| `frontend/src/components/SankeyDiagram.tsx` | ECharts Sankey wrapper; renders the payload from `/api/sankey` |
| `frontend/src/components/CategoryTree.tsx` | react-arborist tree editor for create/rename/remove category operations |
| `frontend/src/hooks/useSankeyData.ts` | TanStack Query hook that fetches and caches the Sankey payload |
| `docker-compose.yml` | Service definitions, volume mounts, port bindings |
| `alembic/env.py` | Must include `render_as_batch=True` for SQLite batch migration support |

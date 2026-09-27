# WIMM — Implementation Plan v1

## Context

WIMM ("Where is my money") is a personal finance tracker that ingests bank CSV statements, manages a category tree, and renders an interactive Sankey diagram. The repository contains only documentation (`docs/`) and a stub README — zero implementation code exists. All design decisions are recorded in `docs/design_v1.md` (3742 lines), `docs/architecture_v1.md`, and `docs/requirements_v1.md`. This plan breaks the full build into 13 stages, each merging as its own PR. A GitHub Actions CI workflow is established in Stage 0 and gates every subsequent PR.

**Stack:** Python 3.12 + FastAPI / SQLite + SQLAlchemy + Alembic / scikit-learn TF-IDF  
**Frontend:** React 18 + TypeScript + Vite / ECharts / react-arborist / TanStack Table+Query / Zustand  
**CI:** ruff lint+format, mypy (strict), pytest; eslint, tsc --noEmit, prettier, vitest

---

## Dependency Graph

```
Stage 0 (CI + .gitignore)
    │
    ├── Stage 1 (BE: models, migrations, main.py skeleton)
    │       ├── Stage 2 (banks CRUD)
    │       │       └── Stage 3 (CSV import) → Stage 6 (mappings + ML) → Stage 7 (Sankey)
    │       └── Stage 4 (categories) ──────────────┘
    │               └── Stage 5 (transactions)
    │
    └── Stage 8 (FE: scaffold, types, store, layout)
            └── Stage 9 (settings: banks + import UI)
                    └── Stage 10 (transactions UI)
                            └── Stage 11 (dashboard + Sankey UI)
                                    └── Stage 12 (Docker Compose)
```

Backend stages 1–7 are strictly sequential (each adds routers/services to `main.py`). Frontend stages 8–11 are strictly sequential. Stage 12 depends on both tracks being complete.

---

## CI Activation Timeline

| Stages | Backend CI job | Frontend CI job |
|--------|----------------|-----------------|
| 0      | skipped (no requirements.txt) | skipped (no package.json) |
| 1–7    | active (grows each stage)     | skipped |
| 8–12   | active                        | active (activates at Stage 8) |

---

## Coverage Targets

| Area | Target |
|------|--------|
| Backend services | ≥ 90% |
| Backend routers | ≥ 85% |
| Frontend hooks | ≥ 85% |
| Frontend components | ≥ 75% |

---

## Stage 0 — Repo Housekeeping + CI Pipeline
**PR:** `chore: add GitHub Actions CI workflow and repository scaffolding`

### Files created
- `.gitignore` — `*.db`, `/data/`, `/logs/`, `__pycache__/`, `.venv/`, `frontend/node_modules/`, `frontend/dist/`, `.mypy_cache/`, `.ruff_cache/`, `htmlcov/`
- `.github/workflows/ci.yml` — two jobs gated on `hashFiles`; both skipped in this stage so PR is green
- `scripts/check.sh` — runs all checks with `if [ -d backend ]` / `if [ -d frontend ]` guards
- `README.md` — project description, developer quickstart stub, note to enable branch protection for `ci / backend` and `ci / frontend`

### CI job structure
```yaml
backend:
  if: ${{ hashFiles('backend/requirements.txt') != '' }}
  steps: [checkout, setup-python 3.12, pip install requirements + requirements-dev,
          ruff check, ruff format --check, mypy, pytest --tb=short]
frontend:
  if: ${{ hashFiles('frontend/package.json') != '' }}
  steps: [checkout, setup-node 20, npm ci, npm run lint,
          npm run typecheck, npm run format:check, npm test -- --run]
```

### Tests
None — the CI workflow is the deliverable. Enable branch protection on `main` requiring both status checks.

---

## Stage 1 — Backend Foundation
**PR:** `feat(backend): project scaffold, ORM models, Alembic migration, config, and app skeleton`

### Files created
- `backend/requirements.txt` — fastapi 0.115, uvicorn[standard] 0.30.6, sqlalchemy 2.0.35, alembic 1.13.3, pydantic 2.9.2, pydantic-settings 2.5.2, pandas 2.2.3, scikit-learn 1.5.2, python-multipart 0.0.12, aiofiles 24.1.0
- `backend/requirements-dev.txt` — mypy, ruff, pytest, pytest-cov, httpx, pytest-mock, factory-boy, types-aiofiles, pandas-stubs
- `backend/pyproject.toml` — `[tool.mypy]` strict + pydantic plugin + `ignore_missing_imports` for sklearn/alembic; `[tool.ruff]` selecting E/W/F/I/UP/B/C4/SIM, line-length 100; `[tool.pytest.ini_options]` `addopts = "--cov=app --cov-fail-under=85"`
- `backend/alembic.ini`, `backend/alembic/env.py` (`render_as_batch=True`), `backend/alembic/script.py.mako`
- `backend/alembic/versions/001_initial_schema.py` — creates all 5 tables with FK constraints, indices, `CheckConstraint("type IN ('income','expense')")`; seeds `(id=1, name='Uncategorized', parent_id=NULL, sort_order=0)`
- `backend/app/config.py` — `Settings(BaseSettings)` with all env vars: `DATABASE_URL`, `SQL_ECHO`, `LOG_LEVEL`, `LOG_FORMAT`, `LOG_DIR`, `ML_*` params
- `backend/app/database.py` — engine, `set_sqlite_pragma` event listener (PRAGMA foreign_keys=ON), `SessionLocal`, `Base`, `get_db`
- `backend/app/models.py` — all 5 ORM models with `Mapped[T]` annotations: `Bank` (JSON column_map), `ImportBatch` (FK→banks RESTRICT), `Transaction` (FK→banks RESTRICT, FK→import_batches SET NULL, Numeric(12,4), dedup_key UNIQUE, composite indexes, `mapping` relationship cascade=all+delete-orphan), `Category` (self-referential FK RESTRICT), `Mapping` (transaction_id UNIQUE FK CASCADE, category_id FK RESTRICT)
- `backend/app/exceptions.py` — `WIMMException`, `NotFoundError` (404), `ConflictError` (409), `ForbiddenError` (403), `ValidationError` (400), `register_exception_handlers`
- `backend/app/logging_config.py` — `configure_logging()`, `JsonFormatter`, `_STD_LOG_FIELDS`, `AccessLogMiddleware`
- `backend/app/main.py` — lifespan (configure_logging → `alembic upgrade head`), CORS, `AccessLogMiddleware`, `register_exception_handlers`, `GET /api/health → {"status": "ok"}`, empty router list
- `backend/tests/conftest.py` — `db_engine` (in-memory SQLite, `Base.metadata.create_all` + seeds Uncategorized id=1), `db` fixture, `client` fixture (overrides `get_db`, overrides lifespan to skip Alembic subprocess)
- `backend/tests/factories.py` — `BankFactory`, `TransactionFactory`, `CategoryFactory` using factory-boy

### Tests (`backend/tests/test_health.py`)
- `test_health_returns_200` — `GET /api/health` → 200, `{"status": "ok"}`
- `test_db_fixture_seeds_uncategorized` — `db.execute("SELECT COUNT(*) FROM categories WHERE id=1")` = 1

---

## Stage 2 — Banks CRUD
**PR:** `feat(backend): banks CRUD endpoints with conflict and constraint handling`

### Files created
- `backend/app/schemas/banks.py` — `ColumnMap`, `BankCreate`, `BankUpdate`, `BankRead`
- `backend/app/routers/banks.py` — `GET /api/banks`, `POST` (201/409), `GET /{id}` (200/404), `PUT /{id}` (200/404/409), `DELETE /{id}` (204/404/409 — checks both transactions and import_batches)
- `backend/tests/routers/test_banks.py`

### Modified
- `backend/app/main.py` — register `banks.router`

### Tests (8 cases)
- `test_list_banks_empty` — 200 `[]`
- `test_create_bank` — 201, row in DB
- `test_create_bank_missing_column_map` — 422
- `test_get_bank_by_id` — 200 correct shape
- `test_get_bank_not_found` — 404
- `test_update_bank` — 200, DB updated
- `test_delete_bank_with_transactions` — 409
- `test_delete_empty_bank` — 204

---

## Stage 3 — CSV Import
**PR:** `feat(backend): CSV import service with dedup, pandas parsing, and import endpoint`

MLSuggester introduced as a **stub** (`invalidate()` works; `suggest()` returns `[]` until Stage 6).

### Files created
- `backend/app/schemas/imports.py` — `FailedRow`, `ImportResult`
- `backend/app/services/csv_importer.py` — `import_csv(db, bank, file_content, filename) -> ImportResult`: decode bytes → `pandas.read_csv` (skiprows/skipfooter) → rename via column_map → per-row parse (date, amount, type, dedup_key) → create `ImportBatch` → bulk `INSERT OR IGNORE` → commit. `_compute_dedup_key`: uses `bank_id:external_id` if `column_map.transaction_id` set, else `hex(SHA-256(bank_id|date|amount_2dp|description))`
- `backend/app/services/ml_suggester.py` — `MLSuggester` with `threading.Lock`, `invalidate()`, stub `suggest()`, `get_suggester()` singleton with double-checked locking
- `backend/app/routers/imports.py` — `POST /api/import` (multipart: `bank_id` int + `file` UploadFile, validates `.csv`, calls `import_csv`, calls `get_suggester().invalidate()`, returns 201/200/400)
- `backend/tests/test_csv_importer.py`, `backend/tests/routers/test_imports.py`

### Modified
- `backend/app/main.py` — register `imports.router`, attach `get_suggester()` to `app.state`

### Tests
`test_csv_importer.py` (9 cases): basic import, dedup by hash, dedup by external ID, skip rows, income/expense sign detection, latin-1 encoding, invalid date format, missing required column  
`test_imports.py` (4 cases): valid upload (201), duplicate upload (200), wrong bank ID (404), malformed CSV (400)

---

## Stage 4 — Categories CRUD
**PR:** `feat(backend): category tree CRUD with recursive CTE delete, cycle prevention, and protected root`

### Files created
- `backend/app/schemas/categories.py` — `CategoryCreate`, `CategoryUpdate` (rename+sort_order only, no parent_id), `CategoryRead`, `CategoryMoveRequest`
- `backend/app/services/category_service.py` — `get_all_categories`, `create_category`, `rename_category`, `move_category`, `delete_category`, `_get_subtree_ids` (recursive CTE returning IDs depth-DESC), `_assert_no_cycle`. `delete_category` sequence: (1) CTE subtree, (2) `UPDATE mappings SET category_id=1`, (3) DELETE deepest-first, (4) commit, (5) `get_suggester().invalidate()`
- `backend/app/routers/categories.py` — `GET` (200), `POST` (201/400/409), `PUT /{id}` (200/403/404/409), `PATCH /{id}/move` (200/400/403/404), `DELETE /{id}` (204/403/404)
- `backend/tests/test_category_service.py`, `backend/tests/routers/test_categories.py`

### Modified
- `backend/app/main.py` — register `categories.router`

### Tests
`test_category_service.py` (7 cases): tree ordering, delete leaf with mappings, delete parent reassigns all descendants, cannot delete/rename Uncategorized (id=1), move updates parent_id, subtree CTE returns depth-DESC  
`test_categories.py` (8 cases): get list, create, rename, rename Uncategorized rejected (403), delete reassigns mappings, delete Uncategorized rejected (403), move, move-creates-cycle rejected (400)

---

## Stage 5 — Transactions API
**PR:** `feat(backend): transactions list/filter/delete endpoint with full pagination and query param support`

### Files created
- `backend/app/schemas/transactions.py` — `MappingInfo`, `TransactionRead` (includes `bank_name`, embedded `mapping: MappingInfo | None`), `TransactionPage`
- `backend/app/routers/transactions.py` — `GET /api/transactions` (query params: `date_from`, `date_to`, `type`, `bank_id`, `category_id`, `unmapped`, `search`, `ids` comma-separated, `page` ge=1, `page_size` ge=1 le=200); `DELETE /api/transactions/{id}` (204/404, cascade deletes mapping)
- `backend/tests/routers/test_transactions.py`

### Modified
- `backend/app/main.py` — register `transactions.router`

### Tests (11 cases)
- Empty list, filter by type, filter by date range, unmapped filter, search substring, `ids=` bulk fetch, pagination slice, `page_size` upper bound (422), delete transaction, delete cascades mapping, delete not found (404)

---

## Stage 6 — Mappings + ML Suggestion Engine
**PR:** `feat(backend): category mappings upsert/delete and TF-IDF ML suggestion engine`

The `MLSuggester` stub from Stage 3 gains its full implementation.

### Files created
- `backend/app/schemas/mappings.py` — `MappingCreate`, `MappingRead`
- `backend/app/schemas/suggestions.py` — `SuggestionRequest` (`transaction_ids: list[int]` 1–200), `SuggestionResult` (transaction_id, suggested_category_id, suggested_category_name, confidence 0–1, method: "exact"|"tfidf")
- `backend/app/routers/mappings.py` — `POST /api/mappings` (upsert: check existing → INSERT → catch IntegrityError; 400 income, 404 missing); `DELETE /api/mappings/{transaction_id}` (204/404); both `invalidate()`
- `backend/app/routers/suggestions.py` — `POST /api/suggestions` (200/400)
- `backend/tests/test_ml_suggester.py`, `backend/tests/routers/test_mappings.py`, `backend/tests/routers/test_suggestions.py`

### Modified
- `backend/app/services/ml_suggester.py` — implement `_rebuild_cache()` (double-checked locking, `TfidfVectorizer(analyzer='word', ngram_range=(min,max), max_features=5000, sublinear_tf=True)`, exact cache dict) and `suggest()` (Phase 1: normalize `upper().re.sub(r'[^A-Z ]','').strip()` → exact lookup → confidence 1.0; Phase 2: cosine similarity → top-k, all-agree boost `mean(scores)*1.2` capped 1.0)
- `backend/app/main.py` — register `mappings.router`, `suggestions.router`

### Tests
`test_ml_suggester.py` (6 cases): exact match confidence=1.0, TF-IDF nearest neighbor, empty corpus graceful, cache invalidated after `invalidate()`, top-3 agreement boost, below-min-confidence still returned  
`test_mappings.py` (7 cases): create (201), reassign (200), no duplicate row, income rejected (400), missing transaction (404), missing category (404), delete (204)  
`test_suggestions.py` (2 cases): results returned with training data, income transaction rejected (400)

---

## Stage 7 — Sankey Service + API
**PR:** `feat(backend): 10-step Sankey assembly algorithm with ML-implied categorization and endpoint`

### Files created
- `backend/app/schemas/sankey.py` — `SankeyNode` (id, name, depth optional, `transaction_ids: list[int] | None` — only expense category nodes), `SankeyLink` (source, target, value always positive), `SankeyPayload`
- `backend/app/services/sankey_service.py` — constants: `EXPENSES_NODE_ID = "__expenses__"`, `PROFICIT_NODE_ID = "__proficit__"`, `DEFICIT_NODE_ID = "__deficit__"`; `build_sankey(db, date_from, date_to, suggester) -> SankeyPayload` (10-step algorithm per `docs/design_v1.md` Section 12); helpers `_income_nodes_and_links`, `_expense_nodes_and_links`, `_balance_node_and_link`; synthetic `cat_{id}_direct` child node for branch nodes with direct transactions (ECharts flow balance requirement)
- `backend/app/routers/sankey.py` — `GET /api/sankey?date_from=&date_to=` (200/400 date inversion/422 missing)
- `backend/tests/test_sankey_service.py`, `backend/tests/routers/test_sankey.py`

### Modified
- `backend/app/main.py` — register `sankey.router`

### Tests
`test_sankey_service.py` (11 cases): income nodes one-per-transaction, expense nodes per category, Proficit when income > expenses, Deficit when expenses > income, balanced has no extra node, empty period, unmapped expense falls back to ML, unmapped with no ML data → Uncategorized, ML returns deleted category → Uncategorized safety net, mixed mapped+unmapped totals, synthetic child node for branch with direct transactions  
`test_sankey.py` (4 cases): valid period, missing start param (422), start after end (400), empty period (200)

---

## Stage 8 — Frontend Foundation
**PR:** `feat(frontend): Vite scaffold, TypeScript types, API client, Zustand store, layout shell, test infrastructure`

CI frontend job activates for the first time.

### Files created
- `frontend/package.json` — react 18, react-router-dom, axios, echarts, echarts-for-react, react-arborist, @tanstack/react-table, @tanstack/react-query, zustand, react-hot-toast; dev: typescript, vite, vitest, jsdom, @testing-library/react+user-event+jest-dom, msw, eslint 9 flat config, prettier
- `frontend/tsconfig.json` — strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, skipLibCheck: false
- `frontend/vite.config.ts` — vitest: jsdom, setupFiles, globals, coverage v8 with `thresholds: { lines: 75, functions: 75 }`
- `frontend/.prettierrc` — printWidth: 100, double quotes, trailingComma: "es5"
- `frontend/eslint.config.js` — flat config with typescript-eslint, react, react-hooks, import plugins
- `frontend/src/types/` — all TypeScript interfaces matching backend Pydantic schemas
- `frontend/src/services/api.ts` — Axios instance with `baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api"`, response error interceptor
- `frontend/src/utils/logger.ts` — level-controlled console wrapper (`VITE_LOG_LEVEL`, default "debug" dev / "warn" prod)
- `frontend/src/store/useAppStore.ts` — Zustand: `dateRange {from, to}` (initial: first day of current month to today), `activeCategoryId: number | null`, `sankeyPanel {open, nodeId, nodeName, transactionIds[]}`, `importModalOpen: boolean`, `bankConfigModalState {open, bankId: number | null}` + all setters
- `frontend/src/main.tsx`, `App.tsx` — routes: `/`→redirect, `/dashboard`, `/transactions`, `/settings`, `*`→redirect; ErrorBoundary wrapping Routes
- `frontend/src/components/layout/` — AppShell (NavBar + ImportModal always mounted + Toaster), NavBar (nav links + Import CSV button)
- `frontend/src/components/shared/` — LoadingSpinner, ConfirmDialog, ErrorBoundary
- `frontend/src/pages/` — placeholder stubs for DashboardPage, TransactionsPage, SettingsPage
- `frontend/src/__tests__/setup.ts`, `mocks/handlers.ts`, `mocks/server.ts`, `hooks/testUtils.tsx` — MSW infrastructure, `renderHookWithQuery` utility

### Tests (`useAppStore.test.ts` — 5 cases)
Initial date range is current month, setDateRange updates store, openSankeyPanel sets open+data, closeSankeyPanel resets, importModalOpen toggle

---

## Stage 9 — Settings Page (Banks + Import UI)
**PR:** `feat(frontend): BankConfigModal, ImportModal, SettingsPage with bank/import hooks`

### Files created
- `frontend/src/services/bankService.ts`, `importService.ts`
- `frontend/src/hooks/useBanks.ts` — query `["banks"]`; mutations createBank, updateBank, deleteBank (deleteBank also invalidates `["transactions"]`)
- `frontend/src/hooks/useImport.ts` — mutation `importCsv`; on success invalidates `["transactions"]` + `["sankey"]`
- `frontend/src/components/banks/BankConfigModal.tsx` — create/edit mode; form: name, date_format, encoding, skip rows, column_map (4 fields); Delete with ConfirmDialog; 409 → error toast
- `frontend/src/components/import/ImportModal.tsx` — bank `<select>`, file input `accept=".csv"`, inline result summary + collapsible `failed_rows`, error → toast stays open
- `frontend/src/pages/SettingsPage.tsx` — bank list with edit buttons, Add Bank, Import CSV trigger

### Tests
`useBanks.test.ts` (3): loads list, createBank updates cache, deleteBank invalidates `["transactions"]`  
`useImport.test.ts` (2): returns ImportResult, invalidates `["transactions"]` + `["sankey"]`  
`ImportModal.test.tsx` (4): file input accept=".csv", banks in selector, submit disabled without file/bank, success shows summary

---

## Stage 10 — Transactions Page (Category Tree + Transaction Table)
**PR:** `feat(frontend): CategoryTree, CategoryPanel, TransactionTable, TransactionsPage with full hooks`

### Files created
- `frontend/src/services/categoryService.ts`, `transactionService.ts`, `mappingService.ts`, `suggestionService.ts`
- `frontend/src/hooks/useCategoryTree.ts` — query `["categories"]`; mutations createCategory, renameCategory, moveCategory, deleteCategory (deleteCategory also invalidates `["transactions"]` + `["sankey"]`)
- `frontend/src/hooks/useTransactions.ts` — query `["transactions", filters]`; deleteTransaction invalidates `["transactions"]` + `["sankey"]`
- `frontend/src/hooks/useMappings.ts` — createOrUpdateMapping, deleteMapping; both invalidate `["transactions"]` + `["sankey"]` + `["suggestions"]`
- `frontend/src/hooks/useSuggestions.ts` — `useQuery` (not mutation), key `["suggestions", sortedTransactionIds]`, `enabled: transactionIds.length > 0`, returns `Map<number, SuggestionResult>`
- `frontend/src/components/categories/CategoryTree.tsx` — react-arborist; inline rename on double-click; context menu (Add child, Rename, Delete — disabled for id=1); `onMove` → `moveCategory`; flat list sorted by sort_order → tree transform
- `frontend/src/components/categories/CategoryPanel.tsx` — sidebar, "New root category" button, reads/writes `store.activeCategoryId`
- `frontend/src/components/transactions/TransactionTable.tsx` — TanStack Table v8; columns: date, description, amount (signed+currency), type badge, bank name, category dropdown (expense only), suggestion badge (unmapped: name + confidence% + Accept); pagination 25/50/100; filter bar (date range from store, type toggle, bank select, search, "Unmapped only"); "Clear mapping" per expense row
- `frontend/src/components/shared/DateRangePicker.tsx` — date inputs, quick-select: This Month, Last Month, This Year, Last 3 Months; validates start ≤ end
- `frontend/src/pages/TransactionsPage.tsx` — CategoryPanel (left ~280px) + TransactionTable (main)

### Tests
`useCategoryTree.test.ts` (3), `useMappings.test.ts` (2), `useSuggestions.test.ts` (2)  
`CategoryTree.test.tsx` (4): renders nodes, Add child callback, rename on double-click, id=1 has no delete action  
`TransactionTable.test.tsx` (4): renders rows, suggestion badge for unmapped, selecting category calls assign, pagination fires correct offset

---

## Stage 11 — Dashboard + Sankey UI
**PR:** `feat(frontend): SankeyDiagram, SankeyNodePanel, DashboardPage with drill-down interaction`

### Files created
- `frontend/src/services/sankeyService.ts`
- `frontend/src/hooks/useSankeyData.ts` — query `["sankey", dateFrom, dateTo]`; `staleTime: 30_000`; `enabled: !!dateFrom && !!dateTo`
- `frontend/src/components/sankey/SankeyDiagram.tsx` — `ReactECharts`; option: `type: "sankey"`, `layout: "none"`, `emphasis: {focus: "adjacency"}`; nodes use `id` as ECharts `name`, `label.formatter` for display name; node click → maps ECharts name back to `SankeyNode.id` → if `transaction_ids` present → `store.openSankeyPanel`; income/separator nodes ignored on click
- `frontend/src/components/sankey/SankeyNodePanel.tsx` — slide-in panel; compact transaction list via `useTransactions({ids})`; per-row category dropdown; on reassign calls `createOrUpdateMapping` then invalidates `["sankey"]` and closes
- `frontend/src/pages/DashboardPage.tsx` — DateRangePicker + SankeyDiagram + SankeyNodePanel (visibility from store)

### Tests
`useSankeyData.test.ts` (4): fetches with date params, refetches on range change, disabled when dates missing, staleTime 30s  
`SankeyDiagram.test.tsx` (3): renders container, loading spinner, empty state when nodes=[]

---

## Stage 12 — Docker Compose + Production Packaging
**PR:** `chore: add Docker Compose, Dockerfiles, nginx proxy, and CI docker-build job`

### Files created
- `backend/Dockerfile` — `FROM python:3.12-slim`; installs deps; creates `/data`; CMD uvicorn
- `frontend/Dockerfile` — stage 1: `node:20-alpine` + `npm ci` + `npm run build`; stage 2: `nginx:1.27-alpine` + copy dist
- `frontend/nginx.conf` — `try_files $uri $uri/ /index.html`; `location /api/` → proxy to `wimm-backend:8000/api/`; static assets 1y cache+immutable
- `docker-compose.yml` — backend (volume `wimm_data:/data`, port 8000, healthcheck `GET /api/health`); frontend (build-arg `VITE_API_BASE_URL=/api`, port 5173:80, `depends_on: backend: condition: service_healthy`); named volume `wimm_data`
- `backend/.dockerignore`, `frontend/.dockerignore`

### Modified
- `.github/workflows/ci.yml` — add `docker-build` job: `docker build ./backend --target production` + `docker build ./frontend`
- `README.md` — Docker Compose quickstart, dev-mode instructions, backup command, environment variable contract table

### Tests
CI `docker-build` job: both `docker build` commands succeed. Manual smoke: `docker compose up -d && curl http://localhost:8000/api/health`.

---

## End-to-End Verification

After Stage 12:
1. `docker compose up -d`
2. `curl http://localhost:8000/api/health` → `{"status": "ok"}`
3. Open `http://localhost:5173` — app loads, NavBar shows Dashboard / Transactions / Settings
4. Settings: create a bank, upload a CSV → import summary shown with new/duplicate counts
5. Transactions: category tree visible (react-arborist), transactions listed with mapping dropdowns, suggestion badges on unmapped expense rows
6. Dashboard: date picker, Sankey diagram renders with income/expense/balance nodes, clicking an expense category node opens drill-down panel showing individual transactions

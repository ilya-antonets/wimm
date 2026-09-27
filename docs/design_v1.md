# WIMM — Detailed Design Document
  
  _Version 1.0 — Implementation Blueprint_
  
  ---
  
  ## Table of Contents
  
  1. Backend Project Structure
  2. API Endpoints (complete REST contract)
  3. Service Layer Interfaces
  4. SQLAlchemy Model Details
  5. Frontend Project Structure
  6. Page Layout and Routing
  7. Component Specifications
  8. Custom Hooks Specification
  9. Zustand Store Shape
  10. Error Handling Strategy
  11. CSV Import Flow (sequence)
  12. Sankey Assembly Algorithm
  13. Docker and Configuration
  14. Unit and Integration Testing Strategy
  15. Code Quality: Linting, Type Checking, and Repository Hygiene
  16. Logging
  
  ---
  
  ## 1. Backend Project Structure
  
  ```
  backend/
  ├── Dockerfile
  ├── requirements.txt
  ├── alembic.ini
  ├── alembic/
  │   ├── env.py                        # render_as_batch=True, imports Base.metadata
  │   ├── script.py.mako
  │   └── versions/
  │       └── 001_initial_schema.py     # Creates all 5 tables; seeds Uncategorized (id=1)
  └── app/
      ├── __init__.py
      ├── main.py                        # FastAPI app factory, lifespan, router registration
      ├── database.py                    # Engine, SessionLocal, get_db dependency
      ├── models.py                      # All SQLAlchemy ORM models
      ├── config.py                      # Pydantic BaseSettings (reads env vars)
      ├── exceptions.py                  # Custom exception classes + handlers
      ├── logging_config.py              # dictConfig setup; call once at startup
      ├── routers/
      │   ├── __init__.py
      │   ├── banks.py                   # CRUD for bank configs
      │   ├── imports.py                 # CSV upload endpoint
      │   ├── transactions.py            # List / filter transactions
      │   ├── categories.py              # CRUD + tree endpoints
      │   ├── mappings.py                # Create / update category mappings
      │   ├── suggestions.py             # ML suggestion endpoint
      │   └── sankey.py                  # Sankey payload assembly
      ├── schemas/
      │   ├── __init__.py
      │   ├── banks.py
      │   ├── imports.py
      │   ├── transactions.py
      │   ├── categories.py
      │   ├── mappings.py
      │   ├── suggestions.py
      │   └── sankey.py
      └── services/
          ├── __init__.py
          ├── csv_importer.py
          ├── ml_suggester.py
          ├── category_service.py
          └── sankey_service.py
  ```
  
  **`app/main.py` responsibilities:**
  
  ```python
  from contextlib import asynccontextmanager
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware
  from app.database import engine
  from app import models
  from app.exceptions import register_exception_handlers
  from app.routers import banks, imports, transactions, categories, mappings, suggestions, sankey
  
  @asynccontextmanager
  async def lifespan(app: FastAPI):
      # Run Alembic migrations on startup
      import asyncio, sys
      proc = await asyncio.create_subprocess_exec(
          sys.executable, "-m", "alembic", "upgrade", "head",
          stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
      )
      stdout, stderr = await proc.communicate()
      if proc.returncode != 0:
          output = (stdout.decode() + "\n" + stderr.decode()).strip()
          raise RuntimeError(f"Alembic migration failed:\n{output}")
      yield
  
  app = FastAPI(title="WIMM API", version="1.0.0", lifespan=lifespan)
  
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:5173"],
      allow_methods=["*"],
      allow_headers=["*"],
  )
  
  register_exception_handlers(app)
  
  for router in [banks, imports, transactions, categories, mappings, suggestions, sankey]:
      app.include_router(router.router, prefix="/api")
  ```
  
  **`app/database.py`:**
  
  ```python
  from sqlalchemy import create_engine, event
  from sqlalchemy.orm import sessionmaker, DeclarativeBase
  from app.config import settings
  
  engine = create_engine(
      settings.database_url,
      connect_args={"check_same_thread": False},  # SQLite only
      echo=settings.sql_echo,
  )
  
  @event.listens_for(engine, "connect")
  def set_sqlite_pragma(dbapi_connection, connection_record):
      cursor = dbapi_connection.cursor()
      cursor.execute("PRAGMA foreign_keys=ON")
      cursor.close()
  
  SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
  
  class Base(DeclarativeBase):
      pass
  
  def get_db():
      db = SessionLocal()
      try:
          yield db
      except Exception:
          db.rollback()
          raise
      finally:
          db.close()
  ```
  
  **`app/config.py`:**
  
  ```python
  from pydantic_settings import BaseSettings, SettingsConfigDict
  
  class Settings(BaseSettings):
      database_url: str = "sqlite:////data/wimm.db"
      sql_echo: bool = False
  
      # Logging
      log_level: str = "INFO"     # DEBUG | INFO | WARNING | ERROR
      log_format: str = "text"    # "text" for dev, "json" for production
      log_dir: str = "/logs/backend"  # absolute path; written by RotatingFileHandler
  
      # ML suggestion engine parameters
      ml_min_confidence: float = 0.3
      # Minimum manual mappings required before the TF-IDF phase activates.
      # With fewer samples the model is too noisy to be useful.
      ml_min_training_samples: int = 5
      # TF-IDF ngram range: (1,1) = unigrams only; (1,2) = unigrams + bigrams (default).
      # Bigrams capture "NETFLIX SUBSCRIPTION" as a unit rather than two separate tokens.
      ml_ngram_min: int = 1
      ml_ngram_max: int = 2
      # Maximum vocabulary size; caps memory usage on large datasets.
      ml_max_features: int = 5000
      # Number of nearest neighbors to check for category consensus in Phase 2.
      ml_top_k: int = 3
  
      model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
  
  settings = Settings()
  ```
  
  ---
  
  ## 2. API Endpoints — Complete REST Contract
  
  All endpoints are prefixed `/api`. Responses use `application/json` unless noted. All timestamps are ISO-8601 UTC strings.
  
  ---
  
  ### 2.1 Banks
  
  #### `GET /api/banks`
  
  Returns all configured bank profiles.
  
  - **Response 200:** `list[BankRead]`
  
  ```python
  # schemas/banks.py
  
  class ColumnMap(BaseModel):
      date: str | int     # CSV column name or 0-based integer index
      amount: str | int
      description: str | int
      transaction_id: str | int | None = None  # bank-provided external ID column
  
  class BankCreate(BaseModel):
      name: str = Field(..., min_length=1, max_length=120)
      column_map: ColumnMap
      date_format: str = Field(..., min_length=1, max_length=40,
                               description="strftime format, e.g. '%d.%m.%Y'")
      skip_header_rows: int = Field(0, ge=0)
      skip_footer_rows: int = Field(0, ge=0)
      encoding: str = Field("utf-8", min_length=1, max_length=30)
  
  class BankUpdate(BaseModel):
      name: str | None = Field(None, min_length=1, max_length=120)
      column_map: ColumnMap | None = None
      date_format: str | None = None
      skip_header_rows: int | None = Field(None, ge=0)
      skip_footer_rows: int | None = Field(None, ge=0)
      encoding: str | None = None
  
  class BankRead(BankCreate):
      id: int
      model_config = ConfigDict(from_attributes=True)
  ```
  
  #### `POST /api/banks`
  
  - **Request body:** `BankCreate`
  - **Response 201:** `BankRead`
  - **Error 409:** Bank name already exists.
  
  #### `GET /api/banks/{bank_id}`
  
  - **Path:** `bank_id: int`
  - **Response 200:** `BankRead`
  - **Error 404:** Bank not found.
  
  #### `PUT /api/banks/{bank_id}`
  
  - **Request body:** `BankUpdate`
  - **Response 200:** `BankRead`
  - **Error 404:** Bank not found.
  - **Error 409:** New name conflicts with an existing bank.
  
  #### `DELETE /api/banks/{bank_id}`
  
  - **Response 204:** No content.
  - **Error 404:** Bank not found.
  - **Error 409:** Bank has existing transactions or import batches. Deletion is blocked; transactions must be deleted first or bank must be anonymized. The service must check both `transactions` and `import_batches` tables (both carry `ondelete=RESTRICT` FKs) and return 409 if either is non-empty.
  
  ---
  
  ### 2.2 Import
  
  #### `POST /api/import`
  
  Multipart form upload. Accepts a single CSV file plus a `bank_id` form field.
  
  - **Form fields:**
    - `bank_id: int` (required)
    - `file: UploadFile` — CSV file (content-type checked; reject if not `text/csv` or `.csv` extension)
  - **Response 200:** `ImportResult`
  
  ```python
  # schemas/imports.py
  
  class ImportResult(BaseModel):
      import_batch_id: int
      total_rows_parsed: int
      new_transactions: int
      duplicate_transactions: int
      failed_rows: list[FailedRow]
  
  class FailedRow(BaseModel):
      row_number: int
      raw_data: str
      error: str
  ```
  
  - **Error 400:** `bank_id` not found, file missing, file not parseable with the bank's config (e.g., wrong encoding, missing columns), or zero data rows after skip.
  - **Error 422:** Form validation failure (missing `bank_id`).
  - **Side effects:** Creates one `import_batches` row; inserts transactions with `INSERT OR IGNORE`; invalidates the ML vectorizer cache so the next Sankey build or `POST /api/suggestions` call re-fits the model with the newly imported transactions (O(1) synchronous call — no ML inference during import).
  
  ---
  
  ### 2.3 Transactions
  
  #### `GET /api/transactions`
  
  Returns a paginated, filterable list of transactions.
  
  - **Query params:**
  
  | Param | Type | Default | Description |
  |---|---|---|---|
  | `date_from` | `date` (YYYY-MM-DD) | none | Inclusive lower bound |
  | `date_to` | `date` (YYYY-MM-DD) | none | Inclusive upper bound |
  | `type` | `"income" \| "expense"` | both | Filter by transaction type |
  | `bank_id` | `int` | all | Filter by bank |
  | `category_id` | `int` | all | Filter by mapped category (exact node only) |
  | `unmapped` | `bool` | false | If true, return only unmapped expenses |
  | `search` | `str` | none | Case-insensitive substring on `description` |
  | `ids` | `str` | none | Comma-separated list of transaction IDs; when present, returns exactly those transactions (ignores other filters except `page`/`page_size`). Used by `SankeyNodePanel` to load the drill-down expense list. |
  | `page` | `int` | 1 | 1-indexed |
  | `page_size` | `int` | 50 | Min 1, max 200. FastAPI router must declare `ge=1, le=200` to prevent ZeroDivisionError in `pages = ceil(total / page_size)`. |
  
  - **Response 200:** `TransactionPage`
  
  ```python
  # schemas/transactions.py
  
  class MappingInfo(BaseModel):
      category_id: int
      category_name: str
  
  class TransactionRead(BaseModel):
      id: int
      bank_id: int
      bank_name: str
      import_batch_id: int | None
      date: date
      amount: Decimal
      description: str
      type: Literal["income", "expense"]
      mapping: MappingInfo | None
      model_config = ConfigDict(from_attributes=True)
  
  class TransactionPage(BaseModel):
      items: list[TransactionRead]
      total: int
      page: int
      page_size: int
      pages: int
  ```
  
  #### `DELETE /api/transactions/{transaction_id}`
  
  - **Response 204:** No content. Cascade deletes the associated mapping (if any).
  - **Error 404:** Transaction not found.
  
  ---
  
  ### 2.4 Categories
  
  #### `GET /api/categories`
  
  Returns the entire category tree as a flat list. The client builds the tree from `parent_id` relationships.
  
  - **Response 200:** `list[CategoryRead]`
  
  ```python
  # schemas/categories.py
  
  class CategoryCreate(BaseModel):
      name: str = Field(..., min_length=1, max_length=120)
      parent_id: int | None = None
      sort_order: int = 0
  
  class CategoryUpdate(BaseModel):
      name: str | None = Field(None, min_length=1, max_length=120)
      sort_order: int | None = None
      # parent_id is intentionally absent — reparenting uses PATCH /move.
      # Including it here and silently ignoring it would mislead API consumers.
  
  class CategoryRead(BaseModel):
      id: int
      name: str
      parent_id: int | None
      sort_order: int
      model_config = ConfigDict(from_attributes=True)
  ```
  
  **Note:** `CategoryUpdate` does not include `parent_id`. To reparent a category (including moving to root), use `PATCH /api/categories/{id}/move`.
  
  #### `POST /api/categories`
  
  - **Request body:** `CategoryCreate`
  - **Response 201:** `CategoryRead`
  - **Error 400:** `parent_id` does not exist.
  - **Error 409:** Sibling name conflict under the same parent.
  
  #### `PUT /api/categories/{category_id}`
  
  Rename or update sort order. Cannot change parent via this endpoint.
  
  - **Request body:** `CategoryUpdate` — updates `name` and/or `sort_order`. Use `PATCH /move` to reparent.
  - **Response 200:** `CategoryRead`
  - **Error 404:** Category not found.
  - **Error 403:** Attempt to rename `id=1` ("Uncategorized") is rejected.
  - **Error 409:** New name conflicts with a sibling.
  
  #### `PATCH /api/categories/{category_id}/move`
  
  Moves a node to a new parent (drag-and-drop reparenting).
  
  - **Request body:**
  
  ```python
  class CategoryMoveRequest(BaseModel):
      new_parent_id: int | None = None   # None = promote to root
      sort_order: int = 0
  ```
  
  - **Response 200:** `CategoryRead`
  - **Error 400:** Would create a cycle (new parent is a descendant of the node being moved).
  - **Error 403:** Cannot move `id=1`.
  - **Error 404:** Category or new parent not found.
  
  #### `DELETE /api/categories/{category_id}`
  
  - **Response 204:** No content.
  - **Error 403:** Cannot delete `id=1`.
  - **Error 404:** Category not found.
  - **Side effects — ordered, executed in a single DB transaction:**
  
    1. **Find the full subtree.** Collect `category_id` plus all its descendants via recursive CTE (any depth). A leaf node has no descendants.
    2. **Reassign mappings.** `UPDATE mappings SET category_id = 1 WHERE category_id IN <subtree_ids>`. Transactions are **not deleted** — they remain in the DB and appear under "Uncategorized" in the Sankey diagram after deletion.
    3. **Delete category rows.** Issue individual `DELETE FROM categories WHERE id = ?` statements, iterating `subtree_ids` sorted by depth descending (deepest nodes first). A single `WHERE id IN (...)` is insufficient because SQLite processes rows in rowid order, which is typically parent-before-child; the `RESTRICT` FK on `parent_id` would raise `SQLITE_CONSTRAINT` before all children are removed.
  
  **Why `RESTRICT` and not `CASCADE` on the FK?**
  The explicit reassign-then-delete sequence in the service layer is intentional. `ondelete=CASCADE` on `mappings.category_id` would silently delete all mappings when a category is removed, causing transactions to become completely unmapped (invisible in the Sankey). `RESTRICT` makes the DB enforce that the service reassigns mappings first — an accidental direct `DELETE FROM categories` without the reassign step will raise a DB error rather than silently destroying user data.
  
  **User-visible behavior:**
  - All transactions that were mapped to the deleted category (or any of its children) are still visible in the transaction table — they have not been deleted.
  - They appear under "Uncategorized" in the category tree and in the Sankey diagram.
  - The user can re-assign them to a new category at any time.
  
  ---
  
  ### 2.5 Mappings
  
  #### `POST /api/mappings`
  
  Creates or **replaces** a mapping for a transaction. A transaction may only be mapped to one category at a time; submitting a second mapping for the same `transaction_id` silently overwrites the first.
  
  **Upsert logic (router implementation):**
  ```python
  existing = db.query(Mapping).filter_by(transaction_id=body.transaction_id).first()
  if existing:
      existing.category_id = body.category_id
      db.commit()
      return Response(status_code=200, content=MappingRead.model_validate(existing, from_attributes=True).model_dump_json())
  else:
      mapping = Mapping(transaction_id=body.transaction_id, category_id=body.category_id)
      db.add(mapping); db.commit(); db.refresh(mapping)
      return Response(status_code=201, content=MappingRead.model_validate(mapping, from_attributes=True).model_dump_json())
  ```
  The `UNIQUE` constraint on `mappings.transaction_id` is a safety net, not the upsert mechanism — the explicit check-then-update pattern avoids a REPLACE overwriting the PK and is cleaner for returning correct HTTP codes.
  
  - **Request body:**
  
  ```python
  # schemas/mappings.py
  
  class MappingCreate(BaseModel):
      transaction_id: int
      category_id: int
  ```
  
  - **Response 201:** New mapping created — `MappingRead`
  - **Response 200:** Existing mapping reassigned — `MappingRead` (same schema)
  
  ```python
  class MappingRead(BaseModel):
      id: int
      transaction_id: int
      category_id: int
      model_config = ConfigDict(from_attributes=True)
  ```
  
  - **Error 400:** `transaction_id` is an income transaction (mappings apply to expenses only).
  - **Error 404:** `transaction_id` not found. `category_id` not found.
  - **Side effects:** Invalidates the ML vectorizer cache (triggers re-fit on next `POST /api/suggestions` or Sankey build).
  - **Frontend note:** The frontend must handle both 200 and 201 as success (TanStack Query mutation `onSuccess` fires for both); the status code is informational only.
  
  #### `DELETE /api/mappings/{transaction_id}`
  
  Removes the mapping for a transaction, returning it to "unmapped" state.
  
  - **Response 204:** No content.
  - **Error 404:** No mapping found for this transaction.
  - **Side effects:** Invalidates the ML vectorizer cache (triggers re-fit on next Sankey build or `POST /api/suggestions` call, since the training corpus has shrunk).
  
  ---
  
  ### 2.6 Suggestions
  
  #### `POST /api/suggestions`
  
  Runs the ML pipeline for a batch of transaction IDs.
  
  - **Request body:**
  
  ```python
  # schemas/suggestions.py
  
  class SuggestionRequest(BaseModel):
      transaction_ids: list[int] = Field(..., min_length=1, max_length=200)
  ```
  
  - **Response 200:** `list[SuggestionResult]`
  
  ```python
  class SuggestionResult(BaseModel):
      transaction_id: int
      suggested_category_id: int
      suggested_category_name: str
      confidence: float        # 0.0–1.0
      method: Literal["exact", "tfidf"]
  ```
  
  - **Error 400:** Any `transaction_id` refers to an income transaction.
  - **Error 404:** One or more `transaction_id` values not found.
  - **Note:** Suggestions with `confidence < settings.ml_min_confidence` are still returned but the frontend may choose to suppress display. The endpoint never auto-applies suggestions — that requires a separate `POST /api/mappings` call.
  
  ---
  
  ### ML Mapping Lifecycle — Design Decision
  
  **OPEN DECISION — Two approaches are viable. The choice affects the data model, Sankey latency, and UX.**
  
  ---
  
  #### Approach A: Store ML-suggested mappings in DB (`assigned_by='ml'`)
  
  After import (or on user request), the ML pipeline runs and inserts mappings with `assigned_by='ml'` for all unconfirmed expense transactions. User reviews these and confirms/overrides each; confirming sets `assigned_by='user'`.
  
  **Pros:**
  - **Sankey is fast and deterministic.** No ML inference at query time; pure SQL aggregation. Diagram is stable between views.
  - **User sees a review queue.** Transaction table filtered to `assigned_by='ml'` shows exactly what needs human review. UX is explicit: "these are guesses, please confirm."
  - **All transactions always have a category.** No blank cells; diagram is always fully populated from day one.
  - **Auditable.** `ml_confidence` is stored; user can see how confident the ML was.
  - **Category deletion is clean.** Reassign ML mappings exactly the same as user mappings — one code path.
  
  **Cons:**
  - **Stale ML decisions.** After user corrects one mapping, other ML-mapped transactions for the same payee are wrong but not updated automatically. "Correct all NETFLIX → Streaming" requires manual bulk-update.
  - **Auto-apply decision complexity.** When to auto-create ML mappings? All imports? High-confidence only? What if no training data yet? Must handle the bootstrap case.
  - **Schema complexity.** `assigned_by`, `ml_confidence` fields; `CheckConstraint`; more migration surface.
  - **Re-run problem.** If user wants to re-run ML after making corrections, need a "refresh ML suggestions" endpoint that updates `assigned_by='ml'` rows.
  - **Risk of misleading diagram.** Low-confidence ML mappings appear in the Sankey looking the same as confirmed categories — user might not notice they haven't reviewed them.
  
  ---
  
  #### Approach B: Compute ML-implied categories on-the-fly at Sankey build time
  
  `mappings` table stores only user decisions. At Sankey build time, unmapped expense transactions are sent through the ML pipeline in-process to get their best-guess category for the diagram. Transaction table shows `mapping=null` for unconfirmed transactions; suggestion badges are shown via the separate `POST /api/suggestions` endpoint.
  
  **Pros:**
  - **Clean data model.** `mappings` = user intent only. No `assigned_by`, no `ml_confidence`, no ambiguous state.
  - **Always reflects latest model.** After user confirms a mapping, next Sankey build uses the improved ML — no stale rows to clean up.
  - **No review queue needed.** Transaction table shows mapped vs unmapped clearly; no ambiguous "ML-mapped but not reviewed" state.
  - **No retroactive update problem.** ML infers fresh each time; no "correct all instances of payee" needed.
  - **Simpler deletion.** Only user-mapped transactions reassigned on category delete.
  
  **Cons:**
  - **Sankey latency increases.** ML inference runs on every Sankey request for unmapped transactions. On a personal dataset (a few hundred unmapped transactions), TF-IDF inference is ~50–200 ms. On a large dataset it may be perceptible.
  - **Non-deterministic between views.** Confirming one mapping can change how OTHER unmapped transactions appear in the same Sankey period on the next load — the diagram shifts without an explicit user action, which may surprise users.
  - **No visibility into ML decisions.** User cannot see which categories were ML-implied vs confirmed; the Sankey looks the same for both. This can create false confidence in diagram accuracy.
  - **Unmapped transactions only become "categorized" in the diagram, not in the data.** A user reviewing the transaction table still sees them as unmapped — but the Sankey shows them under a category. This inconsistency can be confusing.
  - **Cannot disable ML for a single period.** If the user explicitly wants to see which transactions are truly unconfirmed, there's no way to get the "uncategorized only" view of the Sankey.
  
  ---
  
  #### Decision: **Approach B chosen.**
  
  ML-implied categories are computed on-the-fly at Sankey build time. The `mappings` table stores only user-confirmed decisions. This keeps the data model clean and the DB as a faithful record of user intent.
  
  **Accepted trade-offs:**
  - ML inference adds ~50–200 ms to Sankey builds for large unmapped-transaction sets; acceptable for a personal, single-user tool.
  - The Sankey may shift between views after a user confirms a mapping (the improved ML re-categorizes other unmapped transactions); this is considered a feature — the diagram reflects the best current understanding.
  - Transactions that appear under a category in the Sankey but have no explicit mapping are visually indistinguishable from confirmed ones (no `assigned_by` metadata). Future enhancement: shade ML-implied links differently.
  
  **All concrete sections in this document implement Approach B.**
  
  ---
  
  ### 2.7 Sankey
  
  #### `GET /api/sankey`
  
  Returns the complete Sankey payload for ECharts for a given date range.
  
  - **Query params:**
  
  | Param | Type | Required | Description |
  |---|---|---|---|
  | `date_from` | `date` | yes | Start of period (inclusive) |
  | `date_to` | `date` | yes | End of period (inclusive) |
  
  - **Response 200:** `SankeyPayload`
  
  ```python
  # schemas/sankey.py
  
  class SankeyNode(BaseModel):
      id: str              # unique stable string identifier used in links
      name: str            # display label
      depth: int | None = None   # optional hint for ECharts layout
      # Expense category nodes only: IDs of expense transactions
      # assigned to this category in the requested period.
      # Used by the drill-down panel on the diagram screen so the frontend
      # can fetch and display those transactions without a separate API call.
      # Income nodes and the EXPENSES/PROFICIT/DEFICIT separator nodes have transaction_ids=None.
      transaction_ids: list[int] | None = None
  
  class SankeyLink(BaseModel):
      source: str      # SankeyNode.id
      target: str      # SankeyNode.id
      value: float     # absolute value (always positive)
  
  class SankeyPayload(BaseModel):
      nodes: list[SankeyNode]
      links: list[SankeyLink]
      period_income: float
      period_expenses: float
      balance: float   # positive = proficit, negative = deficit
  ```
  
  - **Error 400:** `date_from > date_to`.
  - **Response 200 with empty nodes/links:** When no transactions exist in the period — returns `{ nodes: [], links: [], period_income: 0, period_expenses: 0, balance: 0 }`. Frontend renders an empty state placeholder.
  
  ---
  
  ## 3. Service Layer Interfaces
  
  ### 3.1 `csv_importer.py`
  
  ```python
  from sqlalchemy.orm import Session
  from app.models import Bank, ImportBatch, Transaction
  from app.schemas.imports import ImportResult
  
  def import_csv(
      db: Session,
      bank: Bank,
      file_content: bytes,
      filename: str,
  ) -> ImportResult:
      """
      Parse the CSV bytes according to bank.column_map configuration,
      compute dedup_key for each row, bulk-insert with INSERT OR IGNORE,
      and return an ImportResult summary.
  
      Preconditions:
      - `bank` is a persisted Bank ORM instance with valid column_map.
      - `file_content` is the raw bytes of the uploaded file.
  
      Algorithm:
      1. Decode bytes using bank.encoding (raise ValueError on decode error).
      2. Use pandas.read_csv with:
         - skiprows=bank.skip_header_rows
         - skipfooter=bank.skip_footer_rows (requires engine='python')
         - encoding already handled (StringIO from decoded str)
      3. Rename columns via column_map to canonical names:
         date_col, amount_col, description_col, [transaction_id_col]
      4. Drop rows where all canonical columns are NaN.
      5. For each row:
         a. Parse date using bank.date_format → Python date.
         b. Cast amount to Decimal; positive → type='income', negative → type='expense'.
         c. Compute dedup_key:
            - If transaction_id_col present and non-null: f"{bank.id}:{row.transaction_id}"
            - Else: hex(sha256(f"{bank.id}|{date}|{Decimal(amount).quantize(Decimal('0.01'))}|{description}".encode()))
         d. Collect as dict; record failed rows with row number and error message.
      6. If zero parseable rows: raise ValidationError(400) — no DB write has occurred.
      7. Create ImportBatch record; flush to get ID.
      8. Bulk-insert transactions using:
         INSERT OR IGNORE INTO transactions (...) VALUES (...)
         via SQLAlchemy core (not ORM) for performance.
      9. Determine new vs duplicate count by comparing inserted row_count
         (session.execute result.rowcount) against total attempted.
      10. Commit. Return ImportResult.
      """
  
  def _compute_dedup_key(bank_id: int, date: str, amount: Decimal, description: str) -> str:
      """Internal: SHA-256 fallback dedup key. Normalises amount to 2 d.p. before hashing."""
  
  def _normalize_column_ref(ref: str | int, df_columns: list[str]) -> str:
      """
      If ref is an int, return df_columns[ref].
      If ref is a str, return ref as-is (must match a column name).
      Raises ValueError if ref is out of range or column not found.
      """
  ```
  
  **Key invariants:**
  - Never raises on duplicate rows — `INSERT OR IGNORE` handles silently.
  - `failed_rows` accumulates per-row errors without aborting the entire import.
  - A row with a parse failure is counted in `failed_rows` and skipped, not inserted.
  
  ---
  
  ### 3.2 `ml_suggester.py`
  
  **Model choice:** TF-IDF with cosine-similarity nearest-neighbor retrieval (scikit-learn `TfidfVectorizer` + `cosine_similarity`). No offline training step. The "model" is rebuilt on demand from the set of manually-confirmed mappings already in the database.
  
  **Why TF-IDF over alternatives:**
  - Sentence-transformers / embedding models: higher quality but require a GPU or tolerate multi-second latency; overkill for a personal dataset of a few thousand transactions; would require downloading a large model file (~400 MB).
  - BM25: better recall than TF-IDF but no scikit-learn native implementation; adds a dependency.
  - Simple string-matching: handled entirely by Phase 1 (exact payee fingerprint); Phase 2 covers the cases string-matching misses.
  
  **TF-IDF is the right choice for v1:** fast, zero external downloads, interpretable, works well on short texts (transaction descriptions) once bigrams are included.
  
  ```python
  from sqlalchemy.orm import Session
  
  class MLSuggester:
      """
      Singleton-like service; instantiated once and held in app state.
      Thread-safety: the vectorizer cache uses a threading.Lock.
      """
  
      def __init__(self, settings: Settings):
          self._settings = settings
          self._vectorizer = None           # TfidfVectorizer instance
          self._train_matrix = None         # sparse matrix, shape (n_docs, n_features)
          self._train_labels: list[int] = []  # category_id per training doc
          self._exact_cache: dict[str, int] = {}   # normalized_description → category_id
          self._cache_valid: bool = False
          self._lock = threading.Lock()
  
      def invalidate(self, reason: str = "unspecified") -> None:
          """
          Called after any manual mapping is created or deleted.
          Acquires _lock before setting _cache_valid=False so concurrent
          _rebuild_cache calls cannot overwrite the invalidation.
          """
          with self._lock:
              self._cache_valid = False
  
      def suggest(
          self,
          db: Session,
          transaction_ids: list[int],
      ) -> list[SuggestionResult]:
          """
          For each transaction_id, run Phase 1 then Phase 2.
  
          Cache refresh (runs before Phase 1 and Phase 2):
            If not self._cache_valid: _rebuild_cache(db)
            This ensures _exact_cache and _train_matrix reflect the current mapping state.
  
          Phase 1 — Exact payee match:
            normalize(description) = upper().re.sub(r'[^A-Z ]', '', '').re.sub(r' +', ' ', '').strip()
            If normalize(description) in self._exact_cache → return (category_id, 1.0, 'exact')
  
          Phase 2 — TF-IDF cosine similarity:
            If _train_matrix is None (< ml_min_training_samples): skip, return no suggestion.
            Transform query description with self._vectorizer.
            Compute cosine_similarity(query_vec, self._train_matrix) → similarities array.
            Take top-k indices (k = settings.ml_top_k); extract their category_ids.
            If all top-k agree on the same category: confidence = mean(top-k scores) * 1.2 capped at 1.0
            Else: confidence = max score.
            Return (majority_category_id, confidence, 'tfidf').
  
          Preconditions:
            - All transaction_ids refer to existing expense transactions.
          """
  
      def _rebuild_cache(self, db: Session) -> None:
          """
          Acquires _lock for the entire rebuild to prevent concurrent readers
          from seeing partially-written state. Double-checked: if another thread
          already set _cache_valid=True by the time the lock is acquired, returns
          immediately without re-fitting.
          Queries all mappings joined to transactions.
          If count < settings.ml_min_training_samples: sets _train_matrix=None, marks cache valid.
          Otherwise:
            Builds _exact_cache from normalized descriptions.
            Fits TfidfVectorizer(
                analyzer='word',
                ngram_range=(settings.ml_ngram_min, settings.ml_ngram_max),
                max_features=settings.ml_max_features,
                sublinear_tf=True,    # log(1+tf) dampens high-frequency tokens
            ) on all description strings.
            Stores sparse matrix and label list.
          Sets _cache_valid=True before releasing lock.
          """
  ```
  
  **Module-level singleton accessor used by the router:**
  
  ```python
  import threading
  _suggester: MLSuggester | None = None
  _suggester_lock = threading.Lock()
  
  def get_suggester() -> MLSuggester:
      global _suggester
      if _suggester is None:
          with _suggester_lock:
              if _suggester is None:
                  from app.config import settings
                  _suggester = MLSuggester(settings=settings)
      return _suggester
  ```
  
  ---
  
  ### 3.3 `category_service.py`
  
  ```python
  from sqlalchemy.orm import Session
  from app.models import Category, Mapping
  
  UNCATEGORIZED_ID = 1
  
  def get_all_categories(db: Session) -> list[Category]:
      """Returns all categories ordered by (parent_id NULLS FIRST, sort_order, id)."""
  
  def create_category(
      db: Session,
      name: str,
      parent_id: int | None,
      sort_order: int,
  ) -> Category:
      """
      Preconditions: parent_id exists if not None. Name is unique among siblings.
      Inserts and returns new Category.
      """
  
  def rename_category(db: Session, category_id: int, new_name: str) -> Category:
      """
      Preconditions: category_id != UNCATEGORIZED_ID. Name unique among siblings.
      """
  
  def move_category(
      db: Session,
      category_id: int,
      new_parent_id: int | None,
      sort_order: int,
  ) -> Category:
      """
      Preconditions:
      - category_id != UNCATEGORIZED_ID.
      - new_parent_id is not a descendant of category_id (cycle prevention).
      Cycle check: walk ancestors of new_parent_id up to root; if category_id found → raise.
      """
  
  def delete_category(db: Session, category_id: int, suggester: MLSuggester) -> None:
      """
      Preconditions: category_id != UNCATEGORIZED_ID.
      Algorithm:
      1. subtree_ids = _get_subtree_ids(db, category_id)  # root + all descendants, depth-ordered
      2. UPDATE mappings SET category_id=UNCATEGORIZED_ID
         WHERE category_id IN subtree_ids
      3. For cat_id in subtree_ids:
           DELETE FROM categories WHERE id = cat_id
         (_get_subtree_ids already returns IDs depth-DESC so children are deleted before parents,
          satisfying the RESTRICT FK on parent_id)
      4. db.commit() — transaction committed; DB state is final.
      5. Call suggester.invalidate() to mark the ML cache stale.
         (If commit failed, an exception was raised before this line — cache stays valid.)
      Steps 1–3 execute in a single transaction; no orphaned mappings possible.
      """
  
  def _get_subtree_ids(db: Session, root_id: int) -> list[int]:
      """
      Executes recursive CTE to get all descendant IDs (including root_id),
      ordered deepest-first (depth DESC). Safe for per-row DELETE statements
      where the RESTRICT FK on parent_id requires children to be removed
      before their parents.
      """
      # CTE: WITH RECURSIVE subtree(id, depth) AS (
      #   SELECT id, 0 FROM categories WHERE id = :root_id
      #   UNION ALL
      #   SELECT c.id, s.depth+1 FROM categories c JOIN subtree s ON c.parent_id = s.id
      # ) SELECT id FROM subtree ORDER BY depth DESC
  
  def _assert_no_cycle(db: Session, category_id: int, new_parent_id: int | None) -> None:
      """Raises ValueError if new_parent_id is within the subtree of category_id.
      No-op when new_parent_id is None (moving to root)."""
  ```
  
  ---
  
  ### 3.4 `sankey_service.py`
  
  ```python
  from datetime import date
  from sqlalchemy.orm import Session
  from app.schemas.sankey import SankeyPayload, SankeyNode, SankeyLink
  
  EXPENSES_NODE_ID = "__expenses__"
  PROFICIT_NODE_ID = "__proficit__"
  DEFICIT_NODE_ID  = "__deficit__"
  
  def build_sankey(
      db: Session,
      date_from: date,
      date_to: date,
      suggester: MLSuggester,
  ) -> SankeyPayload:
      """
      Assembles the complete Sankey payload for ECharts.
      See Section 12 for full algorithm.
  
      Preconditions: date_from <= date_to.
      Returns SankeyPayload with period_income, period_expenses, balance.
  
      For expense transactions without an explicit user mapping, calls
      suggester.suggest(db, unmapped_ids) to assign a best-guess category
      for the diagram.
      Confidence rules:
        - confidence >= settings.ml_min_confidence → use suggested category_id
        - confidence < settings.ml_min_confidence → fall back to Uncategorized (id=1)
        - ML returns no result (no training data) → fall back to Uncategorized
        - ML returns deleted category_id → fall back to Uncategorized (safety net)
  
      Payload includes transaction_ids per category node to support
      the drill-down panel on the diagram screen (user clicks a node →
      sees expense list → can re-assign categories → triggers recalculation).
      """
  
  def _income_nodes_and_links(
      db: Session,
      date_from: date,
      date_to: date,
  ) -> tuple[list[SankeyNode], list[SankeyLink], float]:
      """
      Queries income transactions in period. Returns nodes, links to EXPENSES node,
      and total income sum.
      """
  
  def _expense_nodes_and_links(
      db: Session,
      date_from: date,
      date_to: date,
      suggester: MLSuggester,
      existing_category_ids: set[int],
  ) -> tuple[list[SankeyNode], list[SankeyLink], float]:
      """
      1. Queries all expense transactions in period with their explicit mapping (LEFT JOIN).
      2. Collects unmapped transaction IDs; calls suggester.suggest() to get ML-implied
         category_id for each. Validates each ML-returned category_id against
         existing_category_ids; falls back to UNCATEGORIZED_ID if not found.
      3. Merges explicit and ML-implied category assignments.
      4. Uses recursive CTE to aggregate totals per category.
      5. Builds category nodes (only for categories with amount > 0 in period).
      Returns nodes, links from EXPENSES node to category nodes, and total expenses sum.
      """
  
  def _balance_node_and_link(
      income: float,
      expenses: float,
  ) -> tuple[SankeyNode | None, SankeyLink | None]:
      """
      If income > expenses: creates Proficit node; link from EXPENSES node (source=EXPENSES_NODE_ID).
      If expenses > income: creates Deficit node; link from DEFICIT node (source=DEFICIT_NODE_ID, target=EXPENSES_NODE_ID).
      If equal: returns (None, None).
      """
  ```
  
  ---
  
  ## 4. SQLAlchemy Model Details
  
  Full ORM model file (`app/models.py`):
  
  ```python
  from __future__ import annotations
  from datetime import date, datetime, timezone
  from decimal import Decimal
  from typing import Optional
  from sqlalchemy import (
      Integer, String, Text, Numeric, Boolean, DateTime, Date,
      ForeignKey, UniqueConstraint, Index, CheckConstraint, JSON,
      event,
  )
  from sqlalchemy.orm import relationship, Mapped, mapped_column
  from app.database import Base
  
  
  class Bank(Base):
      __tablename__ = "banks"
  
      id:               Mapped[int]           = mapped_column(Integer, primary_key=True)
      name:             Mapped[str]           = mapped_column(String(120), nullable=False, unique=True)
      column_map:       Mapped[dict]          = mapped_column(JSON, nullable=False)
      date_format:      Mapped[str]           = mapped_column(String(40), nullable=False)
      skip_header_rows: Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
      skip_footer_rows: Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
      encoding:         Mapped[str]           = mapped_column(String(30), nullable=False, default="utf-8")
  
      # Relationships
      transactions: Mapped[list[Transaction]] = relationship(
          "Transaction", back_populates="bank", passive_deletes=True
      )
      import_batches: Mapped[list[ImportBatch]] = relationship(
          "ImportBatch", back_populates="bank", passive_deletes=True
      )
  
  
  class ImportBatch(Base):
      __tablename__ = "import_batches"
  
      id:          Mapped[int]      = mapped_column(Integer, primary_key=True)
      bank_id:     Mapped[int]      = mapped_column(Integer, ForeignKey("banks.id", ondelete="RESTRICT"), nullable=False)
      imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
      filename:    Mapped[str]      = mapped_column(Text, nullable=False)
  
      bank:         Mapped[Bank]             = relationship("Bank", back_populates="import_batches")
      transactions: Mapped[list[Transaction]] = relationship(
          "Transaction", back_populates="import_batch"
      )
  
      __table_args__ = (
          Index("ix_import_batches_bank_id", "bank_id"),
      )
  
  
  class Transaction(Base):
      __tablename__ = "transactions"
  
      id:              Mapped[int]           = mapped_column(Integer, primary_key=True)
      bank_id:         Mapped[int]           = mapped_column(Integer, ForeignKey("banks.id", ondelete="RESTRICT"), nullable=False)
      import_batch_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True)
      date:            Mapped[date]          = mapped_column(Date, nullable=False)
      amount:          Mapped[Decimal]       = mapped_column(Numeric(12, 4), nullable=False)
      description:     Mapped[str]           = mapped_column(Text, nullable=False)
      type:            Mapped[str]           = mapped_column(String(10), nullable=False)  # 'income'|'expense'
      dedup_key:       Mapped[str]           = mapped_column(Text, nullable=False, unique=True)
  
      bank:         Mapped[Bank]              = relationship("Bank", back_populates="transactions")
      import_batch: Mapped[Optional[ImportBatch]] = relationship("ImportBatch", back_populates="transactions")
      mapping:      Mapped[Optional[Mapping]]     = relationship(
          "Mapping", back_populates="transaction",
          uselist=False,
          cascade="all, delete-orphan",
      )
  
      __table_args__ = (
          CheckConstraint("type IN ('income', 'expense')", name="ck_transactions_type"),
          Index("ix_transactions_date", "date"),
          Index("ix_transactions_bank_id", "bank_id"),
          Index("ix_transactions_type", "type"),
          # Composite index for Sankey query: date + type
          Index("ix_transactions_date_type", "date", "type"),
      )
  
  
  class Category(Base):
      __tablename__ = "categories"
  
      id:         Mapped[int]           = mapped_column(Integer, primary_key=True)
      name:       Mapped[str]           = mapped_column(String(120), nullable=False)
      parent_id:  Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True)
      sort_order: Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
  
      # Self-referential relationship
      parent:   Mapped[Optional[Category]]  = relationship(
          "Category", remote_side="Category.id", back_populates="children"
      )
      children: Mapped[list[Category]]      = relationship(
          "Category", back_populates="parent"
      )
      mappings: Mapped[list[Mapping]]       = relationship(
          "Mapping", back_populates="category"
      )
  
      __table_args__ = (
          # Name must be unique per parent (including null parent = root level)
          # SQLite does not enforce multi-column unique with nulls well; enforced in service layer
          Index("ix_categories_parent_id", "parent_id"),
      )
  
  
  class Mapping(Base):
      __tablename__ = "mappings"
  
      id:             Mapped[int]   = mapped_column(Integer, primary_key=True)
      transaction_id: Mapped[int]   = mapped_column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, unique=True)
      category_id:    Mapped[int]   = mapped_column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
  
      transaction: Mapped[Transaction] = relationship("Transaction", back_populates="mapping")
      category:    Mapped[Category]    = relationship("Category", back_populates="mappings")
  
      __table_args__ = (
          Index("ix_mappings_category_id", "category_id"),
      )
  ```
  
  **Initial migration (`alembic/versions/001_initial_schema.py`) must include this seed data step in `upgrade()`:**
  
  ```python
  def upgrade():
      # ... all CREATE TABLE statements ...
  
      # Seed the immutable "Uncategorized" system category with id=1
      op.execute(
          "INSERT INTO categories (id, name, parent_id, sort_order) "
          "VALUES (1, 'Uncategorized', NULL, 0)"
      )
      # Reset auto-increment so next category starts at 2
      # (SQLite: insert with explicit id already handles this)
  ```
  
  ---
  
  ## 5. Frontend Project Structure
  
  ```
  frontend/
  ├── Dockerfile
  ├── nginx.conf
  ├── index.html
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  └── src/
      ├── main.tsx                          # ReactDOM.createRoot, QueryClientProvider, Router
      ├── App.tsx                           # Route definitions, AppShell wrapper
      ├── vite-env.d.ts
      ├── types/
      │   ├── index.ts                      # Re-exports all domain types
      │   ├── bank.ts
      │   ├── transaction.ts
      │   ├── category.ts
      │   ├── mapping.ts
      │   ├── suggestion.ts
      │   └── sankey.ts
      ├── services/
      │   ├── api.ts                        # Axios instance + base URL config
      │   ├── bankService.ts
      │   ├── importService.ts
      │   ├── transactionService.ts
      │   ├── categoryService.ts
      │   ├── mappingService.ts
      │   ├── suggestionService.ts
      │   └── sankeyService.ts
      ├── utils/
      │   └── logger.ts                     # Console wrapper with log-level control
      ├── hooks/
      │   ├── useBanks.ts
      │   ├── useImport.ts
      │   ├── useTransactions.ts
      │   ├── useCategoryTree.ts
      │   ├── useMappings.ts
      │   ├── useSuggestions.ts
      │   └── useSankeyData.ts
      ├── store/
      │   └── useAppStore.ts               # Single Zustand store
      ├── components/
      │   ├── layout/
      │   │   ├── AppShell.tsx
      │   │   └── NavBar.tsx
      │   ├── banks/
      │   │   └── BankConfigModal.tsx
      │   ├── import/
      │   │   └── ImportModal.tsx
      │   ├── categories/
      │   │   ├── CategoryTree.tsx
      │   │   └── CategoryPanel.tsx
      │   ├── transactions/
      │   │   └── TransactionTable.tsx
      │   ├── sankey/
      │   │   ├── SankeyDiagram.tsx
      │   │   └── SankeyNodePanel.tsx
      │   └── shared/
      │       ├── DateRangePicker.tsx
      │       ├── ConfirmDialog.tsx
      │       └── LoadingSpinner.tsx
      └── pages/
          ├── DashboardPage.tsx            # Sankey + DateRangePicker
          ├── TransactionsPage.tsx         # TransactionTable + CategoryPanel
          └── SettingsPage.tsx             # BankConfigModal list + ImportModal trigger
  ```
  
  **`src/services/api.ts`:**
  
  ```typescript
  import axios from "axios";
  
  export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api",
    headers: { "Content-Type": "application/json" },
  });
  
  // Response interceptor: normalize error shape for hooks
  apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
      const message: string =
        err.response?.data?.detail ?? err.message ?? "Unknown error";
      return Promise.reject(new Error(message));
    }
  );
  ```
  
  ---
  
  ## 6. Page Layout and Routing
  
  ### Route Definitions (`App.tsx`)
  
  ```tsx
  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  import { AppShell } from "./components/layout/AppShell";
  import { DashboardPage }    from "./pages/DashboardPage";
  import { TransactionsPage } from "./pages/TransactionsPage";
  import { SettingsPage }     from "./pages/SettingsPage";
  
  export function App() {
    return (
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/"              element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/transactions"  element={<TransactionsPage />} />
            <Route path="/settings"      element={<SettingsPage />} />
            <Route path="*"              element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    );
  }
  ```
  
  ### Page-Level Component Hierarchy
  
  **`/dashboard` — `DashboardPage`**
  
  ```
  DashboardPage
  ├── DateRangePicker            (reads/writes store.dateRange)
  └── SankeyDiagram              (consumes useSankeyData)
  ```
  
  **`/transactions` — `TransactionsPage`**
  
  ```
  TransactionsPage
  ├── CategoryPanel              (left sidebar, ~280px)
  │   └── CategoryTree           (react-arborist tree)
  └── TransactionTable           (main content area)
      └── [inline suggestion badges per row]
  ```
  
  **`/settings` — `SettingsPage`**
  
  ```
  SettingsPage
  ├── BankConfigModal            (trigger button per bank, plus "Add Bank")
  └── ImportModal                (trigger button: "Import CSV")
  ```
  
  ### Navigation Shell (`AppShell`)
  
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ NavBar: [WIMM logo]  [Dashboard] [Transactions] [Settings] │
  │         [right side: Import button → opens ImportModal]    │
  ├────────────────────────────────────────────────────────────┤
  │                                                            │
  │                 <page content area>                        │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
  ```
  
  The "Import CSV" button in the NavBar sets `store.importModalOpen = true`. The `ImportModal` component is always mounted in `AppShell` and reads `store.importModalOpen` to control its visibility, so it can be opened from anywhere.
  
  ---
  
  ## 7. Component Specifications
  
  ### 7.1 `AppShell`
  
  **File:** `src/components/layout/AppShell.tsx`
  
  ```typescript
  interface AppShellProps {
    children: React.ReactNode;
  }
  ```
  
  Renders the top navigation bar (`NavBar`) and a content area below it. Mounts `ImportModal` once (always in DOM, visibility driven by store). Mounts a global `<Toaster />` component (e.g., react-hot-toast). No data fetching.
  
  ---
  
  ### 7.2 `NavBar`
  
  **File:** `src/components/layout/NavBar.tsx`
  
  No external props. Reads `useAppStore` for `setImportModalOpen`. Renders navigation links via `react-router-dom NavLink`. "Import CSV" button calls `setImportModalOpen(true)`.
  
  ---
  
  ### 7.3 `ImportModal`
  
  **File:** `src/components/import/ImportModal.tsx`
  
  ```typescript
  interface ImportModalProps {
    open: boolean;
    onClose: () => void;
  }
  ```
  
  **What it renders:**
  - A modal dialog (controlled by `open` prop).
  - A `<select>` populated from `useBanks()` query.
  - A file input (`accept=".csv"`).
  - Submit button that calls the `importCsv` mutation from `useImport()`.
  - After success: shows inline summary (`"12 new, 8 duplicates, 2 failed"`). Lists any `failed_rows` with row number and error string in a collapsible section.
  - Error from mutation: toast notification, modal stays open.
  
  **Hooks consumed:** `useBanks`, `useImport`
  
  **Events emitted:**
  - `onClose(): void` — called after successful import or on cancel.
  
  ---
  
  ### 7.4 `BankConfigModal`
  
  **File:** `src/components/banks/BankConfigModal.tsx`
  
  ```typescript
  interface BankConfigModalProps {
    bank: BankRead | null;    // null = create mode; non-null = edit mode
    open: boolean;
    onClose: () => void;
  }
  ```
  
  **What it renders:**
  - A modal dialog with a form containing inputs for: `name`, `date_format`, `encoding`, `skip_header_rows`, `skip_footer_rows`.
  - A sub-form for `column_map` with 4 fields: `date`, `amount`, `description`, `transaction_id` (optional).
  - Save / Cancel buttons.
  - In edit mode: a "Delete Bank" button (shows `ConfirmDialog` before executing delete mutation; blocked if bank has transactions — error toast).
  
  **Hooks consumed:** `useBanks`
  
  **Events emitted:**
  - `onClose(): void`
  
  ---
  
  ### 7.5 `CategoryTree`
  
  **File:** `src/components/categories/CategoryTree.tsx`
  
  ```typescript
  interface CategoryTreeProps {
    onNodeSelect: (categoryId: number | null) => void;
    selectedNodeId: number | null;
  }
  ```
  
  **What it renders:**
  - A `react-arborist` `<Tree>` component populated from `useCategoryTree()`.
  - Each node: category name, expand/collapse toggle.
  - Inline rename (double-click activates `react-arborist` built-in rename mode).
  - Context menu (right-click): "Add child", "Rename", "Delete" (blocked for id=1).
  - Drag-and-drop reparenting via `react-arborist` `onMove` callback.
  
  **Data shape fed to react-arborist:**
  
  ```typescript
  interface TreeNode {
    id: string;         // string version of category.id (react-arborist requires string)
    name: string;
    children?: TreeNode[];
  }
  ```
  
  The flat list from `useCategoryTree()` is transformed into this nested structure locally before rendering (sort by `sort_order`).
  
  **Hooks consumed:** `useCategoryTree`
  
  **Events emitted:**
  - `onNodeSelect(categoryId: number | null)` — called on node click; null when selection cleared.
  
  ---
  
  ### 7.6 `CategoryPanel`
  
  **File:** `src/components/categories/CategoryPanel.tsx`
  
  ```typescript
  // No external props — reads and writes Zustand store directly
  ```
  
  **What it renders:**
  - A sidebar panel containing `CategoryTree`.
  - A header with "New root category" button.
  - Passes `selectedNodeId` from store to `CategoryTree`.
  
  **Hooks consumed:** `useCategoryTree` (for create/delete mutations)
  
  **Store interactions:** Reads `store.activeCategoryId`; calls `store.setActiveCategoryId`.
  
  ---
  
  ### 7.7 `TransactionTable`
  
  **File:** `src/components/transactions/TransactionTable.tsx`
  
  ```typescript
  interface TransactionTableProps {
    filterCategoryId: number | null;   // from store.activeCategoryId — null = show all
  }
  ```
  
  **What it renders:**
  - A TanStack Table v8 headless table with columns:
    - Date
    - Description
    - Amount (formatted with sign and currency symbol)
    - Type badge
    - Bank name
    - Category (dropdown select for expenses; "—" for income)
    - Suggestion badge (only when mapping is absent and a suggestion exists; shows suggested category name + confidence %; "Accept" button)
  - Pagination controls (page, page_size selector: 25/50/100).
  - Filter bar: date range (reads from store), type toggle, bank select, search input, "Unmapped only" checkbox.
  - "Clear mapping" icon button per expense row.
  
  **Hooks consumed:** `useTransactions`, `useMappings`, `useSuggestions`
  
  **Events emitted:** None — all mutations go through hooks directly.
  
  ---
  
  ### 7.8 `SankeyDiagram`
  
  **File:** `src/components/sankey/SankeyDiagram.tsx`
  
  ```typescript
  interface SankeyDiagramProps {
    dateFrom: string;  // YYYY-MM-DD
    dateTo: string;    // YYYY-MM-DD
  }
  ```
  
  **What it renders:**
  - An `ReactECharts` component with `option` built from `useSankeyData(dateFrom, dateTo)`.
  - Loading spinner while data loads.
  - Empty state (`<p>No transactions in this period</p>`) when `nodes.length === 0`.
  - `SankeyNodePanel` (slide-in panel) when a category expense node is clicked.
  - ECharts option shape:
  
  ```typescript
  const option = {
    series: [{
      type: "sankey",
      layout: "none",
      emphasis: { focus: "adjacency" },
      data: payload.nodes.map(n => ({
        name: n.id,                          // ECharts key — must match link source/target
        label: { formatter: () => n.name },  // human-readable display label
      })),
      links: payload.links.map(l => ({
        source: l.source,   // SankeyNode.id — matches data[].name above
        target: l.target,
        value: l.value,
      })),
      label: { position: "right" },
      lineStyle: { color: "gradient", opacity: 0.4 },
    }],
    tooltip: {
      trigger: "item",
      formatter: (params: { dataType: string; name: string; value: number; data: { source: string; target: string } }) => {
        if (params.dataType === "edge") {
          const src = payload.nodes.find(n => n.id === params.data.source);
          const tgt = payload.nodes.find(n => n.id === params.data.target);
          return `${src?.name ?? params.data.source} → ${tgt?.name ?? params.data.target}: ${params.value}`;
        }
        const node = payload.nodes.find(n => n.id === params.name);
        return `${node?.name ?? params.name}: ${params.value}`;
      },
    },
  };
  ```
  
  **Node click interaction:**
  - ECharts `onEvents={{ click: handleNodeClick }}`.
  - `handleNodeClick` receives `{ name }` from ECharts — `name` holds the node's `id`; map back to the node using `payload.nodes.find(n => n.id === name)`.
  - If the clicked node has `transaction_ids` (it is an expense category node): call `store.openSankeyPanel(node.id, node.name, node.transaction_ids)` to open the drill-down panel.
  - Income and separator nodes (PROFICIT/DEFICIT/EXPENSES) have no `transaction_ids` — clicks are ignored.
  
  **Panel visibility:** derived from `store.sankeyPanel.open` — no local state needed. Pass `store.closeSankeyPanel` as the `onClose` prop to `SankeyNodePanel`.
  
  **Hooks consumed:** `useSankeyData`
  
  ---
  
  ### 7.9 `SankeyNodePanel`
  
  **File:** `src/components/sankey/SankeyNodePanel.tsx`
  
  ```typescript
  interface SankeyNodePanelProps {
    nodeId: string;                  // identifies which node is being drilled into
    nodeName: string;                // category name — panel header
    transactionIds: number[];        // from SankeyNode.transaction_ids
    dateFrom: string;
    dateTo: string;
    onClose: () => void;
  }
  ```
  
  **What it renders:**
  - A slide-in side panel (or modal) positioned over the diagram.
  - Panel header: `"{nodeName} — Expenses"` with a close button.
  - A compact transaction list (date, description, amount, current category) for the given `transactionIds`.
    - Fetches transaction details via `useTransactions({ ids: transactionIds })` — the transactions endpoint accepts an `ids` filter (comma-separated) for bulk fetch by ID.
  - Per-row category dropdown: user can reassign a transaction to any category.
    - On change → calls `useMappings().createOrUpdateMapping({ transaction_id, category_id })`.
    - On mutation success → closes panel and triggers Sankey recalculation via `["sankey"]` TanStack Query invalidation (already wired in `useMappings`).
  
  **Behavior on re-assignment:**
  - After a successful remapping, the panel closes (or optionally refreshes with updated list).
  - `useSankeyData` refetches because `["sankey"]` was invalidated → diagram recalculates and the transaction moves to its new category node.
  
  **Hooks consumed:** `useTransactions`, `useMappings`
  
  ---
  
  ### 7.10 `DateRangePicker`
  
  **File:** `src/components/shared/DateRangePicker.tsx`
  
  ```typescript
  // No external props — reads and writes store.dateRange
  ```
  
  **What it renders:**
  - Two `<input type="date">` fields for start and end.
  - Quick-select buttons: "This Month", "Last Month", "This Year", "Last 3 Months".
  - Validation: start must not exceed end (inline error).
  
  **Store interactions:** Reads `store.dateRange`; calls `store.setDateRange`.
  
  ---
  
  ## 8. Custom Hooks Specification
  
  ### 8.1 `useBanks`
  
  **File:** `src/hooks/useBanks.ts`
  
  ```typescript
  interface UseBanksReturn {
    banks: BankRead[];
    isLoading: boolean;
    error: Error | null;
    createBank: UseMutationResult<BankRead, Error, BankCreate>;
    updateBank: UseMutationResult<BankRead, Error, { id: number } & BankUpdate>;
    deleteBank: UseMutationResult<void, Error, number>;
  }
  
  export function useBanks(): UseBanksReturn;
  ```
  
  **Query key:** `["banks"]`
  
  **Mutations and invalidation:**
  - `createBank` → on success, invalidates `["banks"]`
  - `updateBank` → on success, invalidates `["banks"]`
  - `deleteBank` → on success, invalidates `["banks"]`, `["transactions"]` (all pages)
  
  ---
  
  ### 8.2 `useImport`
  
  **File:** `src/hooks/useImport.ts`
  
  ```typescript
  interface ImportPayload {
    bankId: number;
    file: File;
  }
  
  interface UseImportReturn {
    importCsv: UseMutationResult<ImportResult, Error, ImportPayload>;
  }
  
  export function useImport(): UseImportReturn;
  ```
  
  **Query key:** (mutation only — no query)
  
  **Mutations and invalidation:**
  - `importCsv` → on success, invalidates `["transactions"]` (all pages), `["sankey"]`
  
  ---
  
  ### 8.3 `useTransactions`
  
  **File:** `src/hooks/useTransactions.ts`
  
  ```typescript
  interface TransactionFilters {
    dateFrom?: string;
    dateTo?: string;
    type?: "income" | "expense";
    bankId?: number;
    categoryId?: number;
    unmapped?: boolean;
    search?: string;
    ids?: number[];    // bulk fetch by ID; when set, other filters (except page/pageSize) are ignored
    page: number;
    pageSize: number;
  }
  
  interface UseTransactionsReturn {
    data: TransactionPage | undefined;
    isLoading: boolean;
    error: Error | null;
    deleteTransaction: UseMutationResult<void, Error, number>;
  }
  
  export function useTransactions(filters: TransactionFilters): UseTransactionsReturn;
  ```
  
  **Query key:** `["transactions", filters]` — entire `filters` object as second element, so any filter change refetches.
  
  **Mutations and invalidation:**
  - `deleteTransaction` → on success, invalidates `["transactions"]`, `["sankey"]`
  
  ---
  
  ### 8.4 `useCategoryTree`
  
  **File:** `src/hooks/useCategoryTree.ts`
  
  ```typescript
  interface UseCategoryTreeReturn {
    categories: CategoryRead[];
    isLoading: boolean;
    error: Error | null;
    createCategory: UseMutationResult<CategoryRead, Error, CategoryCreate>;
    renameCategory: UseMutationResult<CategoryRead, Error, { id: number; name: string }>;
    moveCategory: UseMutationResult<CategoryRead, Error, { id: number } & CategoryMoveRequest>;
    deleteCategory: UseMutationResult<void, Error, number>;
  }
  
  export function useCategoryTree(): UseCategoryTreeReturn;
  ```
  
  **Query key:** `["categories"]`
  
  **Mutations and invalidation:**
  - All mutations → on success, invalidate `["categories"]`
  - `deleteCategory` → also invalidates `["transactions"]` (mappings may have been reassigned) and `["sankey"]`
  
  ---
  
  ### 8.5 `useMappings`
  
  **File:** `src/hooks/useMappings.ts`
  
  ```typescript
  interface UseMappingsReturn {
    createOrUpdateMapping: UseMutationResult<MappingRead, Error, MappingCreate>;
    deleteMapping: UseMutationResult<void, Error, number>;  // param = transaction_id
  }
  
  export function useMappings(): UseMappingsReturn;
  ```
  
  **Query key:** (mutations only — mapping data is embedded in `TransactionRead` from `useTransactions`)
  
  **Mutations and invalidation:**
  - `createOrUpdateMapping` → invalidates `["transactions"]`, `["sankey"]`, **and `["suggestions"]`** (so the suggestion badges for still-unmapped transactions refresh with the updated model).
  - `deleteMapping` → invalidates `["transactions"]`, `["sankey"]`
  
  ---
  
  ### 8.6 `useSuggestions`
  
  **File:** `src/hooks/useSuggestions.ts`
  
  ```typescript
  interface UseSuggestionsReturn {
    suggestions: Map<number, SuggestionResult>;  // keyed by transaction_id
    isLoading: boolean;
    refetch: () => void;
  }
  
  export function useSuggestions(transactionIds: number[]): UseSuggestionsReturn;
  ```
  
  **Query key:** `["suggestions", transactionIds]` — results are stored in TanStack Query cache.
  
  **Note:** Uses `useQuery` (not a mutation) so that `queryClient.invalidateQueries(["suggestions"])` from `useMappings` takes effect and suggestion badges refresh after a mapping is assigned. `transactionIds` is sorted before inclusion in the key to ensure cache stability. The query must include `enabled: transactionIds.length > 0` to avoid firing POST /api/suggestions with an empty list (server enforces `min_length=1` and returns 422).
  
  ---
  
  ### 8.7 `useSankeyData`
  
  **File:** `src/hooks/useSankeyData.ts`
  
  ```typescript
  interface UseSankeyDataReturn {
    payload: SankeyPayload | undefined;
    isLoading: boolean;
    error: Error | null;
  }
  
  export function useSankeyData(dateFrom: string, dateTo: string): UseSankeyDataReturn;
  ```
  
  **Query key:** `["sankey", dateFrom, dateTo]`
  
  **Configuration:**
  - `staleTime: 30_000` (30 s) — Sankey data is expensive to compute; avoid unnecessary refetches.
  - `enabled: !!dateFrom && !!dateTo` — skips fetch if date range is incomplete.
  
  ---
  
  ## 9. Zustand Store Shape
  
  **File:** `src/store/useAppStore.ts`
  
  ```typescript
  import { create } from "zustand";
  
  interface DateRange {
    from: string;   // YYYY-MM-DD
    to: string;     // YYYY-MM-DD
  }
  
  interface AppState {
    // Date range — shared between DashboardPage and TransactionTable filters
    dateRange: DateRange;
    setDateRange: (range: DateRange) => void;
  
    // Active category node — drives TransactionTable filter when on /transactions
    activeCategoryId: number | null;
    setActiveCategoryId: (id: number | null) => void;
  
    // Sankey drill-down panel state
    sankeyPanel: {
      open: boolean;
      nodeId: string | null;
      nodeName: string | null;
      transactionIds: number[];
    };
    openSankeyPanel: (nodeId: string, nodeName: string, transactionIds: number[]) => void;
    closeSankeyPanel: () => void;
  
    // Modal visibility flags
    importModalOpen: boolean;
    setImportModalOpen: (open: boolean) => void;
  
    bankConfigModalState: {
      open: boolean;
      bankId: number | null;   // null = create mode
    };
    openBankConfigModal: (bankId: number | null) => void;
    closeBankConfigModal: () => void;
  
    // Toasts are handled by react-hot-toast directly, not stored here
  }
  
  // Initial date range: first day of current month → today
  function toLocalDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  
  function getDefaultDateRange(): DateRange {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      from: toLocalDateString(from),
      to: toLocalDateString(today),
    };
  }
  
  export const useAppStore = create<AppState>((set) => ({
    dateRange: getDefaultDateRange(),
    setDateRange: (range) => set({ dateRange: range }),
  
    activeCategoryId: null,
    setActiveCategoryId: (id) => set({ activeCategoryId: id }),
  
    sankeyPanel: { open: false, nodeId: null, nodeName: null, transactionIds: [] },
    openSankeyPanel: (nodeId, nodeName, transactionIds) =>
      set({ sankeyPanel: { open: true, nodeId, nodeName, transactionIds } }),
    closeSankeyPanel: () =>
      set({ sankeyPanel: { open: false, nodeId: null, nodeName: null, transactionIds: [] } }),
  
    importModalOpen: false,
    setImportModalOpen: (open) => set({ importModalOpen: open }),
  
    bankConfigModalState: { open: false, bankId: null },
    openBankConfigModal: (bankId) =>
      set({ bankConfigModalState: { open: true, bankId } }),
    closeBankConfigModal: () =>
      set({ bankConfigModalState: { open: false, bankId: null } }),
  }));
  ```
  
  ---
  
  ## 10. Error Handling Strategy
  
  ### Backend
  
  **`app/exceptions.py` — custom exception classes:**
  
  ```python
  class WIMMException(Exception):
      """Base class for all application exceptions."""
      def __init__(self, message: str, status_code: int = 500):
          self.message = message
          self.status_code = status_code
  
  class NotFoundError(WIMMException):
      def __init__(self, resource: str, id: int | str):
          super().__init__(f"{resource} with id={id} not found.", 404)
  
  class ConflictError(WIMMException):
      def __init__(self, message: str):
          super().__init__(message, 409)
  
  class ForbiddenError(WIMMException):
      def __init__(self, message: str):
          super().__init__(message, 403)
  
  class ValidationError(WIMMException):
      def __init__(self, message: str):
          super().__init__(message, 400)
  ```
  
  **`register_exception_handlers` in `app/exceptions.py`:**
  
  ```python
  from fastapi import FastAPI, Request
  from fastapi.responses import JSONResponse
  
  def register_exception_handlers(app: FastAPI) -> None:
  
      @app.exception_handler(WIMMException)
      async def wimm_handler(request: Request, exc: WIMMException):
          return JSONResponse(
              status_code=exc.status_code,
              content={"detail": exc.message},
          )
  
      @app.exception_handler(RequestValidationError)
      async def validation_handler(request: Request, exc: RequestValidationError):
          return JSONResponse(
              status_code=422,
              content={"detail": exc.errors()},
          )
  
      @app.exception_handler(Exception)
      async def generic_handler(request: Request, exc: Exception):
          # Log the full traceback server-side
          import traceback, logging
          logging.error(traceback.format_exc())
          return JSONResponse(
              status_code=500,
              content={"detail": "Internal server error. Check backend logs."},
          )
  ```
  
  **HTTP status code map:**
  
  | Situation | Status |
  |---|---|
  | Resource not found | 404 |
  | Name/key conflict | 409 |
  | Protected resource (Uncategorized, bank with transactions) | 403 |
  | Invalid request data (bad dates, wrong transaction type) | 400 |
  | Pydantic/FastAPI validation failure | 422 |
  | Unexpected server error | 500 |
  
  ### Frontend
  
  **Error boundaries:** A single `ErrorBoundary` component wraps the `<Routes>` block in `App.tsx`. It renders a full-page error card with the error message and a "Reload" button. Component-level crashes do not kill the entire app.
  
  ```tsx
  // src/components/shared/ErrorBoundary.tsx
  // Standard React class component implementing componentDidCatch
  ```
  
  **Toast notifications (`react-hot-toast`):**
  
  - All `UseMutationResult.onError` callbacks call `toast.error(err.message)`.
  - Successful mutations call `toast.success("...")` with brief context (e.g., "Category deleted", "3 transactions imported").
  - Toast is mounted once in `AppShell`.
  
  **TanStack Query global error handler:**
  
  ```typescript
  // src/main.tsx
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Request failed");
        },
      },
      mutations: {
        // Per-mutation onError is preferred for specific messages;
        // this global handler is a fallback.
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Mutation failed");
        },
      },
    },
  });
  ```
  
  **Loading states:** `isLoading` from each hook drives `<LoadingSpinner />` displayed inline within the component that owns the data. There is no full-page loading overlay.
  
  ---
  
  ## 11. CSV Import Flow — Sequence
  
  ```
  Browser                  FastAPI Router            csv_importer.py          SQLite
    │                           │                          │                    │
    │  POST /api/import         │                          │                    │
    │  (multipart: bank_id,     │                          │                    │
    │   file: CSV bytes)        │                          │                    │
    ├──────────────────────────►│                          │                    │
    │                           │ 1. Validate bank_id      │                    │
    │                           │    exists → 400 if not  │                    │
    │                           │                          │                    │
    │                           │ 2. Read file bytes       │                    │
    │                           │    Check extension .csv  │                    │
    │                           │    → 400 if wrong type  │                    │
    │                           │                          │                    │
    │                           │ 3. Call import_csv(db,   │                    │
    │                           │    bank, bytes, filename)│                    │
    │                           ├─────────────────────────►│                    │
    │                           │                          │ 4. Decode bytes    │
    │                           │                          │    (bank.encoding) │
    │                           │                          │                    │
    │                           │                          │ 5. pandas.read_csv │
    │                           │                          │    skiprows=       │
    │                           │                          │    skip_header_rows│
    │                           │                          │    skipfooter=     │
    │                           │                          │    skip_footer_rows│
    │                           │                          │                    │
    │                           │                          │ 6. Column rename   │
    │                           │                          │    via column_map  │
    │                           │                          │                    │
    │                           │                          │ 7. Per-row loop:   │
    │                           │                          │    a. Parse date   │
    │                           │                          │    b. Cast amount  │
    │                           │                          │    c. Derive type  │
    │                           │                          │    d. Compute      │
    │                           │                          │       dedup_key    │
    │                           │                          │    → failed_rows[] │
    │                           │                          │       on error     │
    │                           │                          │                    │
    │                           │                          │ 8. INSERT INTO     │
    │                           │                          │    import_batches  │
    │                           │                          ├───────────────────►│
    │                           │                          │◄──────────────────┤
    │                           │                          │    batch_id        │
    │                           │                          │                    │
    │                           │                          │ 9. Bulk INSERT OR  │
    │                           │                          │    IGNORE INTO     │
    │                           │                          │    transactions    │
    │                           │                          ├───────────────────►│
    │                           │                          │◄──────────────────┤
    │                           │                          │  rowcount (new)    │
    │                           │                          │                    │
    │                           │                          │ 10. Commit         │
    │                           │                          │                    │
    │                           │◄─────────────────────────┤                    │
    │                           │    ImportResult           │                    │
    │                           │                          │                    │
    │                           │ 11. Background task:     │                    │
    │                           │  get_suggester().        │                    │
    │                           │  invalidate()            │                    │
    │                           │  (marks cache dirty;     │                    │
    │                           │   no blocking ML here)   │                    │
    │                           │                          │                    │
    │◄──────────────────────────┤                          │                    │
    │  200 ImportResult         │                          │                    │
    │  {new:12, dupes:8,        │                          │                    │
    │   failed:[...]}           │                          │                    │
    │                           │                          │                    │
    │ 12. ImportModal shows     │                          │                    │
    │     summary inline        │                          │                    │
    │                           │                          │                    │
    │ 13. On modal close:       │                          │                    │
    │     TanStack Query        │                          │                    │
    │     invalidates           │                          │                    │
    │     ["transactions"]      │                          │                    │
    │     ["sankey"]            │                          │                    │
  ```
  
  **Step 11 — ML invalidation detail:** The router calls `get_suggester().invalidate()` synchronously after a successful import. This is O(1) (sets a boolean). The actual re-fit of the TF-IDF vectorizer happens lazily on the next `POST /api/suggestions` call or Sankey build, not here — so the import response is never delayed by ML computation.
  
  **Error handling during import:**
  
  - Decode failure (wrong encoding) → `ValidationError(400)` before any DB write.
  - Missing required columns → `ValidationError(400)` before any DB write.
  - Zero parseable rows (all failed) → `ValidationError(400)`.
  - Partial failures (some rows bad): insert what succeeded, accumulate `failed_rows` in `ImportResult`, return `200`.
  
  ---
  
  ## 12. Sankey Assembly Algorithm
  
  ```
  FUNCTION build_sankey(db, date_from, date_to):
  
    ── Step 1: Query income transactions ──────────────────────────────────────
    income_rows = SELECT id, description, amount
                  FROM transactions
                  WHERE type = 'income'
                    AND date BETWEEN date_from AND date_to
                  ORDER BY date, id
  
    total_income = SUM(row.amount for row in income_rows)   # all positive
  
    ── Step 2: Build income nodes + links to EXPENSES node ────────────────────
    income_nodes = []
    income_links = []
  
    FOR row IN income_rows:
      node_id = f"income_{row.id}"
      income_nodes.append(SankeyNode(
        id   = node_id,
        name = f"{row.description[:40]}",   # truncate long descriptions
      ))
      income_links.append(SankeyLink(
        source = node_id,
        target = EXPENSES_NODE_ID,
        value  = float(row.amount),
      ))
  
    ── Step 3: Load category metadata ─────────────────────────────────────────
    all_categories = SELECT id, name, parent_id FROM categories
    cat_map: dict[int, Category] = {c.id: c for c in all_categories}
  
    ── Step 4: Resolve category for each expense transaction ──────────────────
    # First pass: split transactions in period into mapped vs unmapped.
  
    expense_rows = SELECT t.id, t.amount, m.category_id
                   FROM transactions t
                   LEFT JOIN mappings m ON m.transaction_id = t.id
                   WHERE t.type = 'expense'
                     AND t.date BETWEEN :date_from AND :date_to
  
    expense_amounts: dict[tx_id → float] = {}         # tx_id → amount for Step 5
    mapped_by_tx:   dict[tx_id → category_id] = {}   # explicit user mappings
    unmapped_ids:   list[int] = []
  
    FOR row IN expense_rows:
      expense_amounts[row.id] = float(row.amount)
      IF row.category_id IS NOT NULL:
        mapped_by_tx[row.id] = row.category_id
      ELSE:
        unmapped_ids.append(row.id)
  
    # ML inference for unmapped transactions
    IF unmapped_ids:
      suggestions = suggester.suggest(db, unmapped_ids)
      all_cat_ids = set(cat_map.keys())  # cat_map loaded in Step 3 above
      FOR s IN suggestions:
        IF s.confidence >= settings.ml_min_confidence AND s.suggested_category_id IN all_cat_ids:
          mapped_by_tx[s.transaction_id] = s.suggested_category_id
        ELSE:
          mapped_by_tx[s.transaction_id] = UNCATEGORIZED_ID  # below threshold or deleted
      # Transactions with no suggestion at all (no training data) → Uncategorized
      FOR tx_id IN unmapped_ids:
        IF tx_id NOT IN mapped_by_tx:
          mapped_by_tx[tx_id] = UNCATEGORIZED_ID
  
    ── Step 5: Aggregate totals per category ───────────────────────────────────
    # Compute: category_id → sum of expense amounts from mapped_by_tx
    # Use the amounts from expense_rows dict keyed by tx_id.
  
    raw_totals: dict[int, float] = defaultdict(float)
    FOR tx_id, cat_id IN mapped_by_tx.items():
      raw_totals[cat_id] += ABS(expense_amounts[tx_id])
  
    ── Step 6: Determine visible node set ─────────────────────────────────────
    # A category node is visible if it or any descendant has expenses in period.
    # Walk raw_totals upward to mark ancestors visible.
  
    visible_ids: set[int] = set()
    node_totals: dict[int, float] = {}
  
    FOR category_id, total IN raw_totals.items():
      node_totals[category_id] = node_totals.get(category_id, 0) + total
      visible_ids.add(category_id)
  
      # Walk up to root, accumulate into ancestors
      current = cat_map[category_id]
      WHILE current.parent_id IS NOT NULL:
        parent = cat_map[current.parent_id]
        node_totals[parent.id] = node_totals.get(parent.id, 0) + total
        visible_ids.add(parent.id)
        current = parent
  
    total_expenses = sum(raw_totals.values())
  
    ── Step 7: Build expense category nodes ───────────────────────────────────
    # Build reverse index: category_id → list of transaction IDs assigned to it
    # Walk up the tree so parent nodes include all descendant transactions,
    # enabling drill-down panel on non-leaf category nodes.
    tx_ids_by_cat: dict[int, list[int]] = defaultdict(list)
    FOR tx_id, cat_id IN mapped_by_tx.items():
      tx_ids_by_cat[cat_id].append(tx_id)
      current = cat_map[cat_id]
      WHILE current.parent_id IS NOT NULL:
        tx_ids_by_cat[current.parent_id].append(tx_id)
        current = cat_map[current.parent_id]
  
    # direct_tx_ids_by_cat holds ONLY transactions mapped directly to this category
    # (not inherited from descendants). Used to detect non-leaf nodes with own transactions.
    direct_tx_ids_by_cat: dict[int, list[int]] = defaultdict(list)
    FOR tx_id, cat_id IN mapped_by_tx.items():
      direct_tx_ids_by_cat[cat_id].append(tx_id)
  
    # A category node has children if any other visible node references it as parent.
    nodes_with_children = {cat_map[c].parent_id for c in visible_ids if cat_map[c].parent_id in visible_ids}
  
    expense_nodes = [SankeyNode(id=EXPENSES_NODE_ID, name="Expenses")]
  
    FOR cat_id IN visible_ids:
      cat = cat_map[cat_id]
      expense_nodes.append(SankeyNode(
        id              = f"cat_{cat_id}",
        name            = cat.name,
        transaction_ids = tx_ids_by_cat.get(cat_id),   # enables drill-down panel
      ))
      # If this branch node also has directly-mapped transactions, emit a synthetic
      # child node so the Sankey stays balanced (inflow = outflow for every node).
      IF cat_id IN nodes_with_children AND direct_tx_ids_by_cat.get(cat_id):
        expense_nodes.append(SankeyNode(
          id              = f"cat_{cat_id}_direct",
          name            = f"{cat.name} (direct)",
          transaction_ids = direct_tx_ids_by_cat[cat_id],
        ))
  
    ── Step 8: Build expense links ────────────────────────────────────────────
    expense_links = []
  
    FOR cat_id IN visible_ids:
      cat = cat_map[cat_id]
  
      IF cat.parent_id IS NULL OR cat.parent_id NOT IN visible_ids:
        # This node's parent is not visible (or it's a root) →
        # link from EXPENSES node to this node.
        source = EXPENSES_NODE_ID
      ELSE:
        source = f"cat_{cat.parent_id}"
  
      expense_links.append(SankeyLink(
        source = source,
        target = f"cat_{cat_id}",
        value  = node_totals[cat_id],
      ))
      # Emit a link for any directly-mapped transactions on a branch node.
      # Without this the branch node inflow > outflow, breaking ECharts.
      IF cat_id IN nodes_with_children AND raw_totals.get(cat_id, 0) > 0:
        expense_links.append(SankeyLink(
          source = f"cat_{cat_id}",
          target = f"cat_{cat_id}_direct",
          value  = raw_totals[cat_id],
        ))
  
    ── Step 9: Balance node ────────────────────────────────────────────────────
    balance = total_income - total_expenses
    balance_node = None
    balance_link = None
  
    IF balance > 0:
      # Income exceeds expenses → Proficit is a right-side sink (expense column).
      # EXPENSES → PROFICIT is a forward left-to-right edge; ECharts renders it reliably.
      # depth hint omitted: ECharts places Proficit at depth=2 naturally.
      balance_node = SankeyNode(id=PROFICIT_NODE_ID, name="Proficit")
      balance_link = SankeyLink(
        source = EXPENSES_NODE_ID,
        target = PROFICIT_NODE_ID,
        value  = balance,
      )
  
    ELIF balance < 0:
      # Expenses exceed income → Deficit is a left-side source (income column).
      # DEFICIT → EXPENSES is a forward left-to-right edge; ECharts renders it reliably.
      # depth=2 was removed: it created a backward edge (depth 2→1) that ECharts
      # does not guarantee to render; ECharts places Deficit at depth=0 naturally.
      balance_node = SankeyNode(id=DEFICIT_NODE_ID, name="Deficit")
      # Add a synthetic income link for the deficit amount
      # so that EXPENSES node receives enough flow to distribute.
      balance_link = SankeyLink(
        source = DEFICIT_NODE_ID,
        target = EXPENSES_NODE_ID,
        value  = abs(balance),
      )
  
    ── Step 10: Assemble final payload ─────────────────────────────────────────
    all_nodes = income_nodes + expense_nodes
    all_links = income_links + expense_links
  
    IF balance_node:
      all_nodes.append(balance_node)
      all_links.append(balance_link)
  
    RETURN SankeyPayload(
      nodes          = all_nodes,
      links          = all_links,
      period_income  = total_income,
      period_expenses = total_expenses,
      balance        = balance,
    )
  ```
  
  **ECharts Sankey balance mechanics clarification:**
  
  ECharts requires that every node's inflow equals its outflow (except terminal sources and sinks). The `EXPENSES` intermediate node must have:
  - inflow = sum of all income transaction links → `total_income` (or `total_income + abs(balance)` if deficit)
  - outflow = sum of all category links + proficit link = `total_expenses + max(0, balance)`
  
  For **Proficit**: income > expenses. `EXPENSES` receives `total_income` inflow, distributes `total_expenses` to categories and `balance` to Proficit node. Proficit is a sink — no outflow required.
  
  For **Deficit**: expenses > income. `EXPENSES` needs `total_expenses` inflow but only receives `total_income`. The `Deficit` node is a synthetic source that contributes `abs(balance)` into `EXPENSES`. Deficit is a source — no inflow required.
  
  This produces a valid balanced Sankey that ECharts renders correctly.
  
  ---
  
  ## 13. Docker and Configuration
  
  ### `docker-compose.yml`
  
  ```yaml
  version: "3.9"
  
  services:
    backend:
      build:
        context: ./backend
        dockerfile: Dockerfile
      container_name: wimm-backend
      restart: unless-stopped
      environment:
        DATABASE_URL: "sqlite:////data/wimm.db"
        SQL_ECHO: "false"
        LOG_LEVEL: "INFO"
        LOG_FORMAT: "json"
        LOG_DIR: "/logs/backend"
        ML_MIN_CONFIDENCE: "0.3"
        ML_MIN_TRAINING_SAMPLES: "5"
        ML_NGRAM_MIN: "1"
        ML_NGRAM_MAX: "2"
        ML_MAX_FEATURES: "5000"
        ML_TOP_K: "3"
      volumes:
        - wimm_data:/data
        - ./logs/backend:/logs/backend
      ports:
        - "8000:8000"
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
        interval: 30s
        timeout: 5s
        retries: 3
  
    frontend:
      build:
        context: ./frontend
        dockerfile: Dockerfile
        args:
          VITE_API_BASE_URL: "/api"
      container_name: wimm-frontend
      restart: unless-stopped
      ports:
        - "5173:80"
      volumes:
        - ./logs/nginx:/var/log/nginx
      depends_on:
        backend:
          condition: service_healthy
  
  volumes:
    wimm_data:
      name: wimm_data
  ```
  
  **Note on `VITE_API_BASE_URL`:** Vite bakes env vars into the static bundle at build time. The `args` key passes it as a Docker build arg into the Dockerfile, which sets it as a build-time env var. The value `/api` is correct in both Docker and dev: nginx proxies `/api/` to the backend container, so the browser never needs to know the backend port. For local dev without Docker, set `VITE_API_BASE_URL=http://localhost:8000/api` in `frontend/.env`.
  
  ---
  
  ### `backend/Dockerfile`
  
  ```dockerfile
  FROM python:3.12-slim
  
  WORKDIR /app
  
  # System dependencies for pandas/scipy (scikit-learn needs these)
  RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
      && rm -rf /var/lib/apt/lists/*
  
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  
  COPY . .
  
  # Create data directory (will be overridden by volume mount)
  RUN mkdir -p /data
  
  EXPOSE 8000
  
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```
  
  **`backend/requirements.txt`:**
  
  ```
  fastapi==0.115.0
  uvicorn[standard]==0.30.6
  sqlalchemy==2.0.35
  alembic==1.13.3
  pydantic==2.9.2
  pydantic-settings==2.5.2
  pandas==2.2.3
  scikit-learn==1.5.2
  python-multipart==0.0.12
  aiofiles==24.1.0
  ```
  
  ---
  
  ### `frontend/Dockerfile`
  
  ```dockerfile
  # Stage 1: Build
  FROM node:20-alpine AS builder
  
  WORKDIR /app
  
  COPY package*.json ./
  RUN npm ci
  
  COPY . .
  
  ARG VITE_API_BASE_URL=/api
  ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
  
  RUN npm run build
  # Output in /app/dist
  
  # Stage 2: Serve with nginx
  FROM nginx:1.27-alpine
  
  COPY --from=builder /app/dist /usr/share/nginx/html
  COPY nginx.conf /etc/nginx/conf.d/default.conf
  
  EXPOSE 80
  
  CMD ["nginx", "-g", "daemon off;"]
  ```
  
  **`frontend/nginx.conf`:**
  
  ```nginx
  server {
      listen 80;
      server_name _;
  
      # Write access and error logs to the bind-mounted logs directory
      access_log /var/log/nginx/access.log;
      error_log  /var/log/nginx/error.log warn;
  
      root /usr/share/nginx/html;
      index index.html;
  
      # SPA routing: all non-asset paths serve index.html
      location / {
          try_files $uri $uri/ /index.html;
      }
  
      # Proxy API calls to backend container
      location /api/ {
          proxy_pass         http://wimm-backend:8000/api/;
          proxy_set_header   Host $host;
          proxy_set_header   X-Real-IP $remote_addr;
          proxy_read_timeout 60s;
      }
  
      # Static asset caching
      location ~* \.(js|css|png|svg|ico|woff2?)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
      }
  }
  ```
  
  **Important:** When running behind nginx, the frontend JavaScript does not need to know the backend's host/port — all `/api/` calls go through the nginx proxy, which forwards to `wimm-backend:8000` on Docker's internal network. The `VITE_API_BASE_URL` build arg should be set to `/api` (relative path) when deploying via Docker Compose, so that the JS uses nginx as the API gateway rather than calling `localhost:8000` directly.
  
  Update `docker-compose.yml` `args` accordingly:
  
  ```yaml
  args:
    VITE_API_BASE_URL: "/api"
  ```
  
  ---
  
  ### Environment Variable Contract
  
  | Variable | Service | Default | Description |
  |---|---|---|---|
  | `DATABASE_URL` | backend | `sqlite:////data/wimm.db` | SQLAlchemy connection string. The four slashes produce an absolute path `/data/wimm.db` inside the container. |
  | `SQL_ECHO` | backend | `false` | Set `true` to log all SQL statements (dev only). |
  | `LOG_LEVEL` | backend | `INFO` | Python logging level: `DEBUG`, `INFO`, `WARNING`, `ERROR`. Set `DEBUG` locally to see request/ML detail. |
  | `LOG_FORMAT` | backend | `text` | `text` for human-readable dev output; `json` for structured production output. |
  | `LOG_DIR` | backend | `/logs/backend` | Directory where the rotating log file `wimm.log` is written. Must exist before startup (Docker bind mount creates it automatically). |
  | `ML_MIN_CONFIDENCE` | backend | `0.3` | Minimum confidence score; suggestions below this are still returned but the frontend can suppress display. Range 0–1. |
  | `ML_MIN_TRAINING_SAMPLES` | backend | `5` | Minimum number of confirmed manual mappings required before the TF-IDF phase activates. Below this threshold Phase 2 is skipped entirely. |
  | `ML_NGRAM_MIN` | backend | `1` | Lower bound of the TF-IDF ngram range. Combined with `ML_NGRAM_MAX` to set `ngram_range=(min, max)`. |
  | `ML_NGRAM_MAX` | backend | `2` | Upper bound of the TF-IDF ngram range. Set both to `1` for unigrams only; default `(1,2)` includes bigrams (e.g., "NETFLIX SUBSCRIPTION" as a unit). |
  | `ML_MAX_FEATURES` | backend | `5000` | Maximum TF-IDF vocabulary size. Caps memory on large datasets. Increase for datasets with thousands of distinct payees. |
  | `ML_TOP_K` | backend | `3` | Number of nearest neighbors checked for category consensus. All `k` agreeing on the same category boosts confidence by 20% (capped at 1.0). |
  | `VITE_API_BASE_URL` | frontend (build-time) | `/api` | Base URL for the Axios client. In Docker Compose, use `/api` (nginx proxies). In local dev without Docker, use `http://localhost:8000/api`. |
  
  ---
  
  ### Developer Mode (no Docker)
  
  ```bash
  # Backend — from repo root
  cd backend
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  DATABASE_URL="sqlite:///./dev.db" uvicorn app.main:app --reload --port 8000
  
  # Frontend — from repo root (separate terminal)
  cd frontend
  npm install
  echo "VITE_API_BASE_URL=http://localhost:8000/api" > .env.local
  npm run dev
  # Vite serves on http://localhost:5173
  ```
  
  ---
  
  ### Health Check Endpoint
  
  Add a minimal health endpoint to `app/main.py` (not in any router file — keep it in main):
  
  ```python
  @app.get("/api/health")
  async def health():
      return {"status": "ok"}
  ```
  
  This satisfies the Docker Compose `healthcheck` and confirms the app has started and migrations have run.
  
  ---
  
  ### Critical Files for Implementation
  
  - `/home/i074568/SAPDevelop/experiments/wimm/backend/app/models.py`
  - `/home/i074568/SAPDevelop/experiments/wimm/backend/app/services/sankey_service.py`
  - `/home/i074568/SAPDevelop/experiments/wimm/backend/app/services/ml_suggester.py`
  - `/home/i074568/SAPDevelop/experiments/wimm/frontend/src/store/useAppStore.ts`
  - `/home/i074568/SAPDevelop/experiments/wimm/frontend/src/components/sankey/SankeyDiagram.tsx`
  ---
  
  ## 14. Unit and Integration Testing Strategy
  
  ---
  
  ### 14.1 Backend Testing (pytest)
  
  **Tooling**
  
  | Package | Role |
  |---|---|
  | `pytest` | Test runner |
  | `pytest-cov` | Coverage reporting |
  | `httpx` | ASGI test client (via `fastapi.testclient.TestClient`) |
  | `pytest-mock` / `unittest.mock` | Mocking ML vectorizer, file I/O |
  | `factory-boy` | Fixture factories for ORM objects |
  
  Add to `backend/requirements-test.txt`:
  ```
  pytest>=8.0
  pytest-cov>=5.0
  httpx>=0.27
  pytest-mock>=3.12
  factory-boy>=3.3
  ```
  
  **Directory structure**
  
  ```
  backend/
  └── tests/
      ├── conftest.py              # DB fixture, TestClient, sample data
      ├── test_csv_importer.py
      ├── test_ml_suggester.py
      ├── test_category_service.py
      ├── test_sankey_service.py
      ├── routers/
      │   ├── test_banks.py
      │   ├── test_imports.py
      │   ├── test_transactions.py
      │   ├── test_categories.py
      │   ├── test_mappings.py
      │   ├── test_suggestions.py
      │   └── test_sankey.py
      └── factories.py             # factory-boy model factories
  ```
  
  **`tests/conftest.py`**
  
  ```python
  import pytest
  from contextlib import asynccontextmanager
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker
  from fastapi.testclient import TestClient
  
  from app.main import app
  from app.database import get_db
  from app.models import Base
  
  @pytest.fixture(scope="function")
  def db_engine():
      from sqlalchemy import event
      engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
      @event.listens_for(engine, "connect")
      def set_sqlite_pragma(dbapi_connection, connection_record):
          dbapi_connection.execute("PRAGMA foreign_keys=ON")
      Base.metadata.create_all(engine)
      yield engine
      Base.metadata.drop_all(engine)
  
  @pytest.fixture(scope="function")
  def db(db_engine):
      Session = sessionmaker(bind=db_engine)
      session = Session()
      # Seed system "Uncategorized" category (id=1)
      from app.models import Category
      session.add(Category(id=1, name="Uncategorized", parent_id=None, sort_order=0))
      session.commit()
      yield session
      session.close()
  
  @pytest.fixture(scope="function")
  def client(db):
      app.dependency_overrides[get_db] = lambda: db
      # Override lifespan to skip Alembic subprocess against the real database
      @asynccontextmanager
      async def noop_lifespan(app):
          yield
      original_lifespan = app.router.lifespan_context
      app.router.lifespan_context = noop_lifespan
      try:
          with TestClient(app) as c:
              yield c
      finally:
          del app.dependency_overrides[get_db]
          app.router.lifespan_context = original_lifespan
  ```
  
  **`tests/factories.py`**
  
  ```python
  import factory
  import uuid
  from factory.alchemy import SQLAlchemyModelFactory
  from app.models import Bank, Transaction, Category, Mapping
  
  class BankFactory(SQLAlchemyModelFactory):
      class Meta:
          model = Bank
      name = factory.Sequence(lambda n: f"Bank {n}")
      column_map = {"date": 0, "amount": 1, "description": 2}
      date_format = "%Y-%m-%d"
      skip_header_rows = 0
      skip_footer_rows = 0
      encoding = "utf-8"
  
  class TransactionFactory(SQLAlchemyModelFactory):
      class Meta:
          model = Transaction
      bank = factory.SubFactory(BankFactory)
      date = "2025-01-15"
      amount = factory.Faker("pydecimal", left_digits=4, right_digits=2, positive=False)
      description = factory.Faker("sentence", nb_words=4)
      type = "expense"
      dedup_key = factory.LazyAttribute(lambda o: f"test:{uuid.uuid4().hex}")
  class CategoryFactory(SQLAlchemyModelFactory):
      class Meta:
          model = Category
      name = factory.Sequence(lambda n: f"Category {n}")
      parent_id = None
      sort_order = factory.Sequence(lambda n: n)
  ```
  
  ---
  
  ### 14.2 Service Tests
  
  #### `tests/test_csv_importer.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_import_basic_csv` | Parses 3-row CSV; inserts 3 transactions; returns correct summary |
  | `test_import_dedup_by_hash` | Importing the same file twice → 0 new on second import |
  | `test_import_dedup_by_external_id` | Bank with `column_map.transaction_id` set → dedup by external ID |
  | `test_import_skip_rows` | `skip_header_rows=2, skip_footer_rows=1` → correct rows parsed |
  | `test_import_income_positive` | Positive amount rows classified as `type="income"` |
  | `test_import_expense_negative` | Negative amount rows classified as `type="expense"` |
  | `test_import_encoding_latin1` | CSV with `encoding=latin-1` → decoded correctly |
  | `test_import_invalid_date_format` | Mismatched `date_format` → raises `CSVParseError` |
  | `test_import_missing_required_column` | CSV missing amount column → raises `CSVParseError` |
  
  #### `tests/test_ml_suggester.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_exact_match_returns_confidence_1` | Description matches normalized existing mapping → confidence=1.0 |
  | `test_tfidf_fallback_returns_closest_category` | Novel description → nearest TF-IDF neighbor category returned |
  | `test_suggestions_for_empty_corpus` | No existing mappings → returns empty list gracefully |
  | `test_vectorizer_invalidated_after_new_mapping` | After adding a manual mapping, `_cache_valid` flag is False |
  | `test_confidence_boosted_when_top3_agree` | Top-3 cosine results share the same category → confidence > base |
  | `test_below_min_confidence_still_returned` | Low-confidence result still appears in output (filtering is frontend concern) |
  
  #### `tests/test_category_service.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_build_tree` | Flat list of categories → correctly nested tree dict |
  | `test_delete_leaf_with_mappings` | Deleting category with mappings reassigns all to id=1 |
  | `test_delete_parent_reassigns_all_descendants` | Recursive delete reassigns transactions from all child categories |
  | `test_cannot_delete_uncategorized` | `delete_category(1, db)` → raises `ProtectedCategoryError` |
  | `test_cannot_rename_uncategorized` | `rename_category(1, "x", db)` → raises `ProtectedCategoryError` |
  | `test_move_node_updates_parent_id` | `move_category(child_id, new_parent_id)` → `parent_id` updated correctly |
  | `test_subtree_aggregation` | Recursive CTE sums amounts from parent and all descendants |
  
  #### `tests/test_sankey_service.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_income_nodes_one_per_transaction` | 3 income txns → 3 income nodes in result |
  | `test_expense_nodes_per_category` | 2 expense categories → 2 expense nodes + "Expenses" separator |
  | `test_proficit_when_income_exceeds_expenses` | Income 1000, expenses 800 → "Proficit" node on expense side (right), value=200 |
  | `test_deficit_when_expenses_exceed_income` | Income 800, expenses 1000 → "Deficit" node on income side (left), value=200 |
  | `test_balanced_no_extra_node` | Income exactly equals expenses → no Proficit or Deficit node |
  | `test_empty_period_returns_empty_payload` | No transactions in period → `{"nodes": [], "links": []}` |
  | `test_unmapped_expense_falls_back_to_ml` | Expense with no mapping → ML is called → expense appears under ML-suggested category node |
  | `test_unmapped_expense_no_ml_data_falls_to_uncategorized` | No training data (< ml_min_training_samples) → unmapped expense grouped under Uncategorized |
  | `test_sankey_ml_returns_deleted_category_safety_net` | ML suggests category_id that no longer exists → expense grouped under Uncategorized |
  | `test_unmapped_and_mapped_expenses_combined` | Mix of user-mapped and ML-implied expenses → totals per category are correct |
  
  ---
  
  ### 14.3 Router Tests (integration via TestClient)
  
  These hit the HTTP layer end-to-end against an in-memory SQLite DB.
  
  #### `tests/routers/test_banks.py`
  
  | Test | Endpoint | What it verifies |
  |---|---|---|
  | `test_list_banks_empty` | GET /api/banks | Returns 200 `[]` on empty DB |
  | `test_create_bank` | POST /api/banks | Returns 201 with created bank; persisted in DB |
  | `test_create_bank_missing_column_map` | POST /api/banks | Returns 422 (missing required field) |
  | `test_get_bank_by_id` | GET /api/banks/{id} | Returns 200 with correct bank |
  | `test_get_bank_not_found` | GET /api/banks/999 | Returns 404 |
  | `test_update_bank` | PUT /api/banks/{id} | Returns 200; DB row updated |
  | `test_delete_bank_with_transactions` | DELETE /api/banks/{id} | Returns 409 (bank has transactions) |
  | `test_delete_empty_bank` | DELETE /api/banks/{id} | Returns 204; bank removed |
  
  #### `tests/routers/test_imports.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_upload_valid_csv` | 201 response; `new_transactions` > 0 |
  | `test_upload_duplicate_csv` | 200 response; `new_transactions=0`, `duplicate_transactions` > 0 |
  | `test_upload_wrong_bank_id` | 404 when bank_id not found |
  | `test_upload_malformed_csv` | 422 with error detail |
  | `test_upload_triggers_suggestions` | After import, newly created expenses have ML suggestions available via POST /api/suggestions |
  
  #### `tests/routers/test_categories.py`
  
  | Test | Endpoint | What it verifies |
  |---|---|---|
  | `test_get_tree` | GET /api/categories | Returns nested tree structure |
  | `test_create_category` | POST /api/categories | 201; appears in tree |
  | `test_rename_category` | PUT /api/categories/{id} | Name updated |
  | `test_rename_uncategorized_rejected` | PUT /api/categories/1 | 403 |
  | `test_delete_category_reassigns` | DELETE /api/categories/{id} | Mapped transactions → category_id=1 |
  | `test_delete_uncategorized_rejected` | DELETE /api/categories/1 | 403 |
  | `test_move_category` | PATCH /api/categories/{id}/move | parent_id updated |
  
  #### `tests/routers/test_mappings.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_create_mapping` | First POST → 201; mapping row in DB |
  | `test_reassign_mapping_returns_200` | Second POST same `transaction_id`, different `category_id` → 200; DB row updated; no duplicate rows |
  | `test_reassign_does_not_create_duplicate` | After reassign, `SELECT COUNT(*) FROM mappings WHERE transaction_id=X` = 1 |
  | `test_create_mapping_income_transaction` | 400 when transaction.type = 'income' |
  | `test_create_mapping_nonexistent_transaction` | 404 |
  | `test_create_mapping_nonexistent_category` | 404 |
  | `test_delete_mapping` | 204; row removed; transaction visible as unmapped |
  
  #### `tests/routers/test_sankey.py`
  
  | Test | What it verifies |
  |---|---|
  | `test_sankey_valid_period` | GET /api/sankey?date_from=…&date_to=… → valid ECharts payload |
  | `test_sankey_missing_start_param` | 422 |
  | `test_sankey_start_after_end` | 400 |
  | `test_sankey_empty_period` | 200 `{"nodes":[],"links":[]}` |
  
  ---
  
  ### 14.4 Frontend Testing (Vitest + React Testing Library)
  
  **Tooling**
  
  | Package | Role |
  |---|---|
  | `vitest` | Test runner (Vite-native, replaces Jest) |
  | `@testing-library/react` | Component rendering and queries |
  | `@testing-library/user-event` | Simulates user interactions |
  | `msw` (Mock Service Worker) | Intercepts HTTP requests in tests; replaces real API |
  | `@testing-library/jest-dom` | Custom matchers (`toBeInTheDocument`, etc.) |
  
  Add to `frontend/package.json` devDependencies:
  ```json
  {
    "vitest": "^1.6",
    "@vitest/ui": "^1.6",
    "@testing-library/react": "^16.0",
    "@testing-library/user-event": "^14.5",
    "@testing-library/jest-dom": "^6.4",
    "msw": "^2.3"
  }
  ```
  
  **Directory structure**
  
  ```
  frontend/src/
  └── __tests__/
      ├── setup.ts                  # global jest-dom matchers, MSW server start/stop
      ├── mocks/
      │   ├── handlers.ts           # MSW request handlers (one per API resource)
      │   └── server.ts             # MSW server setup for Node (tests)
      ├── hooks/
      │   ├── useBanks.test.ts
      │   ├── useImport.test.ts
      │   ├── useCategoryTree.test.ts
      │   ├── useMappings.test.ts
      │   ├── useSuggestions.test.ts
      │   └── useSankeyData.test.ts
      └── components/
          ├── CategoryTree.test.tsx
          ├── TransactionTable.test.tsx
          ├── SankeyDiagram.test.tsx
          ├── ImportModal.test.tsx
          └── DateRangePicker.test.tsx
  ```
  
  **`src/__tests__/setup.ts`**
  
  ```typescript
  import "@testing-library/jest-dom";
  import { server } from "./mocks/server";
  
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  ```
  
  **`src/__tests__/mocks/handlers.ts` (excerpt)**
  
  ```typescript
  import { http, HttpResponse } from "msw";
  
  export const handlers = [
    http.get("/api/categories", () =>
      HttpResponse.json([
        { id: 1, name: "Uncategorized", parent_id: null, children: [] },
        { id: 2, name: "Food", parent_id: null, children: [] },
      ])
    ),
    http.get("/api/transactions", ({ request }) => {
      const url = new URL(request.url);
      const type = url.searchParams.get("type");
      return HttpResponse.json({ items: mockTransactions.filter(t => !type || t.type === type), total: 10 });
    }),
    http.post("/api/mappings", () => HttpResponse.json({ id: 1 }, { status: 201 })),
    http.get("/api/sankey", () => HttpResponse.json(mockSankeyPayload)),
    // ... additional handlers
  ];
  ```
  
  **`vitest.config.ts`**
  
  ```typescript
  import { defineConfig } from "vitest/config";
  import react from "@vitejs/plugin-react";
  
  export default defineConfig({
    plugins: [react()],
    test: {
      environment: "jsdom",
      setupFiles: ["./src/__tests__/setup.ts"],
      globals: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        exclude: ["src/__tests__/**", "src/main.tsx"],
      },
    },
  });
  ```
  
  ---
  
  ### 14.5 Frontend Hook Tests
  
  All hook tests use a `renderHook` wrapper that provides a `QueryClientProvider` with a fresh `QueryClient` (no retries, no cache time):
  
  ```typescript
  // src/__tests__/hooks/testUtils.tsx
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { renderHook } from "@testing-library/react";
  
  export function renderHookWithQuery<T>(hook: () => T) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(hook, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
  }
  ```
  
  | Hook test | Cases |
  |---|---|
  | `useBanks.test.ts` | Loads banks list; `createBank` adds to cache; `deleteBank` removes from cache |
  | `useImport.test.ts` | `importCsv` returns `{ new_transactions, duplicate_transactions }`; on success invalidates `["transactions"]` and `["sankey"]` |
  | `useCategoryTree.test.ts` | Returns nested tree; `renameCategory` updates cache optimistically; `deleteCategory` removes node from tree |
  | `useMappings.test.ts` | `assignMapping` posts mapping; invalidates `["transactions"]` and `["sankey"]` |
  | `useSuggestions.test.ts` | Returns suggestions per transaction_id; stale after mapping assigned |
  | `useSankeyData.test.ts` | Fetches with date params; re-fetches when date range changes |
  
  ---
  
  ### 14.6 Frontend Component Tests
  
  #### `CategoryTree.test.tsx`
  
  | Test | What it verifies |
  |---|---|
  | Renders tree nodes from mock data | Tree items visible in DOM |
  | Clicking "Add child" calls `onAdd` callback | `onAdd` called with parent node id |
  | Double-clicking node enters rename mode | Input field appears in place of label |
  | Submitting rename calls `onRename` with new name | Callback called with `(nodeId, newName)` |
  | Clicking delete icon calls `onDelete` callback | `onDelete` called with node id |
  | "Uncategorized" node has no delete/rename actions | Those actions absent from DOM for id=1 |
  
  #### `TransactionTable.test.tsx`
  
  | Test | What it verifies |
  |---|---|
  | Renders rows for each transaction | Row count matches mock data |
  | Category column shows suggestion badge for unmapped tx | ML suggestion chip visible |
  | Clicking category badge opens category selector | Selector visible |
  | Selecting category calls `onAssign` | Callback called with `(txId, categoryId)` |
  | Pagination controls work | Page 2 click fires callback with correct offset |
  
  #### `ImportModal.test.tsx`
  
  | Test | What it verifies |
  |---|---|
  | File input accepts CSV files | Input has `accept=".csv"` |
  | Bank selector shows all banks from mock | All bank names rendered |
  | Submitting with file and bank calls `onImport` | `onImport` called with `(file, bankId)` |
  | Submit disabled without file or bank | Button disabled |
  | Success state shows import summary | `"12 new"` text visible |
  
  #### `SankeyDiagram.test.tsx`
  
  | Test | What it verifies |
  |---|---|
  | Renders ECharts container | Container div present in DOM |
  | Shows loading skeleton while fetching | Skeleton visible when `isLoading=true` |
  | Shows empty state when no data | "No data" message visible when nodes=[] |
  
  ---
  
  ### 14.7 Coverage Targets
  
  | Area | Target |
  |---|---|
  | Backend service layer | ≥ 90% line coverage |
  | Backend routers | ≥ 85% line coverage |
  | Frontend hooks | ≥ 85% line coverage |
  | Frontend components | ≥ 75% line coverage (UI rendering paths) |
  
  Run backend coverage:
  ```bash
  cd backend
  pytest --cov=app --cov-report=term-missing tests/
  ```
  
  Run frontend coverage:
  ```bash
  cd frontend
  npm run test -- --coverage
  ```
  
  ---
  
  ### 14.8 Test Execution in Docker
  
  Add a `test` stage to `backend/Dockerfile`:
  
  ```dockerfile
  FROM backend-base AS test
  RUN pip install -r requirements-test.txt
  CMD ["pytest", "--cov=app", "tests/"]
  ```
  
  Add a test service to `docker-compose.yml` (optional, CI-oriented):
  
  ```yaml
  backend-test:
    build:
      context: ./backend
      target: test
    environment:
      DATABASE_URL: "sqlite:///:memory:"
    profiles: ["test"]
  ```
  
  Run tests without starting the full stack:
  ```bash
  docker compose --profile test run --rm backend-test
  ```

  ---
  
  ## 15. Code Quality: Linting, Type Checking, and Repository Hygiene
  
  ---
  
  ### 15.1 `.gitignore`
  
  Root `.gitignore` must include these entries to prevent the SQLite database, secrets, and build artifacts from being committed:
  
  ```gitignore
  # SQLite database files (dev and prod)
  *.db
  *.db-shm
  *.db-wal
  /data/
  backend/dev.db
  
  # Runtime log files — never commit logs
  /logs/
  
  # Python
  __pycache__/
  *.py[cod]
  .venv/
  .mypy_cache/
  .ruff_cache/
  .coverage
  htmlcov/
  dist/
  
  # Frontend
  frontend/node_modules/
  frontend/dist/
  frontend/.env.local
  frontend/.env.*.local
  
  # Docker / OS
  .DS_Store
  ```
  
  **Why this matters:** `wimm.db` contains all user financial data. A single accidental `git add -A` would expose it. The `*.db` glob also catches any sqlite temp file created during tests. The `/logs/` glob prevents log files — which may contain transaction descriptions or import filenames — from being committed.
  
  ---
  
  ### 15.2 Backend: Python Type Checking (mypy)
  
  **Tooling: `mypy` with strict mode enabled.**
  
  Add to `backend/requirements-dev.txt` (separate from test requirements; used in CI and local dev):
  ```
  mypy>=1.11
  types-aiofiles>=24.1
  pandas-stubs>=2.2
  ```
  
  **`backend/pyproject.toml` — mypy configuration:**
  
  ```toml
  [tool.mypy]
  python_version = "3.12"
  strict = true
  ignore_missing_imports = false
  plugins = ["pydantic.mypy"]
  
  # These third-party packages lack stubs; suppress noise there only
  [[tool.mypy.overrides]]
  module = ["sklearn.*", "alembic.*"]
  ignore_missing_imports = true
  ```
  
  `strict = true` enables: `--disallow-untyped-defs`, `--disallow-any-generics`, `--warn-return-any`, `--no-implicit-optional`, `--warn-unreachable`, etc.
  
  **Run locally:**
  ```bash
  cd backend
  mypy app/
  ```
  
  **What to type-annotate:**
  - All function signatures in `app/routers/`, `app/services/`, `app/models.py`, `app/schemas/`
  - SQLAlchemy 2.x ORM models use `Mapped[T]` annotations — these are already compatible with mypy
  - Service return types must be explicit (no `-> Any`)
  
  ---
  
  ### 15.3 Backend: Linting and Style (ruff)
  
  **Tooling: `ruff` — replaces flake8, isort, pyupgrade, and partially black in a single fast linter.**
  
  Add to `backend/requirements-dev.txt`:
  ```
  ruff>=0.6
  ```
  
  **`backend/pyproject.toml` — ruff configuration:**
  
  ```toml
  [tool.ruff]
  target-version = "py312"
  line-length = 100
  
  [tool.ruff.lint]
  select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort (import ordering)
    "UP",  # pyupgrade (use modern Python syntax)
    "B",   # flake8-bugbear (common bugs and design issues)
    "C4",  # flake8-comprehensions
    "SIM", # flake8-simplify
  ]
  ignore = [
    "E501",  # line too long (handled by formatter)
  ]
  
  [tool.ruff.lint.isort]
  known-first-party = ["app"]
  
  [tool.ruff.format]
  # ruff format acts as a Black replacement
  quote-style = "double"
  indent-style = "space"
  ```
  
  **Run locally:**
  ```bash
  cd backend
  ruff check app/ tests/         # lint
  ruff format app/ tests/        # format (auto-fix)
  ruff check --fix app/ tests/   # lint + auto-fix safe violations
  ```
  
  ---
  
  ### 15.4 Frontend: Type Checking (TypeScript)
  
  TypeScript is already in the stack (Vite + `tsc`). Enforce strict checking.
  
  **`frontend/tsconfig.json` — strict settings required:**
  
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "react-jsx",
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true,
      "noUncheckedIndexedAccess": true,
      "skipLibCheck": false
    }
  }
  ```
  
  **`"strict": true`** enables: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`.
  
  **Run type check (no emit):**
  ```bash
  cd frontend
  npx tsc --noEmit
  ```
  
  This must pass before any PR merges. The Vite build (`npm run build`) does NOT type-check — `tsc --noEmit` is required separately.
  
  ---
  
  ### 15.5 Frontend: Linting and Style (ESLint + Prettier)
  
  **Tooling:**
  
  Add to `frontend/package.json` devDependencies (alongside test tooling):
  ```json
  {
    "eslint": "^9.0",
    "@eslint/js": "^9.0",
    "typescript-eslint": "^8.0",
    "eslint-plugin-react": "^7.37",
    "eslint-plugin-react-hooks": "^5.0",
    "eslint-plugin-import": "^2.31",
    "prettier": "^3.3",
    "eslint-config-prettier": "^9.1"
  }
  ```
  
  **`frontend/eslint.config.js` (flat config — ESLint 9):**
  
  ```javascript
  import js from "@eslint/js";
  import tseslint from "typescript-eslint";
  import reactPlugin from "eslint-plugin-react";
  import reactHooks from "eslint-plugin-react-hooks";
  import importPlugin from "eslint-plugin-import";
  import prettierConfig from "eslint-config-prettier";
  
  export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    prettierConfig,
    {
      plugins: {
        react: reactPlugin,
        "react-hooks": reactHooks,
        import: importPlugin,
      },
      languageOptions: {
        parserOptions: {
          project: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        "react/react-in-jsx-scope": "off",        // not needed with React 17+ JSX transform
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "import/order": ["warn", { "newlines-between": "always" }],
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-explicit-any": "error",
      },
      settings: {
        react: { version: "detect" },
      },
    }
  );
  ```
  
  **`frontend/.prettierrc`:**
  
  ```json
  {
    "printWidth": 100,
    "singleQuote": false,
    "trailingComma": "es5",
    "semi": true,
    "tabWidth": 2
  }
  ```
  
  **`frontend/package.json` scripts to add:**
  ```json
  {
    "scripts": {
      "lint":       "eslint src/",
      "lint:fix":   "eslint src/ --fix",
      "format":     "prettier --write src/",
      "format:check": "prettier --check src/",
      "typecheck":  "tsc --noEmit"
    }
  }
  ```
  
  **Run locally:**
  ```bash
  cd frontend
  npm run lint          # ESLint
  npm run typecheck     # TypeScript strict check
  npm run format:check  # Prettier format check (CI-safe, no writes)
  npm run format        # Auto-format (local dev)
  ```
  
  ---
  
  ### 15.6 All-in-One Quality Check Script
  
  Add `scripts/check.sh` at repo root for local pre-commit / CI use:
  
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  
  echo "=== Backend: ruff lint ==="
  (cd backend && ruff check app/ tests/)
  
  echo "=== Backend: ruff format check ==="
  (cd backend && ruff format --check app/ tests/)
  
  echo "=== Backend: mypy ==="
  (cd backend && mypy app/)
  
  echo "=== Backend: pytest ==="
  (cd backend && pytest --tb=short tests/)
  
  echo "=== Frontend: ESLint ==="
  (cd frontend && npm run lint)
  
  echo "=== Frontend: TypeScript ==="
  (cd frontend && npm run typecheck)
  
  echo "=== Frontend: Prettier ==="
  (cd frontend && npm run format:check)
  
  echo "=== Frontend: Vitest ==="
  (cd frontend && npm test -- --run)
  
  echo ""
  echo "All checks passed."
  ```
  
  ```bash
  chmod +x scripts/check.sh
  ./scripts/check.sh
  ```
  
  ---
  
  ### 15.7 Updated `requirements-dev.txt`
  
  ```
  # backend/requirements-dev.txt
  # Type checking
  mypy>=1.11
  types-aiofiles>=24.1
  pandas-stubs>=2.2
  
  # Linting / formatting
  ruff>=0.6
  
  # Testing (can also live here rather than requirements-test.txt)
  pytest>=8.0
  pytest-cov>=5.0
  httpx>=0.27
  pytest-mock>=3.12
  factory-boy>=3.3
  ```
  
  Install in dev:
  ```bash
  cd backend
  pip install -r requirements.txt -r requirements-dev.txt
  ```
  
  ---
  
  ### 15.8 Updated Backend `Dockerfile` — static analysis in CI target
  
  Add an `analysis` stage after `test` in `backend/Dockerfile`:
  
  ```dockerfile
  FROM backend-base AS analysis
  RUN pip install --no-cache-dir -r requirements-dev.txt
  CMD ["bash", "-c", "ruff check app/ && ruff format --check app/ && mypy app/"]
  ```
  
  Run in CI (no DB needed):
  ```bash
  docker compose --profile ci run --rm backend-analysis
  ```
  
  ---
  
  ## 16. Logging
  
  WIMM is a personal, single-user app running locally, so logging serves two purposes: **debugging during development** and **auditability of data-changing operations** (imports, mapping changes, category deletions). Logs go to two destinations: **stdout** (readable via `docker compose logs`) and a **rotating file** inside the `logs/` directory at the repository root. The `logs/` directory is excluded from git; it is created automatically by Docker Compose bind mounts.
  
  ---
  
  ### 16.1 Backend Logging
  
  #### Tooling
  
  Python's built-in `logging` module configured via `logging.config.dictConfig`. No third-party logging library is needed.
  
  Add to `backend/app/logging_config.py`:
  
  ```python
  import logging.config
  import os
  from app.config import settings
  
  TEXT_FORMAT = "%(asctime)s %(levelname)-8s %(name)s — %(message)s"
  DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"
  
  def configure_logging() -> None:
      """Call once at application startup (in main.py lifespan)."""
      formatter_key = "json" if settings.log_format == "json" else "text"
  
      # Ensure the log directory exists (relevant when running without Docker)
      os.makedirs(settings.log_dir, exist_ok=True)
      log_file = os.path.join(settings.log_dir, "wimm.log")
  
      stdout_handler: dict = {
          "class": "logging.StreamHandler",
          "stream": "ext://sys.stdout",
          "formatter": formatter_key,
      }
      file_handler: dict = {
          "class": "logging.handlers.RotatingFileHandler",
          "filename": log_file,
          "maxBytes": 10 * 1024 * 1024,   # 10 MB per file
          "backupCount": 5,                # keep wimm.log + 5 rotated backups
          "encoding": "utf-8",
          "formatter": formatter_key,
      }
  
      logging.config.dictConfig({
          "version": 1,
          "disable_existing_loggers": False,
          "formatters": {
              "text": {
                  "format": TEXT_FORMAT,
                  "datefmt": DATE_FORMAT,
              },
              "json": {
                  # stdlib-compatible JSON formatter; no external dependency.
                  # Each record is emitted as a single JSON line.
                  "()": "app.logging_config.JsonFormatter",
              },
          },
          "handlers": {
              "stdout": stdout_handler,
              "file":   file_handler,
          },
          "loggers": {
              # Application loggers
              "app": {
                  "handlers": ["stdout", "file"],
                  "level": settings.log_level.upper(),
                  "propagate": False,
              },
              # Suppress SQLAlchemy query noise unless SQL_ECHO is enabled
              "sqlalchemy.engine": {
                  "handlers": ["stdout", "file"],
                  "level": "INFO" if settings.sql_echo else "WARNING",
                  "propagate": False,
              },
              # Suppress verbose third-party loggers
              "uvicorn.access": {
                  "handlers": ["stdout", "file"],
                  "level": "WARNING",   # access log handled by the request middleware instead
                  "propagate": False,
              },
          },
          "root": {
              "handlers": ["stdout", "file"],
              "level": "WARNING",
          },
      })
  
  
  class JsonFormatter(logging.Formatter):
      """Emit each log record as a single JSON line."""
  
      def format(self, record: logging.LogRecord) -> str:
          import json, traceback as tb
  
          payload: dict = {
              "ts": self.formatTime(record, DATE_FORMAT),
              "level": record.levelname,
              "logger": record.name,
              "msg": record.getMessage(),
          }
          if record.exc_info:
              payload["exc"] = tb.format_exception(*record.exc_info)
          # Merge any extra fields passed via logger.info("...", extra={...})
          for key, val in record.__dict__.items():
              if key not in logging.LogRecord.__dict__ and not key.startswith("_"):
                  payload[key] = val
          return json.dumps(payload, default=str)
  ```
  
  Call `configure_logging()` at the very start of `lifespan` in `app/main.py`, before any router is loaded:
  
  ```python
  @asynccontextmanager
  async def lifespan(app: FastAPI):
      from app.logging_config import configure_logging
      configure_logging()
      logger = logging.getLogger("app.main")
      logger.info("WIMM backend starting up")
      # run migrations …
      yield
      logger.info("WIMM backend shutting down")
  ```
  
  #### Logger Names and Hierarchy
  
  Every module acquires its logger with `logger = logging.getLogger(__name__)`. Because the root package is `app`, all application loggers sit under the `app.*` hierarchy and inherit the level set in `configure_logging`.
  
  | Module | Logger name | Notes |
  |---|---|---|
  | `app.main` | `app.main` | Startup/shutdown |
  | `app.middleware` | `app.middleware` | Per-request access log |
  | `app.routers.imports` | `app.routers.imports` | Import operations |
  | `app.services.csv_importer` | `app.services.csv_importer` | Parse detail |
  | `app.services.ml_suggester` | `app.services.ml_suggester` | Model lifecycle |
  | `app.services.sankey_service` | `app.services.sankey_service` | Build timing |
  | `app.services.category_service` | `app.services.category_service` | Mutations |
  | `app.exceptions` | `app.exceptions` | 5xx tracebacks |
  
  #### Request / Access Logging (Middleware)
  
  Add a lightweight middleware in `app/main.py` that logs method, path, status code, and elapsed time for every request. This replaces the noisy uvicorn access log (suppressed above).
  
  ```python
  import time, logging
  from starlette.middleware.base import BaseHTTPMiddleware
  from starlette.requests import Request
  
  _access_log = logging.getLogger("app.middleware")
  
  class AccessLogMiddleware(BaseHTTPMiddleware):
      async def dispatch(self, request: Request, call_next):
          start = time.perf_counter()
          response = await call_next(request)
          ms = round((time.perf_counter() - start) * 1000)
          _access_log.info(
              "%s %s → %d (%d ms)",
              request.method,
              request.url.path,
              response.status_code,
              ms,
              extra={"method": request.method, "path": request.url.path,
                     "status": response.status_code, "duration_ms": ms},
          )
          return response
  ```
  
  Register it in `app/main.py` before the CORS middleware so all requests are timed.
  
  #### What to Log and at Which Level
  
  **`DEBUG`** — high-frequency detail, off in production:
  - Each CSV row parsed (row number, parsed date, amount, dedup_key)
  - Each ML suggestion result (transaction_id, method, confidence)
  - Sankey: count of unmapped transactions sent to ML
  
  **`INFO`** — operational events, always on:
  - Application startup / shutdown
  - `POST /api/import` completed: `"Imported bank_id=%d: %d new, %d dupes, %d failed, batch_id=%d"`
  - ML vectorizer rebuilt: `"ML cache rebuilt: %d training samples, vocabulary=%d"`
  - ML cache invalidated (with reason): `"ML cache invalidated (reason: new_mapping)"`
  - Category deleted (id, name, subtree size, reassigned mapping count)
  - Sankey built: `"Sankey built for %s–%s: %d nodes, %d links, %d ml_inferences"`
  
  **`WARNING`** — unexpected but recoverable:
  - ML vectorizer rebuild attempted with fewer than `ml_min_training_samples` (too few to model)
  - CSV row parse failure within an otherwise-successful import
  - ML suggestion returned a deleted category_id (safety net fallback triggered)
  
  **`ERROR`** — failures that returned a 5xx or caused data inconsistency:
  - Unhandled exceptions (already logged by the generic exception handler in `app/exceptions.py`)
  - DB commit failures
  
  #### Concrete Log Points per Module
  
  ```python
  # app/services/csv_importer.py
  logger = logging.getLogger(__name__)
  
  # after bulk insert:
  logger.info(
      "Import complete: bank_id=%d batch_id=%d new=%d dupes=%d failed=%d",
      bank.id, batch.id, inserted, len(rows) - inserted, len(failed_rows),
  )
  # per failed row (DEBUG so it doesn't flood INFO logs):
  logger.debug("Row %d failed: %s", row_num, error_message)
  ```
  
  ```python
  # app/services/ml_suggester.py
  logger = logging.getLogger(__name__)
  
  def invalidate(self, reason: str = "unspecified") -> None:
      with self._lock:
          self._cache_valid = False
      logger.info("ML cache invalidated (reason: %s)", reason)
  
  def _rebuild_cache(self, db: Session) -> None:
      # … build …
      if len(rows) < settings.ml_min_training_samples:
          logger.warning(
              "ML rebuild skipped: only %d training samples (min=%d)",
              len(rows), settings.ml_min_training_samples,
          )
      else:
          vocab = len(self._vectorizer.vocabulary_) if self._vectorizer else 0
          logger.info("ML cache rebuilt: %d training samples, vocabulary=%d", len(rows), vocab)
  ```
  
  ```python
  # app/services/sankey_service.py
  logger = logging.getLogger(__name__)
  
  # at end of build_sankey():
  logger.info(
      "Sankey built for %s–%s: %d nodes, %d links, %d ml_inferences (%.0f ms)",
      date_from, date_to, len(all_nodes), len(all_links), len(unmapped_ids), elapsed_ms,
  )
  ```
  
  ```python
  # app/services/category_service.py
  logger = logging.getLogger(__name__)
  
  # in delete_category():
  logger.info(
      "Category deleted: id=%d subtree_size=%d mappings_reassigned=%d",
      category_id, len(subtree_ids), reassigned_count,
  )
  ```
  
  #### 500-Error Logging (already in `app/exceptions.py`)
  
  The generic exception handler already logs the full traceback. Replace the inline `import logging` with the module-level logger for consistency:
  
  ```python
  # app/exceptions.py
  import logging
  logger = logging.getLogger(__name__)
  
  # in generic_handler:
  logger.error("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
  ```
  
  ---
  
  ### 16.2 Frontend Logging
  
  #### Tooling
  
  A thin wrapper around `console` in `src/utils/logger.ts`. No external package. Log level is controlled by a build-time Vite env var `VITE_LOG_LEVEL`; defaults to `"debug"` in dev mode and `"warn"` in production.
  
  **`src/utils/logger.ts`:**
  
  ```typescript
  type Level = "debug" | "info" | "warn" | "error";
  
  const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  
  function resolveLevel(): Level {
    const fromEnv = import.meta.env["VITE_LOG_LEVEL"] as Level | undefined;
    if (fromEnv && fromEnv in LEVELS) return fromEnv;
    return import.meta.env.DEV ? "debug" : "warn";
  }
  
  const MIN_LEVEL = LEVELS[resolveLevel()];
  
  function log(level: Level, context: string, message: string, data?: unknown): void {
    if (LEVELS[level] < MIN_LEVEL) return;
    const prefix = `[wimm:${context}]`;
    const args = data !== undefined ? [prefix, message, data] : [prefix, message];
    console[level](...args);
  }
  
  export const logger = {
    debug: (ctx: string, msg: string, data?: unknown) => log("debug", ctx, msg, data),
    info:  (ctx: string, msg: string, data?: unknown) => log("info",  ctx, msg, data),
    warn:  (ctx: string, msg: string, data?: unknown) => log("warn",  ctx, msg, data),
    error: (ctx: string, msg: string, data?: unknown) => log("error", ctx, msg, data),
  };
  ```
  
  **Usage pattern everywhere:**
  ```typescript
  import { logger } from "../utils/logger";
  logger.info("import", "CSV import succeeded", { new: 12, dupes: 3 });
  logger.error("api", "POST /mappings failed", err.message);
  ```
  
  #### What to Log and Where
  
  | Location | Level | Event | Extra data |
  |---|---|---|---|
  | `services/api.ts` — response error interceptor | `warn` | HTTP error received | `{ method, url, status, detail }` |
  | `services/api.ts` — response error interceptor | `error` | HTTP 5xx or network failure | `{ method, url, status }` |
  | `hooks/useImport.ts` — `onSuccess` | `info` | Import completed | `{ new, duplicates, failed, batchId }` |
  | `hooks/useImport.ts` — `onError` | `error` | Import request failed | error message |
  | `hooks/useSankeyData.ts` — `queryFn` | `debug` | Sankey fetch initiated | `{ dateFrom, dateTo }` |
  | `hooks/useMappings.ts` — `onSuccess` | `debug` | Mapping created/updated | `{ transactionId, categoryId }` |
  | `hooks/useSuggestions.ts` — `onSuccess` | `debug` | Suggestions received | `{ count, transactionIds }` |
  | `components/shared/ErrorBoundary.tsx` — `componentDidCatch` | `error` | React render error caught | `{ error, componentStack }` |
  | `App.tsx` — route change listener | `debug` | Navigation | `{ path }` |
  
  #### Concrete Snippets
  
  **`src/services/api.ts` — interceptor:**
  ```typescript
  import { logger } from "../utils/logger";
  
  apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
      const status: number = err.response?.status ?? 0;
      const url: string = err.config?.url ?? "unknown";
      const method: string = (err.config?.method ?? "GET").toUpperCase();
      const detail: string =
        (err.response?.data as { detail?: string } | undefined)?.detail ??
        (err as Error).message ?? "Unknown error";
  
      if (status >= 500 || status === 0) {
        logger.error("api", `${method} ${url} → ${status}`, { detail });
      } else {
        logger.warn("api", `${method} ${url} → ${status}`, { detail });
      }
      return Promise.reject(new Error(detail));
    }
  );
  ```
  
  **`src/components/shared/ErrorBoundary.tsx`:**
  ```typescript
  import { logger } from "../../utils/logger";
  
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error("error-boundary", error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }
  ```
  
  **`src/hooks/useImport.ts` — mutation `onSuccess`:**
  ```typescript
  onSuccess: (data) => {
    logger.info("import", "CSV import completed", {
      new: data.new_transactions,
      duplicates: data.duplicate_transactions,
      failed: data.failed_rows.length,
      batchId: data.import_batch_id,
    });
    // … toast, invalidate …
  },
  ```
  
  #### Log Level Configuration
  
  Add `VITE_LOG_LEVEL` to the environment variable contract:
  
  | Variable | Service | Default | Description |
  |---|---|---|---|
  | `VITE_LOG_LEVEL` | frontend (build-time) | `"debug"` in dev, `"warn"` in prod | Minimum log level surfaced to browser console. Set to `"error"` in production builds to suppress noise. |
  
  For Docker production builds, pass it as a build arg (no console noise for end users):
  ```yaml
  # docker-compose.yml frontend.build.args
  VITE_LOG_LEVEL: "warn"
  ```
  
  ---
  
  ### 16.3 Log Output Summary
  
  | Scenario | Where to look | How |
  |---|---|---|
  | Backend request log | `docker compose logs backend` | One line per request: `INFO app.middleware — GET /api/sankey → 200 (42 ms)` |
  | Import detail | `docker compose logs backend` | `INFO app.services.csv_importer — Import complete: bank_id=1 batch_id=3 new=12 dupes=2 failed=0` |
  | ML model rebuild | `docker compose logs backend` | `INFO app.services.ml_suggester — ML cache rebuilt: 48 training samples, vocabulary=1200` |
  | 500 error with traceback | `docker compose logs backend` | Full Python traceback logged at `ERROR` level |
  | Frontend API error | Browser DevTools console | `[wimm:api] POST /api/import → 400 {detail: "…"}` |
  | Frontend render crash | Browser DevTools console | `[wimm:error-boundary] Component error — see stack` |
  | Debug trace (dev only) | Browser DevTools console | `[wimm:import] CSV import completed {new: 5, …}` |

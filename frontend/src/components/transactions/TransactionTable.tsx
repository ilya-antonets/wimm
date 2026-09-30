import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { useBanks } from "../../hooks/useBanks";
import { useCategoryTree } from "../../hooks/useCategoryTree";
import { useMappings } from "../../hooks/useMappings";
import { useSuggestions } from "../../hooks/useSuggestions";
import { useTransactions } from "../../hooks/useTransactions";
import type { TransactionFilters } from "../../services/transactionService";
import { useAppStore } from "../../store/useAppStore";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { DateRangePicker } from "../shared/DateRangePicker";
import type { SuggestionResult, TransactionRead, TransactionType } from "../../types";

const CURRENCY_SYMBOL = "$";
const PAGE_SIZES = [25, 50, 100];

interface TransactionTableProps {
  filterCategoryId: number | null;
}

function formatAmount(amount: string): string {
  const value = Number(amount);
  const sign = value < 0 ? "-" : "";
  return `${sign}${CURRENCY_SYMBOL}${Math.abs(value).toFixed(2)}`;
}

const columnHelper = createColumnHelper<TransactionRead>();

/**
 * Paginated, filterable transaction listing. Category assignment, suggestion
 * acceptance, and mapping clearing all flow through the mapping hook; the
 * category tree selection (`filterCategoryId`) and the shared date range narrow
 * the query.
 */
export function TransactionTable({ filterCategoryId }: TransactionTableProps): JSX.Element {
  const dateRange = useAppStore((s) => s.dateRange);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [typeFilter, setTypeFilter] = useState<TransactionType | "">("");
  const [bankIdFilter, setBankIdFilter] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);

  // Any filter change returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [
    filterCategoryId,
    dateRange.from,
    dateRange.to,
    typeFilter,
    bankIdFilter,
    search,
    unmappedOnly,
    pageSize,
  ]);

  const filters: TransactionFilters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    type: typeFilter || undefined,
    bankId: bankIdFilter,
    categoryId: filterCategoryId ?? undefined,
    unmapped: unmappedOnly,
    search: search.trim() || undefined,
    page,
    pageSize,
  };

  const { data, isLoading, error } = useTransactions(filters);
  const { banks } = useBanks();
  const { categories } = useCategoryTree();
  const { createOrUpdateMapping, deleteMapping } = useMappings();

  // If the result set shrinks below the current page without a filter change
  // (e.g. accepting a mapping while "Unmapped only" is on), snap back into range
  // so the user isn't stranded on an empty page past the last one. When the set
  // empties completely (pages === 0) fall back to page 1.
  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(data.pages, 1);
    if (page > lastPage) setPage(lastPage);
  }, [data, page]);

  const items = useMemo(() => data?.items ?? [], [data]);

  // Fetch suggestions only for the unmapped expenses on the current page.
  const unmappedExpenseIds = useMemo(
    () => items.filter((t) => t.type === "expense" && t.mapping == null).map((t) => t.id),
    [items]
  );
  const { suggestions } = useSuggestions(unmappedExpenseIds);

  const columns = useMemo(
    () => [
      columnHelper.accessor("date", { header: "Date" }),
      columnHelper.accessor("description", { header: "Description" }),
      columnHelper.accessor("amount", {
        header: "Amount",
        cell: (info) => (
          <span className="transaction-table__amount">{formatAmount(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => (
          <span className={`badge badge--${info.getValue()}`}>{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("bank_name", { header: "Bank" }),
      columnHelper.display({
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const tx = row.original;
          if (tx.type !== "expense") return <span className="transaction-table__muted">—</span>;
          return (
            <div className="transaction-table__category">
              <select
                aria-label={`Category for ${tx.description}`}
                value={tx.mapping?.category_id ?? ""}
                onChange={(e) => {
                  const categoryId = Number(e.target.value);
                  if (!Number.isNaN(categoryId) && e.target.value !== "") {
                    createOrUpdateMapping.mutate({
                      transaction_id: tx.id,
                      category_id: categoryId,
                    });
                  }
                }}
              >
                <option value="">Unassigned</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {tx.mapping != null && (
                <button
                  type="button"
                  aria-label={`Clear mapping for ${tx.description}`}
                  onClick={() => deleteMapping.mutate(tx.id)}
                >
                  Clear
                </button>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "suggestion",
        header: "Suggestion",
        cell: ({ row }) => {
          const tx = row.original;
          if (tx.type !== "expense" || tx.mapping != null) return null;
          const suggestion: SuggestionResult | undefined = suggestions.get(tx.id);
          if (!suggestion) return null;
          return (
            <span className="suggestion-badge">
              <span className="suggestion-badge__name">{suggestion.suggested_category_name}</span>
              <span className="suggestion-badge__confidence">
                {Math.round(suggestion.confidence * 100)}%
              </span>
              <button
                type="button"
                aria-label={`Accept suggestion for ${tx.description}`}
                onClick={() =>
                  createOrUpdateMapping.mutate({
                    transaction_id: tx.id,
                    category_id: suggestion.suggested_category_id,
                  })
                }
              >
                Accept
              </button>
            </span>
          );
        },
      }),
    ],
    [categories, suggestions, createOrUpdateMapping, deleteMapping]
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.pages ?? -1,
  });

  const totalPages = Math.max(data?.pages ?? 1, 1);

  return (
    <div className="transaction-table">
      <div className="transaction-table__filters">
        <DateRangePicker />
        <select
          aria-label="Type filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TransactionType | "")}
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          aria-label="Bank filter"
          value={bankIdFilter ?? ""}
          onChange={(e) =>
            setBankIdFilter(e.target.value === "" ? undefined : Number(e.target.value))
          }
        >
          <option value="">All banks</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search descriptions"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="transaction-table__unmapped">
          <input
            type="checkbox"
            checked={unmappedOnly}
            onChange={(e) => setUnmappedOnly(e.target.checked)}
          />
          Unmapped only
        </label>
      </div>

      {isLoading ? (
        <LoadingSpinner label="Loading transactions…" />
      ) : error ? (
        <p role="alert" className="transaction-table__error">
          Failed to load transactions: {error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="transaction-table__empty">No transactions match the current filters.</p>
      ) : (
        <table className="transaction-table__grid">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="transaction-table__pagination">
        <select
          aria-label="Page size"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="transaction-table__page-indicator">
          Page {page} of {totalPages}
        </span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

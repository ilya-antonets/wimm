import {
  Badge,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
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
          <Text component="span" className="transaction-table__amount">
            {formatAmount(info.getValue())}
          </Text>
        ),
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => (
          <Badge
            className={`badge badge--${info.getValue()}`}
            color={info.getValue() === "income" ? "teal" : "red"}
            variant="light"
          >
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("bank_name", { header: "Bank" }),
      columnHelper.display({
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const tx = row.original;
          if (tx.type !== "expense")
            return (
              <Text component="span" c="dimmed" className="transaction-table__muted">
                —
              </Text>
            );
          return (
            <Group className="transaction-table__category" gap="xs" wrap="nowrap">
              <NativeSelect
                aria-label={`Category for ${tx.description}`}
                value={tx.mapping?.category_id ?? ""}
                onChange={(e) => {
                  const categoryId = Number(e.currentTarget.value);
                  if (!Number.isNaN(categoryId) && e.currentTarget.value !== "") {
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
              </NativeSelect>
              {tx.mapping != null && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  aria-label={`Clear mapping for ${tx.description}`}
                  onClick={() => deleteMapping.mutate(tx.id)}
                >
                  Clear
                </Button>
              )}
            </Group>
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
            <Group className="suggestion-badge" gap="xs" wrap="nowrap">
              <span className="suggestion-badge__name">{suggestion.suggested_category_name}</span>
              <span className="suggestion-badge__confidence">
                {Math.round(suggestion.confidence * 100)}%
              </span>
              <Button
                variant="light"
                size="compact-xs"
                aria-label={`Accept suggestion for ${tx.description}`}
                onClick={() =>
                  createOrUpdateMapping.mutate({
                    transaction_id: tx.id,
                    category_id: suggestion.suggested_category_id,
                  })
                }
              >
                Accept
              </Button>
            </Group>
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
      <Group className="transaction-table__filters" gap="md" align="flex-end" wrap="wrap" mb="md">
        <DateRangePicker />
        <NativeSelect
          aria-label="Type filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.currentTarget.value as TransactionType | "")}
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Bank filter"
          value={bankIdFilter ?? ""}
          onChange={(e) =>
            setBankIdFilter(
              e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value)
            )
          }
        >
          <option value="">All banks</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        <TextInput
          type="search"
          aria-label="Search descriptions"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Checkbox
          className="transaction-table__unmapped"
          label="Unmapped only"
          checked={unmappedOnly}
          onChange={(e) => setUnmappedOnly(e.currentTarget.checked)}
        />
      </Group>

      {isLoading ? (
        <LoadingSpinner label="Loading transactions…" />
      ) : error ? (
        <Text role="alert" c="red" className="transaction-table__error">
          Failed to load transactions: {error.message}
        </Text>
      ) : items.length === 0 ? (
        <Text className="transaction-table__empty">No transactions match the current filters.</Text>
      ) : (
        <Table className="transaction-table__grid" highlightOnHover withTableBorder>
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.Th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Group className="transaction-table__pagination" gap="sm" mt="md" align="center">
        <NativeSelect
          aria-label="Page size"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.currentTarget.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </NativeSelect>
        <Button variant="default" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Text component="span" className="transaction-table__page-indicator">
          Page {page} of {totalPages}
        </Text>
        <Button
          variant="default"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </Group>
    </div>
  );
}

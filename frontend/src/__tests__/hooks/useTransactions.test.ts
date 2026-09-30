import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTransactions } from "../../hooks/useTransactions";
import type { TransactionFilters } from "../../services/transactionService";
import { renderHookWithQuery } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

const baseFilters: TransactionFilters = { page: 1, pageSize: 50 };

afterEach(() => vi.restoreAllMocks());

describe("useTransactions", () => {
  it("fetches the page and maps camelCase filters to snake_case query params", async () => {
    const requested: Record<string, string | null> = {};
    server.use(
      http.get(`${API}/transactions`, ({ request }) => {
        const url = new URL(request.url);
        requested.page = url.searchParams.get("page");
        requested.pageSize = url.searchParams.get("page_size");
        requested.dateFrom = url.searchParams.get("date_from");
        requested.bankId = url.searchParams.get("bank_id");
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50, pages: 1 });
      })
    );

    const { result } = renderHookWithQuery(() =>
      useTransactions({ ...baseFilters, dateFrom: "2026-09-01", bankId: 7 })
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requested).toEqual({
      page: "1",
      pageSize: "50",
      dateFrom: "2026-09-01",
      bankId: "7",
    });
  });

  it("deleteTransaction invalidates transactions and sankey", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useTransactions(baseFilters));

    result.current.deleteTransaction.mutate(1);
    await waitFor(() => expect(result.current.deleteTransaction.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["transactions"]));
    expect(keys).toContain(JSON.stringify(["sankey"]));
  });
});

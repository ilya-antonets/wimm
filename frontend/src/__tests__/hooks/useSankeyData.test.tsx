import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useSankeyData } from "../../hooks/useSankeyData";
import type { SankeyPayload } from "../../types";
import { createTestQueryClient, renderHookWithQuery } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

const populated: SankeyPayload = {
  nodes: [
    { id: "inc_1", name: "Salary" },
    { id: "__expenses__", name: "Expenses" },
    { id: "cat_2", name: "Food", transaction_ids: [1, 2] },
  ],
  links: [
    { source: "inc_1", target: "__expenses__", value: 100 },
    { source: "__expenses__", target: "cat_2", value: 60 },
  ],
  period_income: 100,
  period_expenses: 60,
  balance: 40,
};

describe("useSankeyData", () => {
  it("fetches with the date range as query params", async () => {
    const requested: Record<string, string | null> = {};
    server.use(
      http.get(`${API}/sankey`, ({ request }) => {
        const url = new URL(request.url);
        requested.from = url.searchParams.get("date_from");
        requested.to = url.searchParams.get("date_to");
        return HttpResponse.json(populated);
      })
    );

    const { result } = renderHookWithQuery(() => useSankeyData("2026-09-01", "2026-09-30"));

    await waitFor(() => expect(result.current.payload?.nodes).toHaveLength(3));
    expect(requested).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("refetches when the date range changes", async () => {
    const requestedFroms: string[] = [];
    server.use(
      http.get(`${API}/sankey`, ({ request }) => {
        requestedFroms.push(new URL(request.url).searchParams.get("date_from") ?? "");
        return HttpResponse.json(populated);
      })
    );

    const { result, rerender } = renderHookWithQuery(
      ({ from, to }: { from: string; to: string }) => useSankeyData(from, to),
      { initialProps: { from: "2026-09-01", to: "2026-09-30" } }
    );

    await waitFor(() => expect(result.current.payload).toBeDefined());
    rerender({ from: "2026-08-01", to: "2026-08-31" });

    await waitFor(() => expect(requestedFroms).toContain("2026-08-01"));
    expect(requestedFroms).toContain("2026-09-01");
  });

  it("is disabled and fetches nothing when a date is missing", () => {
    let hits = 0;
    server.use(
      http.get(`${API}/sankey`, () => {
        hits += 1;
        return HttpResponse.json(populated);
      })
    );

    const { result } = renderHookWithQuery(() => useSankeyData("", "2026-09-30"));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.payload).toBeUndefined();
    expect(hits).toBe(0);
  });

  it("serves the cached result within the 30s staleTime instead of refetching", async () => {
    let hits = 0;
    server.use(
      http.get(`${API}/sankey`, () => {
        hits += 1;
        return HttpResponse.json(populated);
      })
    );

    // Share one client across two observers so the cache is shared. A fresh
    // (non-stale) query means the second observer reads the cache; with the
    // default staleTime of 0 it would have triggered a second fetch.
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useSankeyData("2026-09-01", "2026-09-30"), { wrapper });
    await waitFor(() => expect(first.result.current.payload).toBeDefined());
    expect(hits).toBe(1);

    const second = renderHook(() => useSankeyData("2026-09-01", "2026-09-30"), { wrapper });
    await waitFor(() => expect(second.result.current.payload).toBeDefined());
    expect(hits).toBe(1);
  });
});

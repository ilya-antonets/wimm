import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBanks } from "../../hooks/useBanks";
import { renderHookWithQuery } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

afterEach(() => vi.restoreAllMocks());

describe("useBanks", () => {
  it("loads the bank list", async () => {
    const { result } = renderHookWithQuery(() => useBanks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.banks).toHaveLength(1);
    expect(result.current.banks[0]?.name).toBe("Test Bank");
  });

  it("createBank updates the banks cache", async () => {
    const { result } = renderHookWithQuery(() => useBanks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.createBank.mutate({
      name: "New Bank",
      column_map: { date: "Date", amount: "Amount", description: "Desc" },
      date_format: "%Y-%m-%d",
    });

    await waitFor(() => expect(result.current.createBank.isSuccess).toBe(true));
    expect(result.current.createBank.data?.name).toBe("New Bank");
  });

  it("deleteBank invalidates the transactions query", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(http.delete(`${API}/banks/:id`, () => new HttpResponse(null, { status: 204 })));

    const { result } = renderHookWithQuery(() => useBanks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.deleteBank.mutate(1);
    await waitFor(() => expect(result.current.deleteBank.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["banks"]));
    expect(keys).toContain(JSON.stringify(["transactions"]));
  });

  it("updateBank invalidates the banks query on success", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useBanks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.updateBank.mutate({
      id: 1,
      name: "Renamed Bank",
      column_map: { date: "Date", amount: "Amount", description: "Desc" },
      date_format: "%Y-%m-%d",
      encoding: "utf-8",
      skip_header_rows: 0,
      skip_footer_rows: 0,
    });

    await waitFor(() => expect(result.current.updateBank.isSuccess).toBe(true));
    expect(result.current.updateBank.data?.name).toBe("Renamed Bank");
    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["banks"]));
  });

  it("surfaces mutation errors through the onError toast handlers", async () => {
    server.use(
      http.post(`${API}/banks`, () => new HttpResponse(null, { status: 500 })),
      http.put(`${API}/banks/:id`, () => new HttpResponse(null, { status: 500 })),
      http.delete(`${API}/banks/:id`, () => new HttpResponse(null, { status: 500 }))
    );
    const { result } = renderHookWithQuery(() => useBanks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.createBank.mutate({
      name: "x",
      column_map: { date: "d", amount: "a", description: "s" },
      date_format: "%Y-%m-%d",
    });
    result.current.updateBank.mutate({
      id: 1,
      name: "x",
      column_map: { date: "d", amount: "a", description: "s" },
      date_format: "%Y-%m-%d",
    });
    result.current.deleteBank.mutate(1);

    await waitFor(() => expect(result.current.createBank.isError).toBe(true));
    await waitFor(() => expect(result.current.updateBank.isError).toBe(true));
    await waitFor(() => expect(result.current.deleteBank.isError).toBe(true));
  });
});

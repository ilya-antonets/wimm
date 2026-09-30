import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMappings } from "../../hooks/useMappings";
import { renderHookWithQuery } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

afterEach(() => vi.restoreAllMocks());

const expectedKeys = [
  JSON.stringify(["transactions"]),
  JSON.stringify(["sankey"]),
  JSON.stringify(["suggestions"]),
];

describe("useMappings", () => {
  it("createOrUpdateMapping invalidates transactions, sankey and suggestions", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useMappings());

    result.current.createOrUpdateMapping.mutate({ transaction_id: 1, category_id: 2 });
    await waitFor(() => expect(result.current.createOrUpdateMapping.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const key of expectedKeys) expect(keys).toContain(key);
  });

  it("deleteMapping invalidates transactions, sankey and suggestions", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useMappings());

    result.current.deleteMapping.mutate(1);
    await waitFor(() => expect(result.current.deleteMapping.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const key of expectedKeys) expect(keys).toContain(key);
  });

  it("surfaces mutation errors through the onError toast handlers", async () => {
    server.use(
      http.post(`${API}/mappings`, () => new HttpResponse(null, { status: 500 })),
      http.delete(`${API}/mappings/:id`, () => new HttpResponse(null, { status: 500 }))
    );
    const { result } = renderHookWithQuery(() => useMappings());

    result.current.createOrUpdateMapping.mutate({ transaction_id: 1, category_id: 2 });
    result.current.deleteMapping.mutate(1);

    await waitFor(() => expect(result.current.createOrUpdateMapping.isError).toBe(true));
    await waitFor(() => expect(result.current.deleteMapping.isError).toBe(true));
  });
});

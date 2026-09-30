import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCategoryTree } from "../../hooks/useCategoryTree";
import { renderHookWithQuery } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

afterEach(() => vi.restoreAllMocks());

describe("useCategoryTree", () => {
  it("loads the flat category list", async () => {
    const { result } = renderHookWithQuery(() => useCategoryTree());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.categories).toHaveLength(3);
    expect(result.current.categories[0]?.name).toBe("Uncategorized");
  });

  it("createCategory invalidates the categories query", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useCategoryTree());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.createCategory.mutate({ name: "Travel", parent_id: null, sort_order: 0 });
    await waitFor(() => expect(result.current.createCategory.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["categories"]));
  });

  it("moveCategory invalidates categories, transactions and sankey", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const { result } = renderHookWithQuery(() => useCategoryTree());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.moveCategory.mutate({ id: 3, new_parent_id: null, sort_order: 0 });
    await waitFor(() => expect(result.current.moveCategory.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["categories"]));
    expect(keys).toContain(JSON.stringify(["transactions"]));
    expect(keys).toContain(JSON.stringify(["sankey"]));
  });

  it("deleteCategory invalidates categories, transactions and sankey", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(http.delete(`${API}/categories/:id`, () => new HttpResponse(null, { status: 204 })));
    const { result } = renderHookWithQuery(() => useCategoryTree());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.deleteCategory.mutate(2);
    await waitFor(() => expect(result.current.deleteCategory.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["categories"]));
    expect(keys).toContain(JSON.stringify(["transactions"]));
    expect(keys).toContain(JSON.stringify(["sankey"]));
  });
});

import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMappings } from "../../hooks/useMappings";
import { renderHookWithQuery } from "../hooks/testUtils";

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
});

import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSuggestions } from "../../hooks/useSuggestions";
import { renderHookWithQuery } from "../hooks/testUtils";

describe("useSuggestions", () => {
  it("returns a Map keyed by transaction_id", async () => {
    const { result } = renderHookWithQuery(() => useSuggestions([1]));

    await waitFor(() => expect(result.current.suggestions.size).toBe(1));
    const suggestion = result.current.suggestions.get(1);
    expect(suggestion?.suggested_category_name).toBe("Groceries");
    expect(suggestion?.transaction_id).toBe(1);
  });

  it("is disabled and fetches nothing when the id list is empty", () => {
    const { result } = renderHookWithQuery(() => useSuggestions([]));

    // Disabled query never enters a loading state and yields an empty map.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.suggestions.size).toBe(0);
  });

  it("refetch re-runs the query", async () => {
    const { result } = renderHookWithQuery(() => useSuggestions([1]));
    await waitFor(() => expect(result.current.suggestions.size).toBe(1));

    result.current.refetch();
    await waitFor(() => expect(result.current.suggestions.get(1)?.transaction_id).toBe(1));
  });
});

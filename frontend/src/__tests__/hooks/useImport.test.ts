import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useImport } from "../../hooks/useImport";
import { renderHookWithQuery } from "../hooks/testUtils";

afterEach(() => vi.restoreAllMocks());

function csvFile(): File {
  return new File(["Date,Amount,Description\n2026-01-01,-5,Coffee"], "statement.csv", {
    type: "text/csv",
  });
}

describe("useImport", () => {
  it("importCsv returns the ImportResult", async () => {
    const { result } = renderHookWithQuery(() => useImport());

    result.current.importCsv.mutate({ bankId: 1, file: csvFile() });

    await waitFor(() => expect(result.current.importCsv.isSuccess).toBe(true));
    expect(result.current.importCsv.data?.new_transactions).toBe(12);
    expect(result.current.importCsv.data?.duplicate_transactions).toBe(8);
  });

  it("invalidates transactions and sankey on success", async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result } = renderHookWithQuery(() => useImport());
    result.current.importCsv.mutate({ bankId: 1, file: csvFile() });

    await waitFor(() => expect(result.current.importCsv.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["transactions"]));
    expect(keys).toContain(JSON.stringify(["sankey"]));
  });
});

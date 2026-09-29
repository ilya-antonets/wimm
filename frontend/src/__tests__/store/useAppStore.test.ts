import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "../../store/useAppStore";

// Snapshot the store's true initial state at module load, before any test mutates it.
const initialState = useAppStore.getState();

function expectedDefaultRange(): { from: string; to: string } {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fmt = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: fmt(first), to: fmt(today) };
}

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true);
  });

  it("initializes the date range to the current month", () => {
    expect(useAppStore.getState().dateRange).toEqual(expectedDefaultRange());
  });

  it("setDateRange updates the stored range", () => {
    useAppStore.getState().setDateRange({ from: "2026-01-01", to: "2026-01-31" });
    expect(useAppStore.getState().dateRange).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("openSankeyPanel sets open flag and node data", () => {
    useAppStore.getState().openSankeyPanel("cat_2", "Food", [1, 2, 3]);
    expect(useAppStore.getState().sankeyPanel).toEqual({
      open: true,
      nodeId: "cat_2",
      nodeName: "Food",
      transactionIds: [1, 2, 3],
    });
  });

  it("closeSankeyPanel resets the panel state", () => {
    useAppStore.getState().openSankeyPanel("cat_2", "Food", [1]);
    useAppStore.getState().closeSankeyPanel();
    expect(useAppStore.getState().sankeyPanel).toEqual({
      open: false,
      nodeId: null,
      nodeName: null,
      transactionIds: [],
    });
  });

  it("setImportModalOpen toggles the import modal flag", () => {
    expect(useAppStore.getState().importModalOpen).toBe(false);
    useAppStore.getState().setImportModalOpen(true);
    expect(useAppStore.getState().importModalOpen).toBe(true);
    useAppStore.getState().setImportModalOpen(false);
    expect(useAppStore.getState().importModalOpen).toBe(false);
  });
});

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SankeyDiagram } from "../../components/sankey/SankeyDiagram";
import { useAppStore } from "../../store/useAppStore";
import type { SankeyPayload } from "../../types";
import { renderWithProviders } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

// jsdom cannot run the real ECharts canvas renderer — stub the wrapper with a
// div that surfaces the node-click handler so the drill-down wiring is testable.
vi.mock("echarts-for-react", () => ({
  default: ({ onEvents }: { onEvents?: Record<string, (p: { name: string }) => void> }) => (
    <div data-testid="echarts" onClick={() => onEvents?.click?.({ name: "cat_2" })} />
  ),
}));

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

function renderDiagram() {
  return renderWithProviders(
    <SankeyDiagram dateFrom="2026-09-01" dateTo="2026-09-30" minConfidence={0.3} />,
    { withQuery: true }
  );
}

describe("SankeyDiagram", () => {
  afterEach(() => {
    useAppStore.getState().closeSankeyPanel();
  });

  it("renders the ECharts container when the payload has nodes", async () => {
    server.use(http.get(`${API}/sankey`, () => HttpResponse.json(populated)));
    renderDiagram();
    expect(await screen.findByTestId("echarts")).toBeInTheDocument();
  });

  it("shows a loading spinner while fetching", () => {
    server.use(http.get(`${API}/sankey`, () => HttpResponse.json(populated)));
    renderDiagram();
    // Initial synchronous render is in the loading state (query still pending).
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when the payload has no nodes", async () => {
    // Default handler returns an empty mockSankey payload.
    renderDiagram();
    expect(await screen.findByText("No transactions in this period")).toBeInTheDocument();
  });

  it("opens the drill-down panel when an expense node is clicked", async () => {
    server.use(http.get(`${API}/sankey`, () => HttpResponse.json(populated)));
    renderDiagram();
    const chart = await screen.findByTestId("echarts");
    await userEvent.click(chart);

    const panel = useAppStore.getState().sankeyPanel;
    expect(panel).toEqual({
      open: true,
      nodeId: "cat_2",
      nodeName: "Food",
      transactionIds: [1, 2],
    });
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardPage } from "../../pages/DashboardPage";
import { renderWithProviders } from "../hooks/testUtils";

// jsdom cannot render the real ECharts canvas — stub the wrapper.
vi.mock("echarts-for-react", () => ({ default: () => null }));

function renderPage(): ReturnType<typeof render> {
  return renderWithProviders(<DashboardPage />, { withQuery: true });
}

describe("DashboardPage", () => {
  it("renders the heading and the empty state for an empty Sankey payload", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("No transactions in this period")).toBeInTheDocument();
  });
});

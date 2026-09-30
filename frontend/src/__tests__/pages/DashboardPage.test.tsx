import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DashboardPage } from "../../pages/DashboardPage";

// jsdom cannot render the real ECharts canvas — stub the wrapper.
vi.mock("echarts-for-react", () => ({ default: () => null }));

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DashboardPage />, { wrapper });
}

describe("DashboardPage", () => {
  it("renders the heading and the empty state for an empty Sankey payload", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("No transactions in this period")).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";

// jsdom cannot render the real ECharts canvas — stub the wrapper.
vi.mock("echarts-for-react", () => ({ default: () => null }));

function renderApp(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<App />, { wrapper });
}

describe("App", () => {
  it("redirects the index route to the dashboard", async () => {
    renderApp();
    expect(screen.getByText("WIMM")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});

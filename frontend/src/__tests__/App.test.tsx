import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";

import { renderWithProviders } from "./hooks/testUtils";

// jsdom cannot render the real ECharts canvas — stub the wrapper.
vi.mock("echarts-for-react", () => ({ default: () => null }));

function renderApp(): ReturnType<typeof render> {
  // App provides its own BrowserRouter, so only wrap in Mantine + Query.
  return renderWithProviders(<App />, { withQuery: true });
}

describe("App", () => {
  it("redirects the index route to the dashboard", async () => {
    renderApp();
    expect(screen.getByText("WIMM")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});

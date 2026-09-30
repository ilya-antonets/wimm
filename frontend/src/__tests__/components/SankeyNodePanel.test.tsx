import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SankeyNodePanel } from "../../components/sankey/SankeyNodePanel";
import { useAppStore } from "../../store/useAppStore";
import type { TransactionPage } from "../../types";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

const page: TransactionPage = {
  items: [
    {
      id: 1,
      bank_id: 1,
      bank_name: "Test Bank",
      import_batch_id: 1,
      date: "2026-09-01",
      amount: "-42.5000",
      description: "GROCERY STORE",
      type: "expense",
      mapping: { category_id: 2, category_name: "Food" },
    },
    {
      id: 2,
      bank_id: 1,
      bank_name: "Test Bank",
      import_batch_id: 1,
      date: "2026-09-02",
      amount: "-18.0000",
      description: "COFFEE SHOP",
      type: "expense",
      mapping: { category_id: 2, category_name: "Food" },
    },
  ],
  total: 2,
  page: 1,
  page_size: 200,
  pages: 1,
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SankeyNodePanel />, { wrapper });
}

describe("SankeyNodePanel", () => {
  beforeEach(() => {
    useAppStore.getState().openSankeyPanel("cat_2", "Food", [1, 2]);
    server.use(http.get(`${API}/transactions`, () => HttpResponse.json(page)));
  });

  afterEach(() => {
    useAppStore.getState().closeSankeyPanel();
  });

  it("renders the node header and a row per transaction", async () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Food — Expenses" })).toBeInTheDocument();
    expect(await screen.findByText("GROCERY STORE")).toBeInTheDocument();
    expect(screen.getByText("COFFEE SHOP")).toBeInTheDocument();
  });

  it("reassigns a transaction and closes the panel", async () => {
    const user = userEvent.setup();
    let posted: unknown = null;
    server.use(
      http.post(`${API}/mappings`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: 1, transaction_id: 1, category_id: 3 }, { status: 201 });
      })
    );

    renderPanel();
    const select = await screen.findByLabelText("Category for GROCERY STORE");
    await user.selectOptions(select, "3");

    await waitFor(() => expect(posted).toEqual({ transaction_id: 1, category_id: 3 }));
    await waitFor(() => expect(useAppStore.getState().sankeyPanel.open).toBe(false));
  });

  it("closes the panel when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("GROCERY STORE"); // let the id-fetch settle first
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(useAppStore.getState().sankeyPanel.open).toBe(false);
  });
});

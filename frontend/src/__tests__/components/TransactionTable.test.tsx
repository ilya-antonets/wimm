import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { TransactionTable } from "../../components/transactions/TransactionTable";
import { renderWithProviders } from "../hooks/testUtils";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

function renderTable(filterCategoryId: number | null = null) {
  return renderWithProviders(
    <TransactionTable filterCategoryId={filterCategoryId} minConfidence={0.3} />,
    { withQuery: true }
  );
}

describe("TransactionTable", () => {
  it("renders a row per transaction", async () => {
    renderTable();
    expect(await screen.findByText("GROCERY STORE")).toBeInTheDocument();
    expect(screen.getByText("COFFEE SHOP")).toBeInTheDocument();
    expect(screen.getByText("PAYCHECK")).toBeInTheDocument();
  });

  it("shows a suggestion badge for an unmapped expense", async () => {
    renderTable();
    // Suggestion for the unmapped GROCERY STORE row (id=1) → Groceries 92%.
    // "Groceries" also appears as a category option, so scope to the badge.
    expect(
      await screen.findByText("Groceries", { selector: ".suggestion-badge__name" })
    ).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept suggestion for GROCERY STORE" })
    ).toBeInTheDocument();
  });

  it("calls the mapping API when a category is selected", async () => {
    const user = userEvent.setup();
    let posted: unknown = null;
    server.use(
      http.post(`${API}/mappings`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: 1, transaction_id: 1, category_id: 2 }, { status: 201 });
      })
    );

    renderTable();
    // Wait for the suggestions query to settle so the columns (which depend on
    // it) stop re-rendering and the <select> handle we grab stays attached.
    await screen.findByText("92%");
    const select = screen.getByLabelText("Category for GROCERY STORE");
    await user.selectOptions(select, "2");

    await waitFor(() => expect(posted).toEqual({ transaction_id: 1, category_id: 2 }));
  });

  it("requests the next page when Next is clicked", async () => {
    const user = userEvent.setup();
    const pages: string[] = [];
    server.use(
      http.get(`${API}/transactions`, ({ request }) => {
        const page = new URL(request.url).searchParams.get("page") ?? "1";
        pages.push(page);
        return HttpResponse.json({
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
              mapping: null,
            },
          ],
          total: 60,
          page: Number(page),
          page_size: 50,
          pages: 2,
        });
      })
    );

    renderTable();
    await screen.findByText("GROCERY STORE");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(pages).toContain("2"));
  });

  it("renders a category dropdown for expenses and a dash for income", async () => {
    renderTable();
    await screen.findByText("PAYCHECK");

    // Income row (PAYCHECK) has no category select.
    const incomeRow = screen.getByText("PAYCHECK").closest("tr");
    expect(incomeRow).not.toBeNull();
    if (incomeRow) {
      expect(within(incomeRow).queryByRole("combobox")).not.toBeInTheDocument();
    }
  });

  it("renders an error message when the transactions request fails", async () => {
    server.use(http.get(`${API}/transactions`, () => new HttpResponse(null, { status: 500 })));

    renderTable();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Failed to load transactions/i);
    // The misleading empty-state message must not be shown on error.
    expect(
      screen.queryByText("No transactions match the current filters.")
    ).not.toBeInTheDocument();
  });
});

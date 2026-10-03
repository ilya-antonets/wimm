import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { TransactionsPage } from "../../pages/TransactionsPage";
import { useAppStore } from "../../store/useAppStore";
import { renderWithProviders } from "../hooks/testUtils";

function renderPage(): ReturnType<typeof render> {
  return renderWithProviders(<TransactionsPage />, { withQuery: true });
}

describe("TransactionsPage", () => {
  beforeEach(() => {
    useAppStore.getState().setActiveCategoryId(null);
  });

  it("renders the category panel and the transaction rows", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(await screen.findByText("GROCERY STORE")).toBeInTheDocument();
  });
});

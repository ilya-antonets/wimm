import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { TransactionsPage } from "../../pages/TransactionsPage";
import { useAppStore } from "../../store/useAppStore";

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<TransactionsPage />, { wrapper });
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

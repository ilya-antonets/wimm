import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ImportModal } from "../../components/import/ImportModal";

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ImportModal open onClose={onClose} />, { wrapper });
}

describe("ImportModal", () => {
  it("file input accepts only .csv", () => {
    const { container } = renderModal();
    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("accept", ".csv");
  });

  it("lists banks in the selector", async () => {
    renderModal();
    // wait for the useBanks query to resolve and populate the <select>
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Test Bank" })).toBeInTheDocument()
    );
  });

  it("disables submit until a bank and file are chosen", async () => {
    const user = userEvent.setup();
    const { container } = renderModal();

    const submit = screen.getByRole("button", { name: "Import" });
    expect(submit).toBeDisabled();

    await waitFor(() => screen.getByRole("option", { name: "Test Bank" }));
    await user.selectOptions(screen.getByRole("combobox"), "1");
    expect(submit).toBeDisabled();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["x"], "s.csv", { type: "text/csv" }));
    expect(submit).toBeEnabled();
  });

  it("shows the summary after a successful import", async () => {
    const user = userEvent.setup();
    const { container } = renderModal();

    await waitFor(() => screen.getByRole("option", { name: "Test Bank" }));
    await user.selectOptions(screen.getByRole("combobox"), "1");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["x"], "s.csv", { type: "text/csv" }));

    await user.click(screen.getByRole("button", { name: "Import" }));

    const status = await screen.findByRole("status");
    expect(within(status).getByText(/12 new, 8 duplicates, 0 failed/)).toBeInTheDocument();
  });
});

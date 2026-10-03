import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ImportModal } from "../../components/import/ImportModal";
import { renderWithProviders } from "../hooks/testUtils";

function renderModal(onClose = vi.fn()) {
  return renderWithProviders(<ImportModal open onClose={onClose} />, { withQuery: true });
}

describe("ImportModal", () => {
  it("file input accepts only .csv", () => {
    renderModal();
    // Mantine Modal portals to document.body, so query by label rather than container.
    const input = screen.getByLabelText("CSV file");
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
    renderModal();

    const submit = screen.getByRole("button", { name: "Import" });
    expect(submit).toBeDisabled();

    await waitFor(() => screen.getByRole("option", { name: "Test Bank" }));
    await user.selectOptions(screen.getByRole("combobox"), "1");
    expect(submit).toBeDisabled();

    const fileInput = screen.getByLabelText("CSV file");
    await user.upload(fileInput, new File(["x"], "s.csv", { type: "text/csv" }));
    expect(submit).toBeEnabled();
  });

  it("shows the summary after a successful import", async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => screen.getByRole("option", { name: "Test Bank" }));
    await user.selectOptions(screen.getByRole("combobox"), "1");
    const fileInput = screen.getByLabelText("CSV file");
    await user.upload(fileInput, new File(["x"], "s.csv", { type: "text/csv" }));

    await user.click(screen.getByRole("button", { name: "Import" }));

    const status = await screen.findByRole("status");
    expect(within(status).getByText(/12 new, 8 duplicates, 0 failed/)).toBeInTheDocument();
  });
});

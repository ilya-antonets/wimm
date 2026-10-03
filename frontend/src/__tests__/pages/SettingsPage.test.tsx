import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { SettingsPage } from "../../pages/SettingsPage";
import { useAppStore } from "../../store/useAppStore";
import { renderWithProviders } from "../hooks/testUtils";

function renderPage(): ReturnType<typeof render> {
  return renderWithProviders(<SettingsPage />, { withQuery: true });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    useAppStore.getState().closeBankConfigModal();
    useAppStore.getState().setImportModalOpen(false);
  });

  it("renders the heading and lists the configured banks", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("Test Bank")).toBeInTheDocument();
  });

  it("opens the modal in edit mode when a bank's Edit button is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Test Bank");

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const state = useAppStore.getState().bankConfigModalState;
    expect(state.open).toBe(true);
    expect(state.bankId).toBe(1);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Edit Bank" })).toBeInTheDocument()
    );
  });

  it("opens the modal in create mode when Add Bank is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Test Bank");

    await user.click(screen.getByRole("button", { name: "Add Bank" }));

    const state = useAppStore.getState().bankConfigModalState;
    expect(state.open).toBe(true);
    expect(state.bankId).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Add Bank" })).toBeInTheDocument()
    );
  });
});

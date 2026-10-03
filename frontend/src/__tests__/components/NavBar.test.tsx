import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { NavBar } from "../../components/layout/NavBar";
import { useAppStore } from "../../store/useAppStore";
import { renderWithProviders } from "../hooks/testUtils";

function renderNavBar(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<NavBar />, { withRouter: true });
}

describe("NavBar", () => {
  beforeEach(() => {
    useAppStore.getState().setImportModalOpen(false);
  });

  it("renders the logo and the three navigation links", () => {
    renderNavBar();
    expect(screen.getByText("WIMM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("opens the import modal when Import CSV is clicked", async () => {
    const user = userEvent.setup();
    renderNavBar();
    expect(useAppStore.getState().importModalOpen).toBe(false);

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    expect(useAppStore.getState().importModalOpen).toBe(true);
  });
});

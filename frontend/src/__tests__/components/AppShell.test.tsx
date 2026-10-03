import { screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "../../components/layout/AppShell";
import { useAppStore } from "../../store/useAppStore";
import { renderWithProviders } from "../hooks/testUtils";

function renderShell(children: ReactNode): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<AppShell>{children}</AppShell>, {
    withRouter: true,
    withQuery: true,
  });
}

describe("AppShell", () => {
  beforeEach(() => {
    useAppStore.getState().setImportModalOpen(false);
  });

  it("renders the NavBar logo and its children", () => {
    renderShell(<div>hello</div>);
    expect(screen.getByText("WIMM")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});

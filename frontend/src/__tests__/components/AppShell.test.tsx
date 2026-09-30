import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "../../components/layout/AppShell";
import { useAppStore } from "../../store/useAppStore";

function renderShell(children: ReactNode): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell>{children}</AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
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

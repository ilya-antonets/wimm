import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { CategoryPanel } from "../../components/categories/CategoryPanel";
import { useAppStore } from "../../store/useAppStore";
import { server } from "../mocks/server";

const API = "http://localhost:8000/api";

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CategoryPanel />, { wrapper });
}

describe("CategoryPanel", () => {
  beforeEach(() => {
    useAppStore.getState().setActiveCategoryId(null);
  });

  it("renders the heading and category names once the query settles", async () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
    expect(await screen.findByText("Food")).toBeInTheDocument();
  });

  it("creates a root category through the inline form", async () => {
    const user = userEvent.setup();
    type PostBody = { name?: string; parent_id?: number | null };
    let posted: PostBody | null = null;
    server.use(
      http.post(`${API}/categories`, async ({ request }) => {
        posted = (await request.json()) as PostBody;
        return HttpResponse.json({ id: 99, ...posted }, { status: 201 });
      })
    );

    renderPanel();
    await user.click(screen.getByRole("button", { name: "New root category" }));

    const input = screen.getByRole("textbox", { name: "New category name" });
    await user.type(input, "Travel");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "New category name" })).not.toBeInTheDocument()
    );
    const body = posted as PostBody | null;
    expect(body).not.toBeNull();
    expect(body?.name).toBe("Travel");
    expect(body?.parent_id).toBeNull();
  });

  it("toggles the active category in the store when a label is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByText("Food"));
    expect(useAppStore.getState().activeCategoryId).toBe(2);
  });
});

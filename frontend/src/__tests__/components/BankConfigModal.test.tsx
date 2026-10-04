import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { type ReactNode } from "react";
import toast from "react-hot-toast";
import { describe, expect, it, vi } from "vitest";

import { BankConfigModal } from "../../components/banks/BankConfigModal";
import { theme } from "../../theme";
import { server } from "../mocks/server";
import type { BankRead } from "../../types";

const API = "http://localhost:8000/api";

const sampleBank: BankRead = {
  id: 1,
  name: "Test Bank",
  column_map: { date: "Date", amount: "Amount", description: "Description" },
  date_format: "%Y-%m-%d",
  skip_header_rows: 0,
  skip_footer_rows: 0,
  encoding: "utf-8",
};

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function renderModal(bank: BankRead | null, open = true, onClose = vi.fn()) {
  const client = makeClient();
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  );
  const utils = render(<BankConfigModal bank={bank} open={open} onClose={onClose} />, { wrapper });
  return { ...utils, onClose };
}

describe("BankConfigModal", () => {
  it("returns null when open is false", () => {
    // Closed modal returns null before touching Mantine; render query-only so no
    // Mantine <style> tags land in the container.
    const client = makeClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { container } = render(<BankConfigModal bank={null} open={false} onClose={vi.fn()} />, {
      wrapper,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders create mode with no delete action", () => {
    renderModal(null);
    expect(screen.getByText("Add Bank")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Bank" })).not.toBeInTheDocument();
  });

  it("renders edit mode with the bank name and a delete action", () => {
    renderModal(sampleBank);
    expect(screen.getByText("Edit Bank")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Bank" })).toBeInTheDocument();
  });

  it("POSTs a new bank and closes when required fields are filled", async () => {
    const user = userEvent.setup();
    type PostBody = { name?: string; column_map?: Record<string, unknown> };
    let posted: PostBody | null = null;
    server.use(
      http.post(`${API}/banks`, async ({ request }) => {
        posted = (await request.json()) as PostBody;
        return HttpResponse.json({ id: 2, ...posted }, { status: 201 });
      })
    );

    const { onClose } = renderModal(null);
    // Text inputs in DOM order: Name, Date format, Encoding (default utf-8),
    // Date column, Amount column, Description column, Transaction ID column.
    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[0]!, "New Bank");
    await user.type(textboxes[1]!, "%Y-%m-%d");
    await user.type(textboxes[3]!, "Date");
    await user.type(textboxes[4]!, "Amount");
    await user.type(textboxes[5]!, "Description");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = posted as PostBody | null;
    expect(body).not.toBeNull();
    expect(body?.name).toBe("New Bank");
    expect(body?.column_map).toMatchObject({
      date: "Date",
      amount: "Amount",
      description: "Description",
    });
  });

  it("includes the optional memo column in the payload when provided", async () => {
    const user = userEvent.setup();
    type PostBody = { column_map?: Record<string, unknown> };
    let posted: PostBody | null = null;
    server.use(
      http.post(`${API}/banks`, async ({ request }) => {
        posted = (await request.json()) as PostBody;
        return HttpResponse.json({ id: 2, ...posted }, { status: 201 });
      })
    );

    const { onClose } = renderModal(null);
    // Text inputs in DOM order: Name, Date format, Encoding, Date column,
    // Amount column, Description column, Transaction ID column, Memo column.
    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[0]!, "New Bank");
    await user.type(textboxes[1]!, "%Y-%m-%d");
    await user.type(textboxes[3]!, "Date");
    await user.type(textboxes[4]!, "Amount");
    await user.type(textboxes[5]!, "Description");
    await user.type(textboxes[7]!, "Memo");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((posted as PostBody | null)?.column_map).toMatchObject({ memo: "Memo" });
  });

  it("shows a validation toast and does not close when required fields are blank", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(toast, "error").mockImplementation(() => "");

    const { onClose } = renderModal(null);
    // Fill the required inputs with whitespace: this satisfies the browser's
    // native `required` constraint (so the form submits) while the component's
    // own trim-based validation still rejects it.
    const textboxes = screen.getAllByRole("textbox");
    for (const index of [0, 1, 3, 4, 5]) {
      await user.type(textboxes[index]!, " ");
    }
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(errorSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("confirms and deletes a bank, then closes", async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete(`${API}/banks/:id`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    const { onClose } = renderModal(sampleBank);
    await user.click(screen.getByRole("button", { name: "Delete Bank" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete bank" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(deleted).toBe(true);
  });
});

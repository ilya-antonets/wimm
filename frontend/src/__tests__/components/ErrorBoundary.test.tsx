import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../components/shared/ErrorBoundary";
import { theme } from "../../theme";

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      {children}
    </MantineProvider>
  );
}

function Bomb({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error("boom");
  return <div>safe child</div>;
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>happy child</div>
      </ErrorBoundary>,
      { wrapper }
    );
    expect(screen.getByText("happy child")).toBeInTheDocument();
  });

  it("renders the fallback with the error message when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
      { wrapper }
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Something went wrong.")).toBeInTheDocument();
    expect(within(alert).getByText("boom")).toBeInTheDocument();
  });

  it("recovers when Try again is clicked and the child no longer throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
      { wrapper }
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <Bomb explode={false} />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("safe child")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

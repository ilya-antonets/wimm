import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DateRangePicker } from "../../components/shared/DateRangePicker";
import { useAppStore } from "../../store/useAppStore";

describe("DateRangePicker", () => {
  beforeEach(() => {
    useAppStore.getState().setDateRange({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("does not commit a range whose start is after the end, and shows an error", () => {
    render(<DateRangePicker />);

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-15" } });

    // Store is untouched — the invalid range never reaches consumers/backend.
    expect(useAppStore.getState().dateRange).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(screen.getByRole("alert")).toHaveTextContent(/start date must not be after end date/i);
  });

  it("commits a valid range and clears a prior error", () => {
    render(<DateRangePicker />);

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-15" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-31" } });

    expect(useAppStore.getState().dateRange).toEqual({ from: "2026-09-01", to: "2026-10-31" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("commits a first-of-month range and clears errors when 'This Month' is clicked", () => {
    render(<DateRangePicker />);

    // Trigger an error first so we can confirm the preset clears it.
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-15" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "This Month" }));

    expect(useAppStore.getState().dateRange.from).toMatch(/-01$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("commits an ordered range when 'Last Month' is clicked", () => {
    render(<DateRangePicker />);

    fireEvent.click(screen.getByRole("button", { name: "Last Month" }));

    const { from, to } = useAppStore.getState().dateRange;
    expect(from <= to).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

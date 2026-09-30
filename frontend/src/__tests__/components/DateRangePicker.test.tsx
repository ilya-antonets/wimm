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
});

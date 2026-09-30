import { useAppStore } from "../../store/useAppStore";

/** Format a Date as YYYY-MM-DD in local time (avoids UTC off-by-one). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type QuickSelect = { label: string; range: () => { from: string; to: string } };

const QUICK_SELECTS: QuickSelect[] = [
  {
    label: "This Month",
    range: () => {
      const now = new Date();
      return {
        from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toLocalDateString(now),
      };
    },
  },
  {
    label: "Last Month",
    range: () => {
      const now = new Date();
      return {
        from: toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: "This Year",
    range: () => {
      const now = new Date();
      return {
        from: toLocalDateString(new Date(now.getFullYear(), 0, 1)),
        to: toLocalDateString(now),
      };
    },
  },
  {
    label: "Last 3 Months",
    range: () => {
      const now = new Date();
      return {
        from: toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
        to: toLocalDateString(now),
      };
    },
  },
];

/**
 * Date-range control backed by `store.dateRange`. Two date inputs plus
 * quick-select presets; shows an inline error (and skips the store update) when
 * the start date is after the end date.
 */
export function DateRangePicker(): JSX.Element {
  const dateRange = useAppStore((s) => s.dateRange);
  const setDateRange = useAppStore((s) => s.setDateRange);

  const invalid = dateRange.from > dateRange.to;

  return (
    <div className="date-range-picker">
      <label className="date-range-picker__field">
        <span>From</span>
        <input
          type="date"
          aria-label="From date"
          value={dateRange.from}
          max={dateRange.to}
          onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
        />
      </label>
      <label className="date-range-picker__field">
        <span>To</span>
        <input
          type="date"
          aria-label="To date"
          value={dateRange.to}
          min={dateRange.from}
          onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
        />
      </label>

      <div className="date-range-picker__presets">
        {QUICK_SELECTS.map((preset) => (
          <button key={preset.label} type="button" onClick={() => setDateRange(preset.range())}>
            {preset.label}
          </button>
        ))}
      </div>

      {invalid && (
        <p role="alert" className="date-range-picker__error">
          Start date must not be after end date.
        </p>
      )}
    </div>
  );
}

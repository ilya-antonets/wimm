import { Button, Group, Input, Stack, Text } from "@mantine/core";
import { useState } from "react";

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

  const [invalid, setInvalid] = useState(false);

  // Commit a candidate range only when it stays ordered (start <= end); an
  // out-of-order entry is ignored (never reaches the backend) and flags the
  // inline error instead. A valid commit — including any preset — clears it.
  const commitIfValid = (next: { from: string; to: string }): void => {
    if (next.from <= next.to) {
      setInvalid(false);
      setDateRange(next);
    } else {
      setInvalid(true);
    }
  };

  return (
    <Stack gap="xs" className="date-range-picker">
      <Group gap="md" align="flex-end">
        <Input.Wrapper label="From" className="date-range-picker__field">
          <Input
            component="input"
            type="date"
            aria-label="From date"
            value={dateRange.from}
            max={dateRange.to}
            onChange={(e) => commitIfValid({ ...dateRange, from: e.currentTarget.value })}
          />
        </Input.Wrapper>
        <Input.Wrapper label="To" className="date-range-picker__field">
          <Input
            component="input"
            type="date"
            aria-label="To date"
            value={dateRange.to}
            min={dateRange.from}
            onChange={(e) => commitIfValid({ ...dateRange, to: e.currentTarget.value })}
          />
        </Input.Wrapper>

        <Group gap="xs" className="date-range-picker__presets">
          {QUICK_SELECTS.map((preset) => (
            <Button
              key={preset.label}
              variant="light"
              size="xs"
              onClick={() => commitIfValid(preset.range())}
            >
              {preset.label}
            </Button>
          ))}
        </Group>
      </Group>

      {invalid && (
        <Text role="alert" c="red" size="sm" className="date-range-picker__error">
          Start date must not be after end date.
        </Text>
      )}
    </Stack>
  );
}

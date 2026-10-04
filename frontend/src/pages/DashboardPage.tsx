import { Container, Stack, Title } from "@mantine/core";

import { SankeyDiagram } from "../components/sankey/SankeyDiagram";
import { SankeyNodePanel } from "../components/sankey/SankeyNodePanel";
import { ConfidenceSlider } from "../components/shared/ConfidenceSlider";
import { DateRangePicker } from "../components/shared/DateRangePicker";
import { usePreferences } from "../hooks/usePreferences";
import { useAppStore } from "../store/useAppStore";

/**
 * Dashboard: the shared date range drives a period Sankey diagram. Clicking an
 * expense-category node opens the drill-down panel (mounted only while open, via
 * `sankeyPanel.open`).
 */
export function DashboardPage(): JSX.Element {
  const dateRange = useAppStore((s) => s.dateRange);
  const sankeyPanelOpen = useAppStore((s) => s.sankeyPanel.open);
  const { data: prefs } = usePreferences();
  const minConfidence = prefs?.ml_min_confidence ?? 0.3;

  return (
    <Container size="lg" className="page page--dashboard">
      <Stack gap="md">
        <Title order={1}>Dashboard</Title>
        <DateRangePicker />
        <ConfidenceSlider />
        <SankeyDiagram
          dateFrom={dateRange.from}
          dateTo={dateRange.to}
          minConfidence={minConfidence}
        />
        {sankeyPanelOpen && <SankeyNodePanel />}
      </Stack>
    </Container>
  );
}

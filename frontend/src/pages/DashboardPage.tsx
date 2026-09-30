import { SankeyDiagram } from "../components/sankey/SankeyDiagram";
import { SankeyNodePanel } from "../components/sankey/SankeyNodePanel";
import { DateRangePicker } from "../components/shared/DateRangePicker";
import { useAppStore } from "../store/useAppStore";

/**
 * Dashboard: the shared date range drives a period Sankey diagram. Clicking an
 * expense-category node opens the drill-down panel (mounted only while open, via
 * `sankeyPanel.open`).
 */
export function DashboardPage(): JSX.Element {
  const dateRange = useAppStore((s) => s.dateRange);
  const sankeyPanelOpen = useAppStore((s) => s.sankeyPanel.open);

  return (
    <section className="page page--dashboard">
      <h1>Dashboard</h1>
      <DateRangePicker />
      <SankeyDiagram dateFrom={dateRange.from} dateTo={dateRange.to} />
      {sankeyPanelOpen && <SankeyNodePanel />}
    </section>
  );
}

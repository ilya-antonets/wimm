import ReactECharts from "echarts-for-react";

import { useSankeyData } from "../../hooks/useSankeyData";
import { useAppStore } from "../../store/useAppStore";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import type { SankeyPayload } from "../../types";

interface SankeyDiagramProps {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
}

/** Click payload ECharts hands back — `name` holds the node's `SankeyNode.id`. */
interface SankeyClickParams {
  dataType?: string;
  name?: string;
}

/** Tooltip callback param for a single node or edge. */
interface TooltipParams {
  dataType: string;
  name: string;
  value: number;
  data: { source?: string; target?: string };
}

/** Build the ECharts `option` from a Sankey payload. */
function buildOption(payload: SankeyPayload): Record<string, unknown> {
  return {
    series: [
      {
        type: "sankey",
        layout: "none",
        emphasis: { focus: "adjacency" },
        // ECharts keys nodes by `name`; we use the stable node id so links
        // (which reference ids) line up, and render the human label separately.
        data: payload.nodes.map((n) => ({
          name: n.id,
          label: { formatter: () => n.name },
        })),
        links: payload.links.map((l) => ({
          source: l.source,
          target: l.target,
          value: l.value,
        })),
        label: { position: "right" },
        lineStyle: { color: "gradient", opacity: 0.4 },
      },
    ],
    tooltip: {
      trigger: "item",
      formatter: (params: TooltipParams) => {
        if (params.dataType === "edge") {
          const src = payload.nodes.find((n) => n.id === params.data.source);
          const tgt = payload.nodes.find((n) => n.id === params.data.target);
          return `${src?.name ?? params.data.source} → ${tgt?.name ?? params.data.target}: ${params.value}`;
        }
        const node = payload.nodes.find((n) => n.id === params.name);
        return `${node?.name ?? params.name}: ${params.value}`;
      },
    },
  };
}

/**
 * Renders the period Sankey (income → expenses → balance) via ECharts. Clicking
 * an expense-category node — the only nodes carrying `transaction_ids` — opens
 * the drill-down panel through the shared store; income and separator nodes
 * (Expenses/Proficit/Deficit) have no ids and are ignored.
 */
export function SankeyDiagram({ dateFrom, dateTo }: SankeyDiagramProps): JSX.Element {
  const { payload, isLoading, error } = useSankeyData(dateFrom, dateTo);
  const openSankeyPanel = useAppStore((s) => s.openSankeyPanel);

  if (isLoading) {
    return <LoadingSpinner label="Loading diagram…" />;
  }

  if (error) {
    return (
      <p role="alert" className="sankey-diagram__error">
        Failed to load diagram: {error.message}
      </p>
    );
  }

  if (!payload || payload.nodes.length === 0) {
    return <p className="sankey-diagram__empty">No transactions in this period</p>;
  }

  const handleNodeClick = (params: SankeyClickParams): void => {
    // Edges fire the same `click` event; only nodes carry drill-down ids.
    if (params.dataType === "edge") return;
    const node = payload.nodes.find((n) => n.id === params.name);
    if (node && node.transaction_ids && node.transaction_ids.length > 0) {
      openSankeyPanel(node.id, node.name, node.transaction_ids);
    }
  };

  return (
    <div className="sankey-diagram">
      <ReactECharts
        option={buildOption(payload)}
        onEvents={{ click: handleNodeClick }}
        style={{ height: 500 }}
      />
    </div>
  );
}

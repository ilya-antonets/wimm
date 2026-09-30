import { useCategoryTree } from "../../hooks/useCategoryTree";
import { useMappings } from "../../hooks/useMappings";
import { useTransactions } from "../../hooks/useTransactions";
import { useAppStore } from "../../store/useAppStore";
import { LoadingSpinner } from "../shared/LoadingSpinner";

const CURRENCY_SYMBOL = "$";

function formatAmount(amount: string): string {
  const value = Number(amount);
  const sign = value < 0 ? "-" : "";
  return `${sign}${CURRENCY_SYMBOL}${Math.abs(value).toFixed(2)}`;
}

/**
 * Slide-in drill-down panel for a clicked expense-category Sankey node. Lists
 * the node's transactions (fetched by id — the backend returns the `ids` set
 * unpaginated, so a single request covers them) and lets the user reassign each
 * to another category. A reassignment invalidates `["sankey"]` (via
 * `useMappings`) and closes the panel, so the diagram recomputes with the row
 * moved to its new node.
 *
 * Rendered only while `sankeyPanel.open` — the parent mounts it conditionally,
 * so the id-fetch never fires with an empty list.
 */
export function SankeyNodePanel(): JSX.Element {
  const sankeyPanel = useAppStore((s) => s.sankeyPanel);
  const closeSankeyPanel = useAppStore((s) => s.closeSankeyPanel);

  const { data, isLoading, error } = useTransactions({
    ids: sankeyPanel.transactionIds,
    page: 1,
    pageSize: 200,
  });
  const { categories } = useCategoryTree();
  const { createOrUpdateMapping } = useMappings();

  const items = data?.items ?? [];

  return (
    <aside
      className="sankey-node-panel"
      role="dialog"
      aria-label={`${sankeyPanel.nodeName} details`}
    >
      <header className="sankey-node-panel__header">
        <h2>{sankeyPanel.nodeName} — Expenses</h2>
        <button type="button" aria-label="Close panel" onClick={closeSankeyPanel}>
          ×
        </button>
      </header>

      {isLoading ? (
        <LoadingSpinner label="Loading transactions…" />
      ) : error ? (
        <p role="alert" className="sankey-node-panel__error">
          Failed to load transactions: {error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="sankey-node-panel__empty">No transactions in this category.</p>
      ) : (
        <ul className="sankey-node-panel__list">
          {items.map((tx) => (
            <li key={tx.id} className="sankey-node-panel__row">
              <span className="sankey-node-panel__date">{tx.date}</span>
              <span className="sankey-node-panel__description">{tx.description}</span>
              <span className="sankey-node-panel__amount">{formatAmount(tx.amount)}</span>
              <select
                aria-label={`Category for ${tx.description}`}
                value={tx.mapping?.category_id ?? ""}
                onChange={(e) => {
                  const categoryId = Number(e.target.value);
                  if (e.target.value !== "" && !Number.isNaN(categoryId)) {
                    createOrUpdateMapping.mutate(
                      { transaction_id: tx.id, category_id: categoryId },
                      { onSuccess: () => closeSankeyPanel() }
                    );
                  }
                }}
              >
                <option value="">Unassigned</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

import { Drawer, Group, NativeSelect, Stack, Text } from "@mantine/core";

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
    <Drawer
      opened={sankeyPanel.open}
      onClose={closeSankeyPanel}
      position="right"
      size="md"
      className="sankey-node-panel"
      title={`${sankeyPanel.nodeName} — Expenses`}
      closeButtonProps={{ "aria-label": "Close panel" }}
    >
      {isLoading ? (
        <LoadingSpinner label="Loading transactions…" />
      ) : error ? (
        <Text role="alert" c="red" className="sankey-node-panel__error">
          Failed to load transactions: {error.message}
        </Text>
      ) : items.length === 0 ? (
        <Text c="dimmed" className="sankey-node-panel__empty">
          No transactions in this category.
        </Text>
      ) : (
        <Stack gap="sm" className="sankey-node-panel__list">
          {items.map((tx) => (
            <Group
              key={tx.id}
              className="sankey-node-panel__row"
              justify="space-between"
              wrap="nowrap"
            >
              <Text component="span" size="sm" className="sankey-node-panel__date">
                {tx.date}
              </Text>
              <Text component="span" style={{ flex: 1 }} className="sankey-node-panel__description">
                {tx.description}
              </Text>
              <Text component="span" className="sankey-node-panel__amount">
                {formatAmount(tx.amount)}
              </Text>
              <NativeSelect
                aria-label={`Category for ${tx.description}`}
                value={tx.mapping?.category_id ?? ""}
                onChange={(e) => {
                  const categoryId = Number(e.currentTarget.value);
                  if (e.currentTarget.value !== "" && !Number.isNaN(categoryId)) {
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
              </NativeSelect>
            </Group>
          ))}
        </Stack>
      )}
    </Drawer>
  );
}

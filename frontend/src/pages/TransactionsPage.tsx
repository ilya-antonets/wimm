import { Box, Flex } from "@mantine/core";

import { CategoryPanel } from "../components/categories/CategoryPanel";
import { ConfidenceSlider } from "../components/shared/ConfidenceSlider";
import { TransactionTable } from "../components/transactions/TransactionTable";
import { usePreferences } from "../hooks/usePreferences";
import { useAppStore } from "../store/useAppStore";

export function TransactionsPage(): JSX.Element {
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);
  const { data: prefs } = usePreferences();
  const minConfidence = prefs?.ml_min_confidence ?? 0.3;

  return (
    <Flex className="page page--transactions" gap="md" align="flex-start" wrap="wrap">
      <Box style={{ flex: "0 0 auto" }}>
        <CategoryPanel />
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <ConfidenceSlider />
        <TransactionTable filterCategoryId={activeCategoryId} minConfidence={minConfidence} />
      </Box>
    </Flex>
  );
}

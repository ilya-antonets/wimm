import { Box, Flex } from "@mantine/core";

import { CategoryPanel } from "../components/categories/CategoryPanel";
import { TransactionTable } from "../components/transactions/TransactionTable";
import { useAppStore } from "../store/useAppStore";

export function TransactionsPage(): JSX.Element {
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);

  return (
    <Flex className="page page--transactions" gap="md" align="flex-start" wrap="wrap">
      <Box style={{ flex: "0 0 auto" }}>
        <CategoryPanel />
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <TransactionTable filterCategoryId={activeCategoryId} />
      </Box>
    </Flex>
  );
}

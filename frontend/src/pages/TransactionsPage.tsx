import { CategoryPanel } from "../components/categories/CategoryPanel";
import { TransactionTable } from "../components/transactions/TransactionTable";
import { useAppStore } from "../store/useAppStore";

export function TransactionsPage(): JSX.Element {
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);

  return (
    <section className="page page--transactions">
      <CategoryPanel />
      <TransactionTable filterCategoryId={activeCategoryId} />
    </section>
  );
}

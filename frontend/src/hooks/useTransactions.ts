import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  deleteTransaction,
  listTransactions,
  type TransactionFilters,
} from "../services/transactionService";
import type { TransactionPage } from "../types";

interface UseTransactionsReturn {
  data: TransactionPage | undefined;
  isLoading: boolean;
  error: Error | null;
  deleteTransaction: UseMutationResult<void, Error, number>;
}

/**
 * Transactions query keyed on `["transactions", filters]` — any filter change
 * refetches. `deleteTransaction` invalidates `["transactions"]` and `["sankey"]`
 * (removing a row changes the balance flows).
 */
export function useTransactions(filters: TransactionFilters): UseTransactionsReturn {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => listTransactions(filters),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["sankey"] });
      toast.success("Transaction deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    deleteTransaction: deleteMutation,
  };
}

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import { createBank, deleteBank, listBanks, updateBank } from "../services/bankService";
import type { BankCreate, BankRead, BankUpdate } from "../types";

type UpdateBankVariables = { id: number } & BankUpdate;

interface BankMutations {
  createBank: UseMutationResult<BankRead, Error, BankCreate>;
  updateBank: UseMutationResult<BankRead, Error, UpdateBankVariables>;
  deleteBank: UseMutationResult<void, Error, number>;
}

interface UseBanksReturn extends BankMutations {
  banks: BankRead[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Bank mutations without subscribing to the `["banks"]` query — for components
 * that only write (e.g. BankConfigModal) and should not add a redundant query
 * observer. Mutations invalidate `["banks"]`; deleting a bank also invalidates
 * `["transactions"]` since the backend cascades linked rows (and a delete is
 * only allowed once they are gone, but the cache is refreshed defensively).
 */
export function useBankMutations(): BankMutations {
  const queryClient = useQueryClient();

  const createMutation = useMutation<BankRead, Error, BankCreate>({
    mutationFn: createBank,
    onSuccess: (bank) => {
      void queryClient.invalidateQueries({ queryKey: ["banks"] });
      toast.success(`Bank "${bank.name}" saved`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation<BankRead, Error, UpdateBankVariables>({
    mutationFn: ({ id, ...payload }) => updateBank(id, payload),
    onSuccess: (bank) => {
      void queryClient.invalidateQueries({ queryKey: ["banks"] });
      toast.success(`Bank "${bank.name}" updated`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: deleteBank,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banks"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Bank deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    createBank: createMutation,
    updateBank: updateMutation,
    deleteBank: deleteMutation,
  };
}

/**
 * Banks query + mutations. The query key is `["banks"]`. See
 * {@link useBankMutations} for the write-only variant.
 */
export function useBanks(): UseBanksReturn {
  const query = useQuery({ queryKey: ["banks"], queryFn: listBanks });
  const mutations = useBankMutations();

  return {
    banks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    ...mutations,
  };
}

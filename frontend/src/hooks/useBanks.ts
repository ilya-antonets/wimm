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

interface UseBanksReturn {
  banks: BankRead[];
  isLoading: boolean;
  error: Error | null;
  createBank: UseMutationResult<BankRead, Error, BankCreate>;
  updateBank: UseMutationResult<BankRead, Error, UpdateBankVariables>;
  deleteBank: UseMutationResult<void, Error, number>;
}

/**
 * Banks query + mutations. The query key is `["banks"]`. Mutations invalidate
 * `["banks"]`; deleting a bank also invalidates `["transactions"]` since the
 * backend cascades linked rows (and a delete is only allowed once they are
 * gone, but the cache is refreshed defensively).
 */
export function useBanks(): UseBanksReturn {
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ["banks"], queryFn: listBanks });

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
    banks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createBank: createMutation,
    updateBank: updateMutation,
    deleteBank: deleteMutation,
  };
}

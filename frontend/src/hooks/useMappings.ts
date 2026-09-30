import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { createOrUpdateMapping, deleteMapping } from "../services/mappingService";
import { logger } from "../utils/logger";
import type { MappingCreate, MappingRead } from "../types";

interface UseMappingsReturn {
  createOrUpdateMapping: UseMutationResult<MappingRead, Error, MappingCreate>;
  deleteMapping: UseMutationResult<void, Error, number>;
}

/**
 * Category-mapping mutations (write-only — mapping data is embedded in each
 * `TransactionRead`). Both mutations invalidate `["transactions"]`, `["sankey"]`,
 * and `["suggestions"]`: the suggestion query is keyed data, so invalidating it
 * refreshes the badges on rows that are still unmapped after the change.
 */
export function useMappings(): UseMappingsReturn {
  const queryClient = useQueryClient();

  const invalidateAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["sankey"] });
    void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
  };

  const createMutation = useMutation<MappingRead, Error, MappingCreate>({
    mutationFn: createOrUpdateMapping,
    onSuccess: (mapping) => {
      invalidateAll();
      logger.debug("Mapping created/updated", {
        transactionId: mapping.transaction_id,
        categoryId: mapping.category_id,
      });
      toast.success("Category assigned");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: deleteMapping,
    onSuccess: (_data, transactionId) => {
      invalidateAll();
      logger.debug("Mapping cleared", { transactionId });
      toast.success("Mapping cleared");
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    createOrUpdateMapping: createMutation,
    deleteMapping: deleteMutation,
  };
}

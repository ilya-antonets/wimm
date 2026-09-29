import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { importCsv } from "../services/importService";
import { logger } from "../utils/logger";
import type { ImportResult } from "../types";

interface ImportPayload {
  bankId: number;
  file: File;
}

interface UseImportReturn {
  importCsv: UseMutationResult<ImportResult, Error, ImportPayload>;
}

/**
 * CSV import mutation. On success it invalidates `["transactions"]` and
 * `["sankey"]` (the new rows change both). No success toast — the ImportModal
 * renders an inline summary instead, and keeps error handling local so it can
 * stay open when an import fails.
 */
export function useImport(): UseImportReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation<ImportResult, Error, ImportPayload>({
    mutationFn: ({ bankId, file }) => importCsv(bankId, file),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["sankey"] });
      logger.info("import", {
        new: result.new_transactions,
        duplicates: result.duplicate_transactions,
        failed: result.failed_rows.length,
        batchId: result.import_batch_id,
      });
    },
  });

  return { importCsv: mutation };
}

import { useQuery } from "@tanstack/react-query";

import { fetchSuggestions } from "../services/suggestionService";
import { logger } from "../utils/logger";
import type { SuggestionResult } from "../types";

interface UseSuggestionsReturn {
  suggestions: Map<number, SuggestionResult>;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * ML category suggestions for a set of expense transactions, exposed as a query
 * (not a mutation) so that `useMappings`' `invalidateQueries(["suggestions"])`
 * refreshes the badges after a mapping change. The ids are sorted into the
 * query key for cache stability, and the query is disabled when the set is empty
 * (the backend rejects an empty list with 422).
 */
export function useSuggestions(transactionIds: number[]): UseSuggestionsReturn {
  const sortedIds = [...transactionIds].sort((a, b) => a - b);

  const query = useQuery({
    queryKey: ["suggestions", sortedIds],
    enabled: sortedIds.length > 0,
    queryFn: async () => {
      const results = await fetchSuggestions(sortedIds);
      logger.debug("Suggestions received", {
        count: results.length,
        transactionIds: sortedIds,
      });
      // Results may be fewer than requested — key by transaction_id, not index.
      return new Map(results.map((r) => [r.transaction_id, r]));
    },
  });

  return {
    suggestions: query.data ?? new Map<number, SuggestionResult>(),
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

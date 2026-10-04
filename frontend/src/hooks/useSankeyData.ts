import { useQuery } from "@tanstack/react-query";

import { fetchSankey } from "../services/sankeyService";
import type { SankeyPayload } from "../types";

interface UseSankeyDataReturn {
  payload: SankeyPayload | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Sankey graph query keyed on `["sankey", dateFrom, dateTo, minConfidence]`. Assembly is
 * expensive server-side, so results are held for `staleTime` (30 s) to avoid
 * redundant refetches; the mutation hooks (`useTransactions`, `useCategoryTree`,
 * `useMappings`) invalidate the broad `["sankey"]` key, which still matches this
 * one and forces a recompute when the underlying data changes. The query is
 * disabled until both endpoints of the range are set.
 */
export function useSankeyData(
  dateFrom: string,
  dateTo: string,
  minConfidence: number
): UseSankeyDataReturn {
  const query = useQuery({
    queryKey: ["sankey", dateFrom, dateTo, minConfidence],
    queryFn: () => fetchSankey(dateFrom, dateTo, minConfidence),
    enabled: !!dateFrom && !!dateTo,
    staleTime: 30_000,
  });

  return {
    payload: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

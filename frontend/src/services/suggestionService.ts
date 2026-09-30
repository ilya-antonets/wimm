import type { SuggestionRequest, SuggestionResult } from "../types";

import { apiClient } from "./api";

/**
 * Fetch ML category suggestions for a batch of expense transactions (1–200
 * ids). The response may contain fewer results than requested — callers must
 * match results back to transactions by `transaction_id`, never by index.
 */
export async function fetchSuggestions(transactionIds: number[]): Promise<SuggestionResult[]> {
  const payload: SuggestionRequest = { transaction_ids: transactionIds };
  const { data } = await apiClient.post<SuggestionResult[]>("/suggestions", payload);
  return data;
}

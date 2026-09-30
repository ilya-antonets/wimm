import type { SankeyPayload } from "../types";

import { apiClient } from "./api";

/**
 * Sankey assembly service. The backend builds the full node/link graph for the
 * given period (income → expenses → balance). Paths omit the `/api` prefix — it
 * lives in the axios `baseURL` (see `api.ts`). Dates are `YYYY-MM-DD`.
 */
export async function fetchSankey(dateFrom: string, dateTo: string): Promise<SankeyPayload> {
  const { data } = await apiClient.get<SankeyPayload>("/sankey", {
    params: { date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

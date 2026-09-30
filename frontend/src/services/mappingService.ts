import type { MappingCreate, MappingRead } from "../types";

import { apiClient } from "./api";

/**
 * Category-mapping service (expense transactions only). `POST /mappings` is an
 * upsert — the backend returns 201 for a new mapping and 200 for a reassignment;
 * axios treats both as success, so callers need not distinguish them.
 */
export async function createOrUpdateMapping(payload: MappingCreate): Promise<MappingRead> {
  const { data } = await apiClient.post<MappingRead>("/mappings", payload);
  return data;
}

/** Clear a transaction's mapping. The path param is the transaction id. */
export async function deleteMapping(transactionId: number): Promise<void> {
  await apiClient.delete(`/mappings/${transactionId}`);
}

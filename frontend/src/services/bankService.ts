import type { BankCreate, BankRead, BankUpdate } from "../types";

import { apiClient } from "./api";

/**
 * Bank CRUD service. Paths omit the `/api` prefix — it lives in the axios
 * `baseURL` (see `api.ts`).
 */
export async function listBanks(): Promise<BankRead[]> {
  const { data } = await apiClient.get<BankRead[]>("/banks");
  return data;
}

export async function createBank(payload: BankCreate): Promise<BankRead> {
  const { data } = await apiClient.post<BankRead>("/banks", payload);
  return data;
}

export async function updateBank(id: number, payload: BankUpdate): Promise<BankRead> {
  const { data } = await apiClient.put<BankRead>(`/banks/${id}`, payload);
  return data;
}

export async function deleteBank(id: number): Promise<void> {
  await apiClient.delete(`/banks/${id}`);
}

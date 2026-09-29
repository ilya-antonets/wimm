import type { ImportResult } from "../types";

import { apiClient } from "./api";

/**
 * Upload a CSV file for a bank. Sends `multipart/form-data`, overriding the
 * shared client's default `application/json` header so the browser can set the
 * multipart boundary.
 */
export async function importCsv(bankId: number, file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("bank_id", String(bankId));
  form.append("file", file);

  const { data } = await apiClient.post<ImportResult>("/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

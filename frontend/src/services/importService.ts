import type { ImportResult } from "../types";

import { apiClient } from "./api";

/**
 * Upload a CSV file for a bank. The shared client defaults `Content-Type` to
 * `application/json`, and axios serializes a `FormData` body to JSON when the
 * content-type is JSON — which would corrupt the upload. Setting
 * `multipart/form-data` here takes axios's non-JSON branch (the FormData is sent
 * as-is); the browser then replaces this boundary-less value with a real
 * `multipart/form-data; boundary=…` header.
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

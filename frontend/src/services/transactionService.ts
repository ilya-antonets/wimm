import type { TransactionPage, TransactionType } from "../types";

import { apiClient } from "./api";

/**
 * Filters for {@link listTransactions}. `page`/`pageSize` are always sent; the
 * rest are optional and omitted from the query string when undefined. When
 * `ids` is set the backend performs an unpaginated bulk fetch and ignores the
 * other filters.
 */
export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: TransactionType;
  bankId?: number;
  categoryId?: number;
  unmapped?: boolean;
  search?: string;
  ids?: number[];
  page: number;
  pageSize: number;
}

/** Transactions list/filter service. */
export async function listTransactions(filters: TransactionFilters): Promise<TransactionPage> {
  const params: Record<string, string | number | boolean> = {
    page: filters.page,
    page_size: filters.pageSize,
  };
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  if (filters.type) params.type = filters.type;
  if (filters.bankId !== undefined) params.bank_id = filters.bankId;
  if (filters.categoryId !== undefined) params.category_id = filters.categoryId;
  if (filters.unmapped) params.unmapped = true;
  if (filters.search) params.search = filters.search;
  if (filters.ids && filters.ids.length > 0) params.ids = filters.ids.join(",");

  const { data } = await apiClient.get<TransactionPage>("/transactions", { params });
  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  await apiClient.delete(`/transactions/${id}`);
}

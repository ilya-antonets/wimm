export type TransactionType = "income" | "expense";

export interface MappingInfo {
  category_id: number;
  category_name: string;
}

export interface TransactionRead {
  id: number;
  bank_id: number;
  bank_name: string;
  import_batch_id: number | null;
  date: string; // ISO YYYY-MM-DD
  amount: string; // Decimal serialized as string to preserve precision
  description: string;
  type: TransactionType;
  mapping: MappingInfo | null;
}

export interface TransactionPage {
  items: TransactionRead[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

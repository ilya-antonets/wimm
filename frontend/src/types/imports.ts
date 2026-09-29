export interface FailedRow {
  row_number: number;
  raw_data: string;
  error: string;
}

export interface ImportResult {
  import_batch_id: number | null;
  total_rows_parsed: number;
  new_transactions: number;
  duplicate_transactions: number;
  failed_rows: FailedRow[];
}

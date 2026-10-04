export interface ColumnMap {
  date: string | number;
  amount: string | number;
  description: string | number;
  transaction_id?: string | number | null;
  memo?: string | number | null;
}

export interface BankCreate {
  name: string;
  column_map: ColumnMap;
  date_format: string;
  skip_header_rows?: number;
  skip_footer_rows?: number;
  encoding?: string;
}

export interface BankUpdate {
  name?: string;
  column_map?: ColumnMap;
  date_format?: string;
  skip_header_rows?: number;
  skip_footer_rows?: number;
  encoding?: string;
}

export interface BankRead {
  id: number;
  name: string;
  column_map: ColumnMap;
  date_format: string;
  skip_header_rows: number;
  skip_footer_rows: number;
  encoding: string;
}

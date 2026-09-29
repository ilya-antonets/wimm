export type SuggestionMethod = "exact" | "tfidf";

export interface SuggestionRequest {
  transaction_ids: number[];
}

export interface SuggestionResult {
  transaction_id: number;
  suggested_category_id: number;
  suggested_category_name: string;
  confidence: number;
  method: SuggestionMethod;
}

export interface MappingCreate {
  transaction_id: number;
  category_id: number;
}

export interface MappingRead {
  id: number;
  transaction_id: number;
  category_id: number;
}

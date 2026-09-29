export interface CategoryRead {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
}

export interface CategoryCreate {
  name: string;
  parent_id?: number | null;
  sort_order?: number;
}

export interface CategoryUpdate {
  name?: string;
  sort_order?: number;
}

export interface CategoryMoveRequest {
  new_parent_id?: number | null;
  sort_order?: number;
}

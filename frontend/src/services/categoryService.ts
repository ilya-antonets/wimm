import type { CategoryCreate, CategoryMoveRequest, CategoryRead, CategoryUpdate } from "../types";

import { apiClient } from "./api";

/**
 * Category tree service. The backend returns a flat list (each row carries
 * `parent_id`); the tree is assembled client-side. Paths omit the `/api`
 * prefix — it lives in the axios `baseURL` (see `api.ts`).
 */
export async function listCategories(): Promise<CategoryRead[]> {
  const { data } = await apiClient.get<CategoryRead[]>("/categories");
  return data;
}

export async function createCategory(payload: CategoryCreate): Promise<CategoryRead> {
  const { data } = await apiClient.post<CategoryRead>("/categories", payload);
  return data;
}

/** Rename / reorder a category. Reparenting goes through {@link moveCategory}. */
export async function renameCategory(id: number, payload: CategoryUpdate): Promise<CategoryRead> {
  const { data } = await apiClient.put<CategoryRead>(`/categories/${id}`, payload);
  return data;
}

export async function moveCategory(
  id: number,
  payload: CategoryMoveRequest
): Promise<CategoryRead> {
  const { data } = await apiClient.patch<CategoryRead>(`/categories/${id}/move`, payload);
  return data;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}

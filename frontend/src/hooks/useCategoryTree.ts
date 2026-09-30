import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  createCategory,
  deleteCategory,
  listCategories,
  moveCategory,
  renameCategory,
} from "../services/categoryService";
import type { CategoryCreate, CategoryMoveRequest, CategoryRead } from "../types";

type RenameCategoryVariables = { id: number; name: string };
type MoveCategoryVariables = { id: number } & CategoryMoveRequest;

interface CategoryMutations {
  createCategory: UseMutationResult<CategoryRead, Error, CategoryCreate>;
  renameCategory: UseMutationResult<CategoryRead, Error, RenameCategoryVariables>;
  moveCategory: UseMutationResult<CategoryRead, Error, MoveCategoryVariables>;
  deleteCategory: UseMutationResult<void, Error, number>;
}

interface UseCategoryTreeReturn extends CategoryMutations {
  categories: CategoryRead[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Category mutations. All invalidate `["categories"]`. Renaming, moving, and
 * deleting a category also invalidate `["transactions"]` and `["sankey"]`: a
 * rename changes the label shown in transaction rows and Sankey nodes, a move
 * reshapes the Sankey roll-up (which follows `parent_id`), and a delete
 * reassigns the subtree's mappings to Uncategorized. Only create needs no
 * downstream invalidation (a brand-new category has no transactions yet).
 */
export function useCategoryMutations(): CategoryMutations {
  const queryClient = useQueryClient();

  const createMutation = useMutation<CategoryRead, Error, CategoryCreate>({
    mutationFn: createCategory,
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(`Category "${category.name}" created`);
    },
    onError: (err) => toast.error(err.message),
  });

  const renameMutation = useMutation<CategoryRead, Error, RenameCategoryVariables>({
    mutationFn: ({ id, name }) => renameCategory(id, { name }),
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["sankey"] });
      toast.success(`Category renamed to "${category.name}"`);
    },
    onError: (err) => toast.error(err.message),
  });

  const moveMutation = useMutation<CategoryRead, Error, MoveCategoryVariables>({
    mutationFn: ({ id, ...payload }) => moveCategory(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["sankey"] });
      toast.success("Category moved");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: deleteCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["sankey"] });
      toast.success("Category deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  return {
    createCategory: createMutation,
    renameCategory: renameMutation,
    moveCategory: moveMutation,
    deleteCategory: deleteMutation,
  };
}

/**
 * Category tree query + mutations. The query key is `["categories"]`; the list
 * is flat (each row carries `parent_id`) and assembled into a tree by consumers.
 */
export function useCategoryTree(): UseCategoryTreeReturn {
  const query = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const mutations = useCategoryMutations();

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    ...mutations,
  };
}

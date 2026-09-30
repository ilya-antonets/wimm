import { useState } from "react";

import { useCategoryTree } from "../../hooks/useCategoryTree";
import { useAppStore } from "../../store/useAppStore";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { LoadingSpinner } from "../shared/LoadingSpinner";

import { CategoryTree } from "./CategoryTree";

/** Pending inline category creation. `parentId` null = new root category. */
interface PendingCreate {
  parentId: number | null;
}

/**
 * Left sidebar for the Transactions page. Hosts the category tree and its
 * create/rename/move/delete actions, and syncs the selected node with
 * `store.activeCategoryId` (which drives the transaction table's filter).
 */
export function CategoryPanel(): JSX.Element {
  const {
    categories,
    isLoading,
    error,
    createCategory,
    renameCategory,
    moveCategory,
    deleteCategory,
  } = useCategoryTree();
  const activeCategoryId = useAppStore((s) => s.activeCategoryId);
  const setActiveCategoryId = useAppStore((s) => s.setActiveCategoryId);

  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const beginCreate = (parentId: number | null): void => {
    setNewName("");
    setPendingCreate({ parentId });
  };

  const submitCreate = (): void => {
    const name = newName.trim();
    if (!name || !pendingCreate) return;
    createCategory.mutate(
      { name, parent_id: pendingCreate.parentId, sort_order: 0 },
      { onSuccess: () => setPendingCreate(null) }
    );
  };

  const deletingCategory =
    pendingDeleteId != null ? (categories.find((c) => c.id === pendingDeleteId) ?? null) : null;

  return (
    <aside className="category-panel">
      <header className="category-panel__header">
        <h2>Categories</h2>
        <button type="button" onClick={() => beginCreate(null)}>
          New root category
        </button>
      </header>

      {pendingCreate && (
        <form
          className="category-panel__create"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <input
            aria-label="New category name"
            autoFocus
            placeholder={
              pendingCreate.parentId == null ? "Root category name" : "Child category name"
            }
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={createCategory.isPending || !newName.trim()}>
            {createCategory.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setPendingCreate(null)}>
            Cancel
          </button>
        </form>
      )}

      {isLoading ? (
        <LoadingSpinner label="Loading categories…" />
      ) : error ? (
        <p role="alert" className="category-panel__error">
          Failed to load categories: {error.message}
        </p>
      ) : (
        <CategoryTree
          categories={categories}
          selectedNodeId={activeCategoryId}
          onNodeSelect={(id) => setActiveCategoryId(activeCategoryId === id ? null : id)}
          onAdd={(parentId) => beginCreate(parentId)}
          onRename={(id, name) => renameCategory.mutate({ id, name })}
          onDelete={(id) => setPendingDeleteId(id)}
          onMove={(id, newParentId, index) =>
            moveCategory.mutate({ id, new_parent_id: newParentId, sort_order: index })
          }
        />
      )}

      <ConfirmDialog
        open={deletingCategory != null}
        title="Delete category"
        message={
          deletingCategory
            ? `Delete "${deletingCategory.name}"? Its transactions will move to Uncategorized.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteId != null) deleteCategory.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </aside>
  );
}

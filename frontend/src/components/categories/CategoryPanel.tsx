import { Button, Group, Paper, Text, TextInput, Title } from "@mantine/core";
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
    <Paper component="aside" className="category-panel" withBorder p="md" radius="md">
      <Group className="category-panel__header" justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Categories
        </Title>
        <Button variant="light" size="xs" onClick={() => beginCreate(null)}>
          New root category
        </Button>
      </Group>

      {pendingCreate && (
        <form
          className="category-panel__create"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <Group gap="xs" mb="sm" align="flex-end">
            <TextInput
              aria-label="New category name"
              data-autofocus
              autoFocus
              style={{ flex: 1 }}
              placeholder={
                pendingCreate.parentId == null ? "Root category name" : "Child category name"
              }
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
            />
            <Button type="submit" disabled={createCategory.isPending || !newName.trim()}>
              {createCategory.isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="default" onClick={() => setPendingCreate(null)}>
              Cancel
            </Button>
          </Group>
        </form>
      )}

      {isLoading ? (
        <LoadingSpinner label="Loading categories…" />
      ) : error ? (
        <Text role="alert" c="red" className="category-panel__error">
          Failed to load categories: {error.message}
        </Text>
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
    </Paper>
  );
}

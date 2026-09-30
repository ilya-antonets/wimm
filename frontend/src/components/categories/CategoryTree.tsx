import { useRef } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";

import type { CategoryRead } from "../../types";

/** Uncategorized — protected root category; cannot be renamed/moved/deleted. */
const UNCATEGORIZED_ID = 1;

export interface CategoryTreeProps {
  categories: CategoryRead[];
  selectedNodeId: number | null;
  onNodeSelect: (categoryId: number | null) => void;
  onAdd: (parentId: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onMove: (id: number, newParentId: number | null, index: number) => void;
}

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
}

type MutableNode = { id: string; name: string; children: MutableNode[] };

/**
 * Transform the flat category list (each row carries `parent_id`) into the
 * nested shape react-arborist expects, sorted by `sort_order`. Ids are
 * stringified (react-arborist requires string ids) and parsed back in the
 * event handlers. Leaves get `children: undefined` so they don't render an
 * expand toggle.
 */
function buildTree(categories: CategoryRead[]): TreeNode[] {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const nodes = new Map<number, MutableNode>(
    sorted.map((c) => [c.id, { id: String(c.id), name: c.name, children: [] }])
  );
  const roots: MutableNode[] = [];
  for (const c of sorted) {
    const node = nodes.get(c.id);
    if (!node) continue;
    const parent = c.parent_id != null ? nodes.get(c.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const normalize = (list: MutableNode[]): TreeNode[] =>
    list.map((n) => ({
      id: n.id,
      name: n.name,
      children: n.children.length > 0 ? normalize(n.children) : undefined,
    }));
  return normalize(roots);
}

/**
 * Category hierarchy tree. Selection, inline rename (double-click or the Rename
 * action), per-node Add-child / Delete actions, and drag-to-reparent flow up to
 * the parent via callbacks. The Uncategorized node (id=1) exposes no
 * rename/delete actions and cannot be dragged — the backend also rejects those.
 */
export function CategoryTree({
  categories,
  selectedNodeId,
  onNodeSelect,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: CategoryTreeProps): JSX.Element {
  const data = buildTree(categories);

  // Set when a rename is settled via Enter/Escape so the input's subsequent
  // blur (fired as it unmounts) doesn't re-submit — Enter would double-commit,
  // Escape would resurrect the discarded value.
  const suppressBlurCommitRef = useRef(false);

  const Node = ({ node, style, dragHandle }: NodeRendererProps<TreeNode>): JSX.Element => {
    const id = Number(node.id);
    const isProtected = id === UNCATEGORIZED_ID;
    const hasChildren = !node.isLeaf;

    return (
      <div className="category-tree__node" style={style} ref={dragHandle}>
        {hasChildren ? (
          <button
            type="button"
            className="category-tree__toggle"
            aria-label={node.isOpen ? "Collapse" : "Expand"}
            onClick={() => node.toggle()}
          >
            {node.isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span
            className="category-tree__toggle category-tree__toggle--spacer"
            aria-hidden="true"
          />
        )}

        {node.isEditing ? (
          <input
            className="category-tree__rename-input"
            aria-label={`New name for ${node.data.name}`}
            autoFocus
            defaultValue={node.data.name}
            onBlur={(e) => {
              // Clicking away commits the typed value; Enter/Escape already
              // settled it and set the suppress flag.
              if (suppressBlurCommitRef.current) {
                suppressBlurCommitRef.current = false;
                return;
              }
              node.submit(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                suppressBlurCommitRef.current = true;
                node.submit(e.currentTarget.value);
              }
              if (e.key === "Escape") {
                suppressBlurCommitRef.current = true;
                node.reset();
              }
            }}
          />
        ) : (
          <span
            className={
              selectedNodeId === id
                ? "category-tree__label category-tree__label--selected"
                : "category-tree__label"
            }
            onClick={() => onNodeSelect(id)}
            onDoubleClick={() => {
              if (!isProtected) void node.edit();
            }}
          >
            {node.data.name}
          </span>
        )}

        <span className="category-tree__actions">
          <button
            type="button"
            aria-label={`Add child to ${node.data.name}`}
            onClick={() => onAdd(id)}
          >
            +
          </button>
          {!isProtected && (
            <>
              <button
                type="button"
                aria-label={`Rename ${node.data.name}`}
                onClick={() => void node.edit()}
              >
                Rename
              </button>
              <button
                type="button"
                aria-label={`Delete ${node.data.name}`}
                onClick={() => onDelete(id)}
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  return (
    <Tree<TreeNode>
      data={data}
      width={260}
      height={400}
      rowHeight={32}
      indent={16}
      disableDrag={(node) => Number(node.id) === UNCATEGORIZED_ID}
      onRename={({ id, name }) => onRename(Number(id), name)}
      onMove={({ dragIds, parentId, index }) => {
        const dragId = dragIds[0];
        if (dragId === undefined) return;
        const numericId = Number(dragId);
        if (numericId === UNCATEGORIZED_ID) return;
        onMove(numericId, parentId != null ? Number(parentId) : null, index);
      }}
    >
      {Node}
    </Tree>
  );
}

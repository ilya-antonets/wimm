import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CategoryTree } from "../../components/categories/CategoryTree";
import type { CategoryRead } from "../../types";

const categories: CategoryRead[] = [
  { id: 1, name: "Uncategorized", parent_id: null, sort_order: 0 },
  { id: 2, name: "Food", parent_id: null, sort_order: 1 },
  { id: 3, name: "Groceries", parent_id: 2, sort_order: 0 },
];

function renderTree(overrides: Partial<Parameters<typeof CategoryTree>[0]> = {}) {
  const props = {
    categories,
    selectedNodeId: null,
    onNodeSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };
  render(<CategoryTree {...props} />);
  return props;
}

describe("CategoryTree", () => {
  it("renders a node per category", () => {
    renderTree();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("fires onAdd with the parent id when Add child is clicked", async () => {
    const user = userEvent.setup();
    const props = renderTree();

    await user.click(screen.getByRole("button", { name: "Add child to Food" }));
    expect(props.onAdd).toHaveBeenCalledWith(2);
  });

  it("enters rename mode on double-click", async () => {
    const user = userEvent.setup();
    renderTree();

    await user.dblClick(screen.getByText("Food"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("exposes no rename or delete actions for the Uncategorized node", () => {
    renderTree();
    expect(screen.queryByRole("button", { name: "Rename Uncategorized" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Uncategorized" })).not.toBeInTheDocument();
    // The protected node still allows adding a child.
    expect(screen.getByRole("button", { name: "Add child to Uncategorized" })).toBeInTheDocument();
  });
});

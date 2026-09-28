import logging

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

from app.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import Category, Mapping
from app.services.ml_suggester import MLSuggester

logger = logging.getLogger(__name__)

UNCATEGORIZED_ID = 1


def get_all_categories(db: Session) -> list[Category]:
    """Returns all categories ordered by (parent_id NULLS FIRST, sort_order, id)."""
    return list(
        db.scalars(
            select(Category).order_by(
                Category.parent_id.nulls_first(), Category.sort_order, Category.id
            )
        )
    )


def create_category(
    db: Session,
    name: str,
    parent_id: int | None,
    sort_order: int,
) -> Category:
    if parent_id is not None and db.get(Category, parent_id) is None:
        raise NotFoundError(f"Parent category {parent_id} not found")
    _check_sibling_conflict(db, name, parent_id, exclude_id=None)
    cat = Category(name=name, parent_id=parent_id, sort_order=sort_order)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def rename_category(
    db: Session,
    category_id: int,
    new_name: str | None,
    new_sort_order: int | None = None,
) -> Category:
    cat = db.get(Category, category_id)
    if cat is None:
        raise NotFoundError(f"Category {category_id} not found")
    if category_id == UNCATEGORIZED_ID:
        raise ForbiddenError("Cannot modify the Uncategorized category")
    if new_name is None and new_sort_order is None:
        return cat
    if new_name is not None:
        _check_sibling_conflict(db, new_name, cat.parent_id, exclude_id=category_id)
        cat.name = new_name
    if new_sort_order is not None:
        cat.sort_order = new_sort_order
    db.commit()
    db.refresh(cat)
    return cat


def move_category(
    db: Session,
    category_id: int,
    new_parent_id: int | None,
    sort_order: int,
) -> Category:
    cat = db.get(Category, category_id)
    if cat is None:
        raise NotFoundError(f"Category {category_id} not found")
    if category_id == UNCATEGORIZED_ID:
        raise ForbiddenError("Cannot move the Uncategorized category")
    if new_parent_id is not None and db.get(Category, new_parent_id) is None:
        raise NotFoundError(f"Parent category {new_parent_id} not found")
    _assert_no_cycle(db, category_id, new_parent_id)
    _check_sibling_conflict(db, cat.name, new_parent_id, exclude_id=category_id)
    cat.parent_id = new_parent_id
    cat.sort_order = sort_order
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, category_id: int, suggester: MLSuggester) -> None:
    cat = db.get(Category, category_id)
    if cat is None:
        raise NotFoundError(f"Category {category_id} not found")
    if category_id == UNCATEGORIZED_ID:
        raise ForbiddenError("Cannot delete the Uncategorized category")

    subtree_ids = _get_subtree_ids(db, category_id)

    reassigned_count: int = (
        db.scalar(select(func.count(Mapping.id)).where(Mapping.category_id.in_(subtree_ids))) or 0
    )

    db.execute(
        update(Mapping)
        .where(Mapping.category_id.in_(subtree_ids))
        .values(category_id=UNCATEGORIZED_ID)
    )

    for cat_id in subtree_ids:
        db.execute(delete(Category).where(Category.id == cat_id))

    db.commit()

    logger.info(
        "Category deleted: id=%d subtree_size=%d mappings_reassigned=%d",
        category_id,
        len(subtree_ids),
        reassigned_count,
    )
    suggester.invalidate()


def _get_subtree_ids(db: Session, root_id: int) -> list[int]:
    result = db.execute(
        text(
            "WITH RECURSIVE subtree(id, depth) AS ("
            "    SELECT id, 0 FROM categories WHERE id = :root_id"
            "    UNION ALL"
            "    SELECT c.id, s.depth + 1"
            "    FROM categories c JOIN subtree s ON c.parent_id = s.id"
            ") SELECT id FROM subtree ORDER BY depth DESC"
        ),
        {"root_id": root_id},
    )
    return [int(row[0]) for row in result]


def _assert_no_cycle(db: Session, category_id: int, new_parent_id: int | None) -> None:
    if new_parent_id is None:
        return
    subtree_ids = _get_subtree_ids(db, category_id)
    if new_parent_id in subtree_ids:
        raise ValidationError(
            f"Cannot move category {category_id}: new parent {new_parent_id} is a descendant"
        )


def _check_sibling_conflict(
    db: Session,
    name: str,
    parent_id: int | None,
    exclude_id: int | None,
) -> None:
    stmt = select(func.count(Category.id)).where(
        Category.parent_id == parent_id,
        Category.name == name,
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    count: int = db.scalar(stmt) or 0
    if count > 0:
        raise ConflictError(f"Category '{name}' already exists under this parent")

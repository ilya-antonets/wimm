from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.exceptions import ForbiddenError
from app.models import Category, Mapping
from app.services import category_service as svc
from tests.factories import BankFactory, CategoryFactory, MappingFactory, TransactionFactory


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    CategoryFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db
    MappingFactory._meta.sqlalchemy_session = db


def test_build_tree(db: Session) -> None:
    root = CategoryFactory.create(parent_id=None, sort_order=0)
    child1 = CategoryFactory.create(parent_id=root.id, sort_order=0)
    child2 = CategoryFactory.create(parent_id=root.id, sort_order=1)

    result = svc.get_all_categories(db)
    ids = [c.id for c in result]

    assert 1 in ids
    assert ids.index(1) < ids.index(root.id)
    assert ids.index(root.id) < ids.index(child1.id)
    assert ids.index(child1.id) < ids.index(child2.id)


def test_delete_leaf_with_mappings(db: Session) -> None:
    cat = CategoryFactory.create()
    bank = BankFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense")
    mapping = MappingFactory.create(transaction=tx, category=cat)
    mock_suggester = MagicMock()

    svc.delete_category(db, cat.id, mock_suggester)

    assert db.get(Category, cat.id) is None
    reloaded = db.get(Mapping, mapping.id)
    assert reloaded is not None
    assert reloaded.category_id == 1
    mock_suggester.invalidate.assert_called_once()


def test_delete_parent_reassigns_all_descendants(db: Session) -> None:
    parent = CategoryFactory.create()
    child = CategoryFactory.create(parent_id=parent.id)
    bank = BankFactory.create()
    tx_parent = TransactionFactory.create(bank=bank, type="expense")
    tx_child = TransactionFactory.create(bank=bank, type="expense")
    m_parent = MappingFactory.create(transaction=tx_parent, category=parent)
    m_child = MappingFactory.create(transaction=tx_child, category=child)

    parent_id = parent.id
    child_id = child.id
    m_parent_id = m_parent.id
    m_child_id = m_child.id
    mock_suggester = MagicMock()

    svc.delete_category(db, parent_id, mock_suggester)

    # Expunge to clear identity map so db.get() does a fresh SELECT
    db.expunge_all()
    assert db.get(Category, parent_id) is None
    assert db.get(Category, child_id) is None
    m_parent_row = db.get(Mapping, m_parent_id)
    m_child_row = db.get(Mapping, m_child_id)
    assert m_parent_row is not None and m_parent_row.category_id == 1
    assert m_child_row is not None and m_child_row.category_id == 1


def test_cannot_delete_uncategorized(db: Session) -> None:
    with pytest.raises(ForbiddenError):
        svc.delete_category(db, 1, MagicMock())


def test_cannot_rename_uncategorized(db: Session) -> None:
    with pytest.raises(ForbiddenError):
        svc.rename_category(db, 1, "x")


def test_move_node_updates_parent_id(db: Session) -> None:
    parent_a = CategoryFactory.create(parent_id=None)
    parent_b = CategoryFactory.create(parent_id=None)
    child = CategoryFactory.create(parent_id=parent_a.id)

    svc.move_category(db, child.id, parent_b.id, sort_order=0)

    db.refresh(child)
    assert child.parent_id == parent_b.id


def test_subtree_ids_depth_desc(db: Session) -> None:
    parent = CategoryFactory.create(parent_id=None)
    child = CategoryFactory.create(parent_id=parent.id)
    grandchild = CategoryFactory.create(parent_id=child.id)

    ids = svc._get_subtree_ids(db, parent.id)

    assert len(ids) == 3
    assert set(ids) == {parent.id, child.id, grandchild.id}
    assert ids.index(grandchild.id) < ids.index(child.id) < ids.index(parent.id)

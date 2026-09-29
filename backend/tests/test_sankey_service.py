from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.schemas.sankey import SankeyLink, SankeyNode
from app.schemas.suggestions import SuggestionResult
from app.services import sankey_service as svc
from tests.factories import BankFactory, CategoryFactory, MappingFactory, TransactionFactory

DATE_FROM = date(2025, 1, 1)
DATE_TO = date(2025, 12, 31)


@pytest.fixture(autouse=True)
def _configure_factories(db: Session) -> None:
    BankFactory._meta.sqlalchemy_session = db
    CategoryFactory._meta.sqlalchemy_session = db
    TransactionFactory._meta.sqlalchemy_session = db
    MappingFactory._meta.sqlalchemy_session = db


def _no_suggestions() -> MagicMock:
    mock = MagicMock()
    mock.suggest.return_value = []
    return mock


def _node(nodes: list[SankeyNode], node_id: str) -> SankeyNode | None:
    return next((n for n in nodes if n.id == node_id), None)


def _link(links: list[SankeyLink], source: str, target: str) -> SankeyLink | None:
    return next((link for link in links if link.source == source and link.target == target), None)


def test_income_node_per_transaction(db: Session) -> None:
    bank = BankFactory.create()
    tx1 = TransactionFactory.create(bank=bank, type="income", amount=Decimal("600.00"))
    tx2 = TransactionFactory.create(bank=bank, type="income", amount=Decimal("400.00"))

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    income_nodes = [n for n in payload.nodes if n.id.startswith("income_")]
    assert len(income_nodes) == 2
    for tx in (tx1, tx2):
        assert _link(payload.links, f"income_{tx.id}", svc.EXPENSES_NODE_ID) is not None
    assert payload.period_income == 1000.0
    # Income nodes carry no drill-down transaction ids.
    assert all(n.transaction_ids is None for n in income_nodes)


def test_expense_node_per_category(db: Session) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    transport = CategoryFactory.create(name="Transport")
    tx_g = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-30.00"))
    MappingFactory.create(transaction=tx_g, category=groceries)
    tx_t = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-20.00"))
    MappingFactory.create(transaction=tx_t, category=transport)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    g_node = _node(payload.nodes, f"cat_{groceries.id}")
    t_node = _node(payload.nodes, f"cat_{transport.id}")
    assert g_node is not None and g_node.transaction_ids == [tx_g.id]
    assert t_node is not None and t_node.transaction_ids == [tx_t.id]
    assert _link(payload.links, svc.EXPENSES_NODE_ID, f"cat_{groceries.id}") == SankeyLink(
        source=svc.EXPENSES_NODE_ID, target=f"cat_{groceries.id}", value=30.0
    )
    assert payload.period_expenses == 50.0


def test_proficit_when_income_exceeds_expenses(db: Session) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    TransactionFactory.create(bank=bank, type="income", amount=Decimal("1000.00"))
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-800.00"))
    MappingFactory.create(transaction=tx, category=cat)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    assert payload.balance == 200.0
    assert _node(payload.nodes, svc.PROFICIT_NODE_ID) is not None
    assert _node(payload.nodes, svc.DEFICIT_NODE_ID) is None
    link = _link(payload.links, svc.EXPENSES_NODE_ID, svc.PROFICIT_NODE_ID)
    assert link is not None and link.value == 200.0


def test_deficit_when_expenses_exceed_income(db: Session) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    TransactionFactory.create(bank=bank, type="income", amount=Decimal("800.00"))
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-1000.00"))
    MappingFactory.create(transaction=tx, category=cat)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    assert payload.balance == -200.0
    assert _node(payload.nodes, svc.DEFICIT_NODE_ID) is not None
    assert _node(payload.nodes, svc.PROFICIT_NODE_ID) is None
    link = _link(payload.links, svc.DEFICIT_NODE_ID, svc.EXPENSES_NODE_ID)
    assert link is not None and link.value == 200.0


def test_balanced_no_extra_node(db: Session) -> None:
    bank = BankFactory.create()
    cat = CategoryFactory.create()
    TransactionFactory.create(bank=bank, type="income", amount=Decimal("500.00"))
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-500.00"))
    MappingFactory.create(transaction=tx, category=cat)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    assert payload.balance == 0.0
    assert _node(payload.nodes, svc.PROFICIT_NODE_ID) is None
    assert _node(payload.nodes, svc.DEFICIT_NODE_ID) is None


def test_empty_period(db: Session) -> None:
    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    assert payload.nodes == []
    assert payload.links == []
    assert payload.period_income == 0.0
    assert payload.period_expenses == 0.0
    assert payload.balance == 0.0


def test_unmapped_expense_falls_back_to_ml(db: Session) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-50.00"))
    suggester = MagicMock()
    suggester.suggest.return_value = [
        SuggestionResult(
            transaction_id=tx.id,
            suggested_category_id=groceries.id,
            suggested_category_name="Groceries",
            confidence=0.9,
            method="tfidf",
        )
    ]

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, suggester)

    node = _node(payload.nodes, f"cat_{groceries.id}")
    assert node is not None and node.transaction_ids == [tx.id]
    link = _link(payload.links, svc.EXPENSES_NODE_ID, f"cat_{groceries.id}")
    assert link is not None and link.value == 50.0


def test_low_confidence_suggestion_goes_to_uncategorized(db: Session) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-50.00"))
    suggester = MagicMock()
    suggester.suggest.return_value = [
        SuggestionResult(
            transaction_id=tx.id,
            suggested_category_id=groceries.id,
            suggested_category_name="Groceries",
            confidence=0.1,  # below ml_min_confidence (0.3)
            method="tfidf",
        )
    ]

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, suggester)

    assert _node(payload.nodes, f"cat_{groceries.id}") is None
    uncategorized = _node(payload.nodes, "cat_1")
    assert uncategorized is not None and uncategorized.transaction_ids == [tx.id]


def test_unmapped_with_no_ml_data_uncategorized(db: Session) -> None:
    bank = BankFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-25.00"))

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    node = _node(payload.nodes, "cat_1")
    assert node is not None and node.transaction_ids == [tx.id]
    link = _link(payload.links, svc.EXPENSES_NODE_ID, "cat_1")
    assert link is not None and link.value == 25.0


def test_ml_returns_deleted_category_falls_back_to_uncategorized(db: Session) -> None:
    bank = BankFactory.create()
    tx = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-40.00"))
    suggester = MagicMock()
    suggester.suggest.return_value = [
        SuggestionResult(
            transaction_id=tx.id,
            suggested_category_id=9999,  # no longer exists
            suggested_category_name="Ghost",
            confidence=0.95,
            method="tfidf",
        )
    ]

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, suggester)

    assert _node(payload.nodes, "cat_9999") is None
    node = _node(payload.nodes, "cat_1")
    assert node is not None and node.transaction_ids == [tx.id]


def test_mixed_mapped_and_unmapped_totals(db: Session) -> None:
    bank = BankFactory.create()
    groceries = CategoryFactory.create(name="Groceries")
    mapped = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-60.00"))
    MappingFactory.create(transaction=mapped, category=groceries)
    unmapped = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-40.00"))
    suggester = MagicMock()
    suggester.suggest.return_value = [
        SuggestionResult(
            transaction_id=unmapped.id,
            suggested_category_id=groceries.id,
            suggested_category_name="Groceries",
            confidence=0.8,
            method="tfidf",
        )
    ]

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, suggester)

    node = _node(payload.nodes, f"cat_{groceries.id}")
    assert node is not None
    assert set(node.transaction_ids or []) == {mapped.id, unmapped.id}
    link = _link(payload.links, svc.EXPENSES_NODE_ID, f"cat_{groceries.id}")
    assert link is not None and link.value == 100.0
    assert payload.period_expenses == 100.0


def test_synthetic_child_for_branch_with_direct_transactions(db: Session) -> None:
    bank = BankFactory.create()
    parent = CategoryFactory.create(name="Food")
    child = CategoryFactory.create(name="Restaurants", parent_id=parent.id)
    tx_parent = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-70.00"))
    MappingFactory.create(transaction=tx_parent, category=parent)
    tx_child = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-30.00"))
    MappingFactory.create(transaction=tx_child, category=child)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    # Parent node rolls up both transactions; synthetic direct node holds only its own.
    parent_node = _node(payload.nodes, f"cat_{parent.id}")
    assert parent_node is not None
    assert set(parent_node.transaction_ids or []) == {tx_parent.id, tx_child.id}
    direct_node = _node(payload.nodes, f"cat_{parent.id}_direct")
    assert direct_node is not None and direct_node.transaction_ids == [tx_parent.id]

    # Parent inflow (100) = outflow to child (30) + direct sink (70).
    parent_link = _link(payload.links, svc.EXPENSES_NODE_ID, f"cat_{parent.id}")
    assert parent_link is not None and parent_link.value == 100.0
    child_link = _link(payload.links, f"cat_{parent.id}", f"cat_{child.id}")
    assert child_link is not None and child_link.value == 30.0
    direct_link = _link(payload.links, f"cat_{parent.id}", f"cat_{parent.id}_direct")
    assert direct_link is not None and direct_link.value == 70.0


def test_negative_income_amount_yields_positive_link(db: Session) -> None:
    # A wrong-sign import (income row stored negative) must not produce a negative link
    # value (ECharts rejects it) nor understate period_income.
    bank = BankFactory.create()
    TransactionFactory.create(bank=bank, type="income", amount=Decimal("-500.00"))

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    income_links = [link for link in payload.links if link.target == svc.EXPENSES_NODE_ID]
    assert income_links and all(link.value > 0 for link in income_links)
    assert payload.period_income == 500.0


def test_zero_sum_direct_branch_has_no_orphan_node(db: Session) -> None:
    # A branch category whose own direct transactions sum to zero must not emit a
    # synthetic `_direct` node, which would otherwise dangle with no connecting link.
    bank = BankFactory.create()
    parent = CategoryFactory.create(name="Food")
    child = CategoryFactory.create(name="Restaurants", parent_id=parent.id)
    # Child has a real expense → parent becomes a visible branch node.
    tx_child = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("-30.00"))
    MappingFactory.create(transaction=tx_child, category=child)
    # Parent's own direct transaction sums to zero.
    tx_parent = TransactionFactory.create(bank=bank, type="expense", amount=Decimal("0.00"))
    MappingFactory.create(transaction=tx_parent, category=parent)

    payload = svc.build_sankey(db, DATE_FROM, DATE_TO, _no_suggestions())

    assert _node(payload.nodes, f"cat_{parent.id}_direct") is None
    # Every node must be referenced by at least one link (no orphans).
    referenced = {link.source for link in payload.links} | {link.target for link in payload.links}
    assert all(node.id in referenced for node in payload.nodes)

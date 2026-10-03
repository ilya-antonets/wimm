import logging
from collections import defaultdict
from collections.abc import Iterator
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Category, Mapping, Transaction
from app.schemas.sankey import SankeyLink, SankeyNode, SankeyPayload
from app.services.category_service import UNCATEGORIZED_ID
from app.services.ml_suggester import MLSuggester

logger = logging.getLogger(__name__)

EXPENSES_NODE_ID = "__expenses__"
PROFICIT_NODE_ID = "__proficit__"
DEFICIT_NODE_ID = "__deficit__"


def _ancestors(cat_id: int, cat_map: dict[int, Category]) -> Iterator[int]:
    """Yield ancestor category ids from immediate parent up to the root."""
    current = cat_map[cat_id]
    while current.parent_id is not None:
        yield current.parent_id
        current = cat_map[current.parent_id]


def build_sankey(
    db: Session,
    date_from: date,
    date_to: date,
    suggester: MLSuggester,
) -> SankeyPayload:
    """Assemble the ECharts Sankey payload for a date range.

    Income transactions flow into a single ``Expenses`` node, which distributes
    to a category tree; a ``Proficit``/``Deficit`` node closes the flow. Unmapped
    expense transactions are categorized on-the-fly via the ML suggester (the
    ``mappings`` table stores only user-confirmed decisions). Implements the
    10-step algorithm in ``docs/design_v1.md`` Section 12.
    """
    # Steps 1-2: income nodes + links to the Expenses node.
    income_nodes, income_links, total_income = _income_nodes_and_links(db, date_from, date_to)

    # Steps 3-8: resolve expense categories (with ML), roll up the tree, build
    # category nodes/links. The Expenses hub node is owned by this function so it
    # is present in the income-only case too (income flows straight to Proficit).
    category_nodes, category_links, total_expenses = _expense_nodes_and_links(
        db, date_from, date_to, suggester
    )

    # Early return: nothing to render for this period.
    if not income_nodes and not category_nodes:
        return SankeyPayload(
            nodes=[],
            links=[],
            period_income=float(total_income),
            period_expenses=float(total_expenses),
            balance=float(total_income - total_expenses),
        )

    # Step 9: balance node.
    balance = total_income - total_expenses
    balance_node, balance_link = _balance_node_and_link(balance)

    # Step 10: assemble.
    nodes = income_nodes + [SankeyNode(id=EXPENSES_NODE_ID, name="Expenses")] + category_nodes
    links = income_links + category_links
    if balance_node is not None and balance_link is not None:
        nodes.append(balance_node)
        links.append(balance_link)

    return SankeyPayload(
        nodes=nodes,
        links=links,
        period_income=float(total_income),
        period_expenses=float(total_expenses),
        balance=float(balance),
    )


def _income_nodes_and_links(
    db: Session,
    date_from: date,
    date_to: date,
) -> tuple[list[SankeyNode], list[SankeyLink], Decimal]:
    rows = db.execute(
        select(Transaction.id, Transaction.description, Transaction.amount)
        .where(
            Transaction.type == "income",
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .order_by(Transaction.date, Transaction.id)
    ).all()

    nodes: list[SankeyNode] = []
    links: list[SankeyLink] = []
    total_income = Decimal(0)
    for tx_id, description, amount in rows:
        node_id = f"income_{tx_id}"
        nodes.append(SankeyNode(id=node_id, name=str(description)[:40]))
        # abs() mirrors the expense path: guards against a wrong-sign import so the
        # link value stays positive (ECharts requires it) and period_income is not understated.
        links.append(SankeyLink(source=node_id, target=EXPENSES_NODE_ID, value=float(abs(amount))))
        total_income += abs(amount)
    return nodes, links, total_income


def _expense_nodes_and_links(
    db: Session,
    date_from: date,
    date_to: date,
    suggester: MLSuggester,
) -> tuple[list[SankeyNode], list[SankeyLink], Decimal]:
    # Step 3: category metadata.
    cat_map: dict[int, Category] = {c.id: c for c in db.scalars(select(Category))}

    # Step 4: split expense transactions into mapped vs unmapped, then infer.
    expense_rows = db.execute(
        select(Transaction.id, Transaction.amount, Mapping.category_id)
        .join(Mapping, Mapping.transaction_id == Transaction.id, isouter=True)
        .where(
            Transaction.type == "expense",
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
    ).all()

    expense_amounts: dict[int, Decimal] = {}
    mapped_by_tx: dict[int, int] = {}
    unmapped_ids: list[int] = []
    for tx_id, amount, category_id in expense_rows:
        expense_amounts[tx_id] = amount
        if category_id is not None:
            mapped_by_tx[tx_id] = category_id
        else:
            unmapped_ids.append(tx_id)

    if unmapped_ids:
        for s in suggester.suggest(db, unmapped_ids):
            if s.confidence >= settings.ml_min_confidence and s.suggested_category_id in cat_map:
                mapped_by_tx[s.transaction_id] = s.suggested_category_id
            else:
                # Below threshold or category deleted since the suggestion → safety net.
                mapped_by_tx[s.transaction_id] = UNCATEGORIZED_ID
        # Transactions with no suggestion at all (no training data) → Uncategorized.
        for tx_id in unmapped_ids:
            if tx_id not in mapped_by_tx:
                mapped_by_tx[tx_id] = UNCATEGORIZED_ID

    # Step 5: aggregate per-category totals (absolute amounts).
    raw_totals: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
    for tx_id, cat_id in mapped_by_tx.items():
        raw_totals[cat_id] += abs(expense_amounts[tx_id])

    # Step 6: visible node set + rolled-up totals (mark ancestors visible).
    visible_ids: set[int] = set()
    node_totals: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
    for cat_id, total in raw_totals.items():
        node_totals[cat_id] += total
        visible_ids.add(cat_id)
        for ancestor_id in _ancestors(cat_id, cat_map):
            node_totals[ancestor_id] += total
            visible_ids.add(ancestor_id)

    total_expenses = sum(raw_totals.values(), Decimal(0))

    if not visible_ids:
        return [], [], total_expenses

    # Step 7: reverse indices for drill-down (rolled up) and direct-only.
    tx_ids_by_cat: dict[int, list[int]] = defaultdict(list)
    direct_tx_ids_by_cat: dict[int, list[int]] = defaultdict(list)
    for tx_id, cat_id in mapped_by_tx.items():
        direct_tx_ids_by_cat[cat_id].append(tx_id)
        tx_ids_by_cat[cat_id].append(tx_id)
        for ancestor_id in _ancestors(cat_id, cat_map):
            tx_ids_by_cat[ancestor_id].append(tx_id)

    # A category is a branch node if any visible node references it as parent. Step 6
    # already marks every ancestor visible, so a non-None parent is always visible.
    nodes_with_children = {
        cat_map[c].parent_id for c in visible_ids if cat_map[c].parent_id is not None
    }

    # Branch categories that carry their own directly-mapped expenses need a synthetic
    # child node so the diagram stays balanced (inflow = outflow for every node). Gate on
    # a positive rolled-up total, not merely tx count: a branch whose direct transactions
    # sum to zero would otherwise emit a node with no connecting link (an orphan).
    direct_node_cat_ids = {
        cat_id
        for cat_id in visible_ids
        if cat_id in nodes_with_children and raw_totals.get(cat_id, Decimal(0)) > 0
    }

    # Order visible categories depth-first by sibling-scoped `sort_order` so the
    # diagram's node order matches the expanded category tree — this keeps links
    # from crossing (the frontend renders them in this exact order).
    children_by_parent: dict[int | None, list[int]] = defaultdict(list)
    for cat_id in visible_ids:
        children_by_parent[cat_map[cat_id].parent_id].append(cat_id)
    for siblings in children_by_parent.values():
        siblings.sort(key=lambda c: (cat_map[c].sort_order, c))

    ordered_ids: list[int] = []

    def _walk(cat_id: int) -> None:
        ordered_ids.append(cat_id)
        for child_id in children_by_parent[cat_id]:
            _walk(child_id)

    roots = sorted(
        (
            cat_id
            for cat_id in visible_ids
            if cat_map[cat_id].parent_id is None or cat_map[cat_id].parent_id not in visible_ids
        ),
        key=lambda c: (cat_map[c].sort_order, c),
    )
    for root_id in roots:
        _walk(root_id)

    nodes: list[SankeyNode] = []
    for cat_id in ordered_ids:
        cat = cat_map[cat_id]
        nodes.append(
            SankeyNode(
                id=f"cat_{cat_id}",
                name=cat.name,
                transaction_ids=tx_ids_by_cat.get(cat_id),
            )
        )
        if cat_id in direct_node_cat_ids:
            nodes.append(
                SankeyNode(
                    id=f"cat_{cat_id}_direct",
                    name=f"{cat.name} (direct)",
                    transaction_ids=direct_tx_ids_by_cat[cat_id],
                )
            )

    # Step 8: expense links.
    links: list[SankeyLink] = []
    for cat_id in ordered_ids:
        cat = cat_map[cat_id]
        if cat.parent_id is None or cat.parent_id not in visible_ids:
            source = EXPENSES_NODE_ID
        else:
            source = f"cat_{cat.parent_id}"
        links.append(
            SankeyLink(source=source, target=f"cat_{cat_id}", value=float(node_totals[cat_id]))
        )
        # Route a branch node's own direct transactions into its synthetic child;
        # without this the branch node's inflow > outflow, which ECharts rejects.
        if cat_id in direct_node_cat_ids:
            links.append(
                SankeyLink(
                    source=f"cat_{cat_id}",
                    target=f"cat_{cat_id}_direct",
                    value=float(raw_totals[cat_id]),
                )
            )

    return nodes, links, total_expenses


def _balance_node_and_link(balance: Decimal) -> tuple[SankeyNode | None, SankeyLink | None]:
    if balance > 0:
        # Income exceeds expenses → Proficit is a right-side sink.
        node = SankeyNode(id=PROFICIT_NODE_ID, name="Proficit")
        link = SankeyLink(source=EXPENSES_NODE_ID, target=PROFICIT_NODE_ID, value=float(balance))
        return node, link
    if balance < 0:
        # Expenses exceed income → Deficit is a left-side source feeding Expenses.
        node = SankeyNode(id=DEFICIT_NODE_ID, name="Deficit")
        link = SankeyLink(
            source=DEFICIT_NODE_ID, target=EXPENSES_NODE_ID, value=float(abs(balance))
        )
        return node, link
    return None, None

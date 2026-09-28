"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-09-28

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "banks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("column_map", sa.JSON(), nullable=False),
        sa.Column("date_format", sa.String(40), nullable=False),
        sa.Column("skip_header_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skip_footer_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("encoding", sa.String(30), nullable=False, server_default="utf-8"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_id", sa.Integer(), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["bank_id"], ["banks.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_batches_bank_id", "import_batches", ["bank_id"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_id", sa.Integer(), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 4), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("dedup_key", sa.Text(), nullable=False),
        sa.CheckConstraint("type IN ('income', 'expense')", name="ck_transactions_type"),
        sa.ForeignKeyConstraint(["bank_id"], ["banks.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key"),
    )
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_bank_id", "transactions", ["bank_id"])
    op.create_index("ix_transactions_type", "transactions", ["type"])
    op.create_index("ix_transactions_date_type", "transactions", ["date", "type"])

    op.create_table(
        "mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_id"),
    )
    op.create_index("ix_mappings_category_id", "mappings", ["category_id"])

    op.execute(
        "INSERT INTO categories (id, name, parent_id, sort_order) "
        "VALUES (1, 'Uncategorized', NULL, 0)"
    )


def downgrade() -> None:
    op.drop_table("mappings")
    op.drop_table("transactions")
    op.drop_table("import_batches")
    op.drop_table("categories")
    op.drop_table("banks")

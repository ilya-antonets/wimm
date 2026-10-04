"""user preferences

Revision ID: 002
Revises: 001
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ml_min_confidence", sa.Float(), nullable=False, server_default="0.3"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO user_preferences (id, ml_min_confidence) VALUES (1, 0.3)")


def downgrade() -> None:
    op.drop_table("user_preferences")

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Bank(Base):
    __tablename__ = "banks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    column_map: Mapped[dict] = mapped_column(JSON, nullable=False)  # type: ignore[type-arg]
    date_format: Mapped[str] = mapped_column(String(40), nullable=False)
    skip_header_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skip_footer_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    encoding: Mapped[str] = mapped_column(String(30), nullable=False, default="utf-8")

    transactions: Mapped[list[Transaction]] = relationship(
        "Transaction", back_populates="bank", passive_deletes=True
    )
    import_batches: Mapped[list[ImportBatch]] = relationship(
        "ImportBatch", back_populates="bank", passive_deletes=True
    )


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("banks.id", ondelete="RESTRICT"), nullable=False
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)

    bank: Mapped[Bank] = relationship("Bank", back_populates="import_batches")
    transactions: Mapped[list[Transaction]] = relationship(
        "Transaction", back_populates="import_batch"
    )

    __table_args__ = (Index("ix_import_batches_bank_id", "bank_id"),)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("banks.id", ondelete="RESTRICT"), nullable=False
    )
    import_batch_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    dedup_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    bank: Mapped[Bank] = relationship("Bank", back_populates="transactions")
    import_batch: Mapped[ImportBatch | None] = relationship(
        "ImportBatch", back_populates="transactions"
    )
    mapping: Mapped[Mapping | None] = relationship(
        "Mapping",
        back_populates="transaction",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def bank_name(self) -> str:
        return self.bank.name

    __table_args__ = (
        CheckConstraint("type IN ('income', 'expense')", name="ck_transactions_type"),
        Index("ix_transactions_date", "date"),
        Index("ix_transactions_bank_id", "bank_id"),
        Index("ix_transactions_type", "type"),
        Index("ix_transactions_date_type", "date", "type"),
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    parent: Mapped[Category | None] = relationship(
        "Category", remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list[Category]] = relationship("Category", back_populates="parent")
    mappings: Mapped[list[Mapping]] = relationship("Mapping", back_populates="category")

    __table_args__ = (Index("ix_categories_parent_id", "parent_id"),)


class Mapping(Base):
    __tablename__ = "mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )

    transaction: Mapped[Transaction] = relationship("Transaction", back_populates="mapping")
    category: Mapped[Category] = relationship("Category", back_populates="mappings")

    @property
    def category_name(self) -> str:
        return self.category.name

    __table_args__ = (Index("ix_mappings_category_id", "category_id"),)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    ml_min_confidence: Mapped[float] = mapped_column(nullable=False, default=0.3)

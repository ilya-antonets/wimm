import uuid
from datetime import date

import factory
from factory.alchemy import SQLAlchemyModelFactory

from app.models import Bank, Category, Transaction


class BankFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Bank
        sqlalchemy_session_persistence = "commit"

    name = factory.Sequence(lambda n: f"Bank {n}")
    column_map = {"date": 0, "amount": 1, "description": 2}
    date_format = "%Y-%m-%d"
    skip_header_rows = 0
    skip_footer_rows = 0
    encoding = "utf-8"


class TransactionFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Transaction
        sqlalchemy_session_persistence = "commit"

    bank = factory.SubFactory(BankFactory)
    date = date(2025, 1, 15)
    amount = factory.Faker("pydecimal", left_digits=4, right_digits=2, positive=False)
    description = factory.Faker("sentence", nb_words=4)
    type = "expense"
    dedup_key = factory.LazyAttribute(lambda o: f"test:{uuid.uuid4().hex}")


class CategoryFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Category
        sqlalchemy_session_persistence = "commit"

    name = factory.Sequence(lambda n: f"Category {n}")
    parent_id = None
    sort_order = factory.Sequence(lambda n: n)

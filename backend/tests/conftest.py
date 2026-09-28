from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_db
from app.main import app
from app.models import Base, Category


@pytest.fixture(scope="function")
def db_engine() -> Generator[Engine, None, None]:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection: object, connection_record: object) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")  # type: ignore[attr-defined]

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(db_engine: Engine) -> Generator[Session, None, None]:
    SessionFactory = sessionmaker(bind=db_engine)
    session = SessionFactory()
    session.add(Category(id=1, name="Uncategorized", parent_id=None, sort_order=0))
    session.commit()
    yield session
    session.close()


@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = lambda: db

    @asynccontextmanager
    async def noop_lifespan(app: object) -> AsyncGenerator[None, None]:
        yield

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = noop_lifespan  # type: ignore[assignment]
    try:
        with TestClient(app) as c:
            yield c
    finally:
        del app.dependency_overrides[get_db]
        app.router.lifespan_context = original_lifespan

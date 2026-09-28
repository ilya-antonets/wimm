import asyncio
import logging
import sys
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.exceptions import register_exception_handlers
from app.routers import banks

_access_log = logging.getLogger("app.middleware")


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        ms = round((time.perf_counter() - start) * 1000)
        _access_log.info(
            "%s %s → %d (%d ms)",
            request.method,
            request.url.path,
            response.status_code,
            ms,
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.logging_config import configure_logging

    configure_logging()
    logger = logging.getLogger("app.main")
    logger.info("WIMM backend starting up")

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        "upgrade",
        "head",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode is None or proc.returncode != 0:
        output = (stdout.decode() + "\n" + stderr.decode()).strip()
        raise RuntimeError(f"Alembic migration failed:\n{output}")

    yield

    logger.info("WIMM backend shutting down")


app = FastAPI(title="WIMM API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AccessLogMiddleware)

register_exception_handlers(app)

app.include_router(banks.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

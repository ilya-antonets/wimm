import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.exceptions")


class WIMMException(Exception):
    def __init__(self, detail: str, status_code: int = 500) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class NotFoundError(WIMMException):
    def __init__(self, detail: str = "Not found") -> None:
        super().__init__(detail=detail, status_code=404)


class ConflictError(WIMMException):
    def __init__(self, detail: str = "Conflict") -> None:
        super().__init__(detail=detail, status_code=409)


class ForbiddenError(WIMMException):
    def __init__(self, detail: str = "Forbidden") -> None:
        super().__init__(detail=detail, status_code=403)


class ValidationError(WIMMException):
    def __init__(self, detail: str = "Validation error") -> None:
        super().__init__(detail=detail, status_code=400)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(WIMMException)
    async def wimm_exception_handler(request: Request, exc: WIMMException) -> JSONResponse:
        if exc.status_code >= 500:
            logger.exception("Internal error: %s", exc.detail, exc_info=exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

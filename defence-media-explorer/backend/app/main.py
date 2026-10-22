"""API process. Indexes are created in the configured database only."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.auth.security import hash_password
from app.config import get_settings
from app.db.client import configure_logging, ping
from app.db.indexes import ensure_database
from app.errors import AppError, error_body
from app.health import diagnose
from app.providers.voyage import VoyageEmbeddingProvider
from app.runtime import build_repo, build_storage, mongo_client

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.mongo_client = mongo_client(settings)
        app.state.repo = build_repo(settings) if app.state.mongo_client is not None and ping(app.state.mongo_client) else None
        app.state.storage = None
        try:
            app.state.storage = build_storage(settings)
        except AppError as exc:
            logger.warning("object storage unavailable code=%s", exc.code)
        app.state.embeddings = VoyageEmbeddingProvider(settings)
        app.state.server_version = ping(app.state.mongo_client) if app.state.mongo_client is not None else None
        if app.state.repo is not None and app.state.mongo_client is not None:
            try:
                ensure_database(app.state.mongo_client, settings)
            except Exception:
                logger.warning("index ensure failed")
            _seed_admin(app.state.repo, settings)
        app.state.health = diagnose(settings, app.state.mongo_client)
        logger.info(
            "startup status=%s unavailable=%s",
            app.state.health["status"],
            ",".join(app.state.health["unavailable"]),
        )
        yield

    app = FastAPI(
        title="Defence Media Explorer API",
        version="1.0.0",
        summary="Archive retrieval for defence media. Search responses omit embedding arrays.",
        description=(
            "Upload media, enrich it, store JSON documents and embeddings in MongoDB Atlas, "
            "and retrieve evidence with Atlas Vector Search, Atlas Search, or reciprocal rank fusion. "
            "Interactive documentation is this page. The OpenAPI document is /openapi.json."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.app_base_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.params))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for item in exc.errors():
            loc = [str(part) for part in item.get("loc", []) if part not in {"body", "query"}]
            if loc:
                fields.append(".".join(loc))
        return JSONResponse(status_code=422, content=error_body("VALIDATION_ERROR", {"fields": fields}))

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error type=%s", type(exc).__name__)
        return JSONResponse(status_code=500, content=error_body("INTERNAL_ERROR", {}))

    return app


def _seed_admin(repo, settings) -> None:
    if not settings.demo_admin_email or not settings.demo_admin_password:
        return
    if repo.get_user_by_email(settings.demo_admin_email):
        return
    try:
        repo.insert_user(
            {
                "email": settings.demo_admin_email,
                "passwordHash": hash_password(settings.demo_admin_password),
                "displayName": "Administrator",
                "role": "admin",
                "workspaceId": settings.demo_workspace_id,
                "locale": settings.default_locale,
                "timeZone": settings.default_timezone,
            }
        )
        logger.info("demo admin seeded")
    except AppError as exc:
        logger.warning("demo admin not seeded code=%s", exc.code)


app = create_app()

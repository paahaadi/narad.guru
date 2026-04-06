from __future__ import annotations

from contextlib import asynccontextmanager, suppress

import redis.asyncio as redis
import uvicorn
from fastapi import FastAPI

from narad.api.admin import router as admin_router
from narad.api.corpwatch import router as corpwatch_router
from narad.api.health import router as health_router
from narad.api.internal import router as internal_router
from narad.api.lexpulse import router as lexpulse_router
from narad.config import get_settings
from narad.db.session import Database
from narad.workers.celery_app import celery


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)

    await database.connect()

    app.state.settings = settings
    app.state.database = database
    app.state.db_pool = database.pool
    app.state.redis = redis_client
    app.state.celery = celery

    try:
        app.state.default_tenant_id = await database.resolve_default_tenant_id()
    except Exception:
        app.state.default_tenant_id = database._default_tenant_id

    with suppress(Exception):
        await redis_client.ping()

    try:
        yield
    finally:
        await redis_client.aclose()
        await database.disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    app.include_router(health_router)
    app.include_router(admin_router, prefix="/api/admin")
    app.include_router(corpwatch_router)
    app.include_router(lexpulse_router)
    app.include_router(internal_router)  # Track 4D: AI internal endpoints
    return app


app = create_app()


def run_dev_server() -> None:
    settings = get_settings()
    uvicorn.run(
        "narad.main:app",
        host="0.0.0.0",
        port=settings.intelligence_port,
        reload=False,
    )

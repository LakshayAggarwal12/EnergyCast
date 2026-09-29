from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import admin, auth, datasets, models
from app.config import get_settings
from app.database.base import Base
from app.database.session import engine, get_db
from app.database import models as _orm_models  # noqa: F401  (register tables)
from app.services.training_service import mark_interrupted_runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_storage_dirs()
    Base.metadata.create_all(engine)  # phase 1: no migrations yet (Alembic is planned for the next phase)
    mark_interrupted_runs()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="EnergiCast API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(auth.router)
    app.include_router(datasets.public_router)
    app.include_router(datasets.admin_router)
    app.include_router(models.router)
    app.include_router(admin.router)

    @app.get("/api/health", tags=["health"])
    def health(db: Session = Depends(get_db)):
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()

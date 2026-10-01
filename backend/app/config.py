"""Application settings, loaded from environment variables / backend/.env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
_PLACEHOLDER_SECRETS = {"replace_with_strong_secret", "changeme", "secret"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    MODEL_STORAGE_PATH: Path = Path("./models")
    DATA_STORAGE_PATH: Path = Path("./data")
    CORS_ORIGINS: str = "http://localhost:5173"
    MAX_UPLOAD_MB: int = 500
    VALIDATION_TIMEOUT_SECONDS: int = 600  # 10 minutes for validation
    PROCESSING_TIMEOUT_SECONDS: int = 600  # 10 minutes for processing

    @field_validator("JWT_SECRET")
    @classmethod
    def _strong_secret(cls, value: str) -> str:
        if value.strip().lower() in _PLACEHOLDER_SECRETS or len(value) < 32:
            raise ValueError(
                "JWT_SECRET must be a strong random value of at least 32 characters"
            )
        return value

    @field_validator("MODEL_STORAGE_PATH", "DATA_STORAGE_PATH")
    @classmethod
    def _absolute_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BACKEND_DIR / value).resolve()

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def raw_dir(self) -> Path:
        return self.DATA_STORAGE_PATH / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.DATA_STORAGE_PATH / "processed"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    def ensure_storage_dirs(self) -> None:
        for path in (self.raw_dir, self.processed_dir, self.MODEL_STORAGE_PATH):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

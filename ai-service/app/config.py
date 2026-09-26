from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration from environment variables (prefix ``AI_``)."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    api_key: str = Field(min_length=8, description="Shared secret expected in X-Internal-Api-Key")
    model_dir: Path = Path("models")
    seed_model_dir: Path | None = None
    training_threads: int = Field(default=2, ge=1, le=64)
    training_origin_step_days: int = Field(default=3, ge=1, le=28)
    random_seed: int = 42


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

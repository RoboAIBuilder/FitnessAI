"""Runtime settings, read from environment variables (or an .env file loaded by the shell)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _list(v: str | None, default: list[str]) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()] if v else default


@dataclass(frozen=True)
class Config:
    # sqlite for local development; a Postgres URL in production, e.g.
    # postgresql+psycopg://user:pass@host:5432/fitnessai
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./fitnessai.db")

    # "dev": no login, every request acts as the demo trainer (or a client via X-Dev-Client)
    # "supabase": verify Supabase Auth JWTs
    auth_mode: str = os.getenv("AUTH_MODE", "dev")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Web Push (VAPID). Generate once with: python -m app.notify --generate-keys
    vapid_public_key: str = os.getenv("VAPID_PUBLIC_KEY", "")
    vapid_private_key: str = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_subject: str = os.getenv("VAPID_SUBJECT", "mailto:coach@example.com")

    cors_origins: list[str] = field(default_factory=lambda: _list(os.getenv("CORS_ORIGINS"), ["http://localhost:5173"]))
    default_timezone: str = os.getenv("TRAINER_TZ", "America/New_York")
    seed_demo: bool = os.getenv("SEED_DEMO", "1") == "1"


config = Config()

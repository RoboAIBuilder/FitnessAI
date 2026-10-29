"""Runtime settings, read from environment variables (or an .env file loaded by the shell)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _database_url() -> str:
    raw = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("STORAGE_URL") or ""
    if not raw:
        # On Vercel the disk is temporary: this keeps the app starting, and /api/health says to connect Neon.
        return "sqlite:////tmp/fitnessai.db" if os.getenv("VERCEL") else "sqlite:///./fitnessai.db"
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


def _list(v: str | None, default: list[str]) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()] if v else default


@dataclass(frozen=True)
class Config:
    # Same setup as Lost_Found: Neon Postgres from Vercel's Storage tab sets DATABASE_URL
    # (POSTGRES_URL / STORAGE_URL cover other prefixes). Without it, a local SQLite file.
    database_url: str = field(default_factory=lambda: _database_url())

    # "code": sign in with a code (trainer: TRAINER_CODE; each client: their own code)
    # "dev":  no sign-in, every request acts as the trainer (or a client via X-Dev-Client). Local only.
    auth_mode: str = os.getenv("AUTH_MODE", "code")
    trainer_code: str = os.getenv("TRAINER_CODE", "")
    # Signs session tokens. Optional: without it the app makes one and keeps it in the database.
    secret_key: str = os.getenv("SECRET_KEY", "")
    session_days: int = int(os.getenv("SESSION_DAYS", "60"))
    on_vercel: bool = bool(os.getenv("VERCEL"))

    # Web Push (VAPID). Generate once with: python -m app.notify --generate-keys
    vapid_public_key: str = os.getenv("VAPID_PUBLIC_KEY", "")
    vapid_private_key: str = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_subject: str = os.getenv("VAPID_SUBJECT", "mailto:coach@example.com")

    # The web app's address(es), e.g. https://fitnessai-web.vercel.app. CORS_ORIGIN_REGEX can also allow
    # Vercel preview URLs, e.g. https://fitnessai-web-.*\.vercel\.app
    cors_origins: list[str] = field(default_factory=lambda: _list(os.getenv("CORS_ORIGINS"), ["http://localhost:5173"]))
    cors_origin_regex: str = os.getenv("CORS_ORIGIN_REGEX", "")
    default_timezone: str = os.getenv("TRAINER_TZ", "America/New_York")
    seed_demo: bool = os.getenv("SEED_DEMO", "1") == "1"


config = Config()

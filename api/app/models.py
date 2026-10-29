"""Database tables (SQLModel). Column names match the domain models in schemas.py, so rows convert
both ways with model_validate(). Nested lists (objectives, circuits, entries…) are JSON columns."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def J(default=list):
    return Field(default_factory=default, sa_column=Column(JSON, nullable=False))


def JN():
    return Field(default=None, sa_column=Column(JSON, nullable=True))


class Trainer(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    settings: dict = J(dict)
    availability: dict = J(dict)


class ClientRow(SQLModel, table=True):
    __tablename__ = "client"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True, foreign_key="trainer.id")
    access_code: Optional[str] = Field(default=None, index=True)  # the client's sign-in code
    email: Optional[str] = None
    name: str
    age: Optional[int] = None
    height_in: int
    weight_lb: float
    start_weight_lb: float
    body_fat_pct: Optional[float] = None
    since: str
    frequency: int
    usual_slots: list = J()
    standing: bool = False
    flexible_window: str = ""
    contact: str = "app"
    push_enabled: bool = False
    phone: Optional[str] = None
    objectives: list = J()
    constraints: list = J()
    notes: str = ""
    mods: list = J()
    away: Optional[dict] = JN()
    waitlist: bool = False
    color: str = "#2747D6"
    prior_done: Optional[int] = None


class PackageRow(SQLModel, table=True):
    __tablename__ = "package"
    id: str = Field(primary_key=True)
    client_id: str = Field(index=True, foreign_key="client.id")
    date: str
    sessions: int
    price: Optional[float] = None
    note: Optional[str] = None


class ProgramRow(SQLModel, table=True):
    __tablename__ = "program"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True)
    client_id: str = Field(index=True, foreign_key="client.id")
    name: str
    goal: str
    format: str = "circuit"
    days_per_week: int
    session_min: int
    cardio_mix: int
    equipment: list = J()
    block: int
    weeks: int
    start: str
    days: list = J()


class SessionLogRow(SQLModel, table=True):
    __tablename__ = "session_log"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True)
    client_id: str = Field(index=True, foreign_key="client.id")
    date: str = Field(index=True)
    day_id: Optional[str] = None
    day_label: str
    day_name: str
    status: str
    missed_reason: Optional[str] = None
    duration_min: int = 0
    rpe: Optional[int] = None
    set_times_sec: list = J()
    entries: list = J()
    note: Optional[str] = None


class BookingRow(SQLModel, table=True):
    __tablename__ = "booking"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True)
    client_id: Optional[str] = Field(default=None, index=True)
    start: str = Field(index=True)
    duration_min: int
    status: str = Field(index=True)
    source: str
    note: Optional[str] = None
    offered: Optional[list] = JN()
    reminded: bool = False


class BusyBlockRow(SQLModel, table=True):
    __tablename__ = "busy_block"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True)
    start: str = Field(index=True)
    end: str
    label: str
    source: str


class MessageRow(SQLModel, table=True):
    __tablename__ = "message"
    id: str = Field(primary_key=True)
    trainer_id: str = Field(index=True)
    client_id: str = Field(index=True)
    at: str = Field(index=True)
    dir: str
    channel: str
    body: str
    booking_id: Optional[str] = None
    options: Optional[list] = JN()
    delivered: Optional[str] = None


class WeekPlanRow(SQLModel, table=True):
    __tablename__ = "week_plan"
    id: str = Field(primary_key=True)  # f"{client_id}:{week_start date}"
    trainer_id: str = Field(index=True)
    client_id: str = Field(index=True)
    week_start: str
    changes: list = J()
    days: list = J()
    approved: bool = False
    approved_at: Optional[str] = None


class PushSubscriptionRow(SQLModel, table=True):
    __tablename__ = "push_subscription"
    id: str = Field(primary_key=True)
    client_id: str = Field(index=True)
    endpoint: str
    p256dh: str
    auth: str
    created_at: str


class AppSecret(SQLModel, table=True):
    """Generated secrets kept in the database (e.g. the session-signing key when SECRET_KEY isn't set)."""

    __tablename__ = "app_secret"
    key: str = Field(primary_key=True)
    value: str

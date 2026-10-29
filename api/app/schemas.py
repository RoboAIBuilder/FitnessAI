"""Domain models. JSON uses camelCase (matches the React app); Python code uses snake_case."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


def _utc(d: datetime) -> datetime:
    return d.astimezone(timezone.utc) if d.tzinfo else d.replace(tzinfo=timezone.utc)


# Every timestamp is stored and sent as UTC ("…Z"); day-level logic converts to the trainer's timezone.
UTC = Annotated[datetime, AfterValidator(_utc)]


class Domain(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def out(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


ExType = Literal["cardio", "strength", "core"]
Constraint = Literal["knee", "shoulder", "back", "wrist"]
ModKind = Literal["swap", "easier", "lighter", "shorter", "skip"]
Focus = Literal["lower", "upper", "full"]
Goal = Literal["Fat loss", "Strength", "Muscle", "Endurance", "Mobility"]
BookingStatus = Literal["confirmed", "awaiting", "needs-you", "open", "cancelled", "done"]


# ---------- Clients ----------
class ExerciseMod(Domain):
    exercise_id: str
    kind: ModKind
    swap_to_id: Optional[str] = None
    detail: str = ""
    reason: str = ""
    saved_at: UTC


class HistoryPoint(Domain):
    date: UTC
    value: float


class Objective(Domain):
    id: str
    title: str
    kind: Literal["bodyweight", "lift", "time", "custom"]
    unit: str
    start: float
    target: float
    lower_is_better: bool
    exercise_id: Optional[str] = None
    deadline: UTC
    history: list[HistoryPoint] = []


class UsualSlot(Domain):
    dow: int  # 0 Sun … 6 Sat
    time: str  # HH:MM


class Away(Domain):
    from_: UTC = Field(alias="from")
    to: UTC
    note: str = ""


class SessionPackage(Domain):
    id: str
    date: UTC
    sessions: int
    price: Optional[float] = None
    note: Optional[str] = None


class Client(Domain):
    id: str
    name: str
    age: Optional[int] = None
    height_in: int
    weight_lb: float
    start_weight_lb: float
    body_fat_pct: Optional[float] = None
    since: UTC
    frequency: int
    usual_slots: list[UsualSlot] = []
    standing: bool = False
    flexible_window: str = ""
    contact: Literal["push", "app", "text"] = "app"
    push_enabled: bool = False
    phone: Optional[str] = None
    email: Optional[str] = None
    access_code: Optional[str] = None  # sign-in code; defaults to first name, lowercase
    objectives: list[Objective] = []
    constraints: list[Constraint] = []
    notes: str = ""
    mods: list[ExerciseMod] = []
    away: Optional[Away] = None
    waitlist: bool = False
    color: str = "#2747D6"
    packages: list[SessionPackage] = []
    prior_done: Optional[int] = None


# ---------- Programs ----------
class Prescription(Domain):
    exercise_id: str
    reps: Optional[int] = None
    sec: Optional[int] = None
    load_lb: Optional[float] = None
    note: Optional[str] = None
    changed: Optional[str] = None


class Circuit(Domain):
    label: Literal["A", "B"]
    rounds: int
    items: list[Prescription]


class ProgramDay(Domain):
    id: str
    label: str
    name: str
    focus: Focus
    circuits: list[Circuit]


class Program(Domain):
    id: str
    client_id: str
    name: str
    goal: Goal
    format: Literal["circuit", "straight", "intervals"] = "circuit"
    days_per_week: int
    session_min: int
    cardio_mix: int
    equipment: list[str]
    block: int
    weeks: int
    start: UTC
    days: list[ProgramDay]


# ---------- Logs ----------
class LogEntry(Domain):
    exercise_id: str
    circuit: Literal["A", "B"]
    round: int
    reps: Optional[int] = None
    sec: Optional[int] = None
    load_lb: Optional[float] = None
    mod: Optional[str] = None


class SessionLog(Domain):
    id: str
    client_id: str
    date: UTC
    day_id: Optional[str] = None
    day_label: str
    day_name: str
    status: Literal["done", "missed"]
    missed_reason: Optional[str] = None
    duration_min: int = 0
    rpe: Optional[int] = None
    set_times_sec: list[int] = []
    entries: list[LogEntry] = []
    note: Optional[str] = None


# ---------- Scheduling ----------
class Booking(Domain):
    id: str
    client_id: Optional[str] = None
    start: UTC
    duration_min: int
    status: BookingStatus
    source: Literal["standing", "invite", "client", "waitlist", "manual"]
    note: Optional[str] = None
    offered: Optional[list[UTC]] = None
    reminded: bool = False


class BusyBlock(Domain):
    id: str
    start: UTC
    end: UTC
    label: str
    source: str


class Window(Domain):
    start: str
    end: str


class Automation(Domain):
    invite_ahead: bool = True
    auto_confirm_standing: bool = True
    reminder: bool = True
    offer_alternatives: bool = True
    waitlist: bool = True
    ask_first: bool = False


class CalendarSync(Domain):
    name: str
    synced: bool


class Settings(Domain):
    trainer_name: str = "Coach"
    session_min: int = 30
    buffer_min: int = 10
    book_ahead_days: int = 7
    min_notice_h: int = 12
    invite_days_ahead: int = 3
    reminder_hours: int = 12
    automation: Automation = Automation()
    calendars: list[CalendarSync] = []
    timezone: str = "America/New_York"


class Message(Domain):
    id: str
    client_id: str
    at: UTC
    dir: Literal["out", "in"]
    channel: Literal["push", "app", "text"]
    body: str
    booking_id: Optional[str] = None
    options: Optional[list[UTC]] = None
    delivered: Optional[str] = None  # "push" | "in-app" | "failed"


# ---------- Plans ----------
class PlanChange(Domain):
    kind: Literal["stall", "progress", "endurance", "adherence", "on-track", "travel", "deload"]
    title: str
    detail: str


class PlanDay(ProgramDay):
    date: UTC
    changed_count: int = 0


class WeekPlan(Domain):
    client_id: str
    week_start: UTC
    changes: list[PlanChange]
    days: list[PlanDay]
    approved: bool = False
    approved_at: Optional[UTC] = None


Availability = dict[int, list[Window]]


class State(Domain):
    """Everything one trainer's app needs, in one payload."""

    clients: list[Client] = []
    programs: list[Program] = []
    logs: list[SessionLog] = []
    bookings: list[Booking] = []
    busy: list[BusyBlock] = []
    availability: Availability = {}
    settings: Settings = Settings()
    messages: list[Message] = []
    plans: dict[str, WeekPlan] = {}
    open_slots: dict[str, list[UTC]] = {}  # YYYY-MM-DD -> open start times
    suggestions: dict[str, list[UTC]] = {}  # booking id -> times to offer

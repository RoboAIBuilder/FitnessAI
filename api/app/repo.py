"""Database access: load one trainer's state, and save changed domain objects."""
from __future__ import annotations

from datetime import datetime
from typing import Iterable
from zoneinfo import ZoneInfo

from sqlmodel import Session, SQLModel, create_engine, delete, select

from .config import config
from .engine.dates import add_days, day_key, start_of_day, utcnow
from .engine.scheduler import Sched, open_slots, suggest_for
from .models import (
    BookingRow, BusyBlockRow, ClientRow, MessageRow, PackageRow, ProgramRow, PushSubscriptionRow, SessionLogRow, Trainer, WeekPlanRow,
)
from .schemas import Booking, BusyBlock, Client, Message, Program, SessionLog, Settings, State, Window, WeekPlan

_connect_args = {"check_same_thread": False} if config.database_url.startswith("sqlite") else {}
engine = create_engine(config.database_url, connect_args=_connect_args)


def create_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as s:
        yield s


def _dump(obj) -> dict:
    return obj.model_dump(mode="json")


def _fields(table) -> set[str]:
    return set(table.model_fields.keys())


def _upsert(session: Session, table, data: dict) -> None:
    keep = {k: v for k, v in data.items() if k in _fields(table)}
    row = session.get(table, keep["id"])
    if row is None:
        session.add(table(**keep))
    else:
        for k, v in keep.items():
            setattr(row, k, v)
        session.add(row)


# ---------- writes ----------
def save_client(session: Session, trainer_id: str, c: Client) -> None:
    data = _dump(c)
    packages = data.pop("packages", [])
    _upsert(session, ClientRow, {**data, "trainer_id": trainer_id})
    existing = {p.id for p in session.exec(select(PackageRow).where(PackageRow.client_id == c.id)).all()}
    for p in packages:
        _upsert(session, PackageRow, {**p, "client_id": c.id})
    for gone in existing - {p["id"] for p in packages}:
        session.exec(delete(PackageRow).where(PackageRow.id == gone))


def save_program(session: Session, trainer_id: str, p: Program) -> None:
    session.exec(delete(ProgramRow).where(ProgramRow.client_id == p.client_id, ProgramRow.id != p.id))
    _upsert(session, ProgramRow, {**_dump(p), "trainer_id": trainer_id})


def save_log(session: Session, trainer_id: str, l: SessionLog) -> None:
    _upsert(session, SessionLogRow, {**_dump(l), "trainer_id": trainer_id})


def save_bookings(session: Session, trainer_id: str, items: Iterable[Booking]) -> None:
    for b in items:
        _upsert(session, BookingRow, {**_dump(b), "trainer_id": trainer_id})


def save_messages(session: Session, trainer_id: str, items: Iterable[Message]) -> None:
    for m in items:
        _upsert(session, MessageRow, {**_dump(m), "trainer_id": trainer_id})


def save_busy(session: Session, trainer_id: str, items: Iterable[BusyBlock]) -> None:
    for b in items:
        _upsert(session, BusyBlockRow, {**_dump(b), "trainer_id": trainer_id})


def save_plan(session: Session, trainer_id: str, p: WeekPlan) -> None:
    pid = f"{p.client_id}:{p.week_start.date().isoformat()}"
    session.exec(delete(WeekPlanRow).where(WeekPlanRow.client_id == p.client_id, WeekPlanRow.id != pid))
    _upsert(session, WeekPlanRow, {**_dump(p), "id": pid, "trainer_id": trainer_id})


def delete_plan(session: Session, client_id: str) -> None:
    session.exec(delete(WeekPlanRow).where(WeekPlanRow.client_id == client_id))


def save_trainer_settings(session: Session, trainer_id: str, settings: Settings | None = None, availability: dict | None = None) -> None:
    t = session.get(Trainer, trainer_id)
    if settings is not None:
        t.settings = _dump(settings)
    if availability is not None:
        t.availability = {str(k): [_dump(w) if isinstance(w, Window) else w for w in v] for k, v in availability.items()}
    session.add(t)


# ---------- reads ----------
def load_state(session: Session, trainer_id: str, now: datetime | None = None, extras: bool = True) -> State:
    t = session.get(Trainer, trainer_id)
    if t is None:
        raise LookupError("trainer not found")
    crow = session.exec(select(ClientRow).where(ClientRow.trainer_id == trainer_id)).all()
    ids = [c.id for c in crow]
    pk = session.exec(select(PackageRow).where(PackageRow.client_id.in_(ids))).all() if ids else []
    by_client: dict[str, list] = {}
    for p in pk:
        by_client.setdefault(p.client_id, []).append(p.model_dump())
    clients = [Client.model_validate({**c.model_dump(), "packages": by_client.get(c.id, [])}) for c in crow]

    def rows(table):
        return [r.model_dump() for r in session.exec(select(table).where(table.trainer_id == trainer_id)).all()]

    plans = {}
    for r in rows(WeekPlanRow):
        plans[r["client_id"]] = WeekPlan.model_validate(r)

    state = State(
        clients=clients,
        programs=[Program.model_validate(r) for r in rows(ProgramRow)],
        logs=sorted((SessionLog.model_validate(r) for r in rows(SessionLogRow)), key=lambda l: l.date),
        bookings=sorted((Booking.model_validate(r) for r in rows(BookingRow)), key=lambda b: b.start),
        busy=[BusyBlock.model_validate(r) for r in rows(BusyBlockRow)],
        availability={int(k): [Window.model_validate(w) for w in v] for k, v in (t.availability or {}).items()},
        settings=Settings.model_validate(t.settings or {}),
        messages=sorted((Message.model_validate(r) for r in rows(MessageRow)), key=lambda m: m.at),
        plans=plans,
    )
    if extras:
        add_derived(state, now or utcnow())
    return state


def sched_of(state: State) -> Sched:
    return Sched(state.clients, state.bookings, state.busy, state.availability, state.settings)


def add_derived(state: State, now: datetime, days: int = 14) -> None:
    """Server-computed views the app shows: open slots per day and suggested times for requests that need the trainer."""
    s = sched_of(state)
    tz: ZoneInfo = s.tz
    today = start_of_day(now, tz)
    state.open_slots = {day_key(add_days(today, i), tz): open_slots(s, add_days(today, i), now) for i in range(days)}
    state.suggestions = {}
    for b in state.bookings:
        if b.status == "needs-you" and b.start > now and b.client_id:
            c = next((x for x in state.clients if x.id == b.client_id), None)
            if c:
                state.suggestions[b.id] = suggest_for(s, b, c, now)


def push_subscriptions(session: Session, client_id: str) -> list[PushSubscriptionRow]:
    return list(session.exec(select(PushSubscriptionRow).where(PushSubscriptionRow.client_id == client_id)).all())


# ---------- seeding ----------
def seed_trainer(session: Session, state: State, trainer_id: str = "t-demo", name: str = "Coach") -> None:
    session.add(Trainer(id=trainer_id, name=name, settings=_dump(state.settings),
                        availability={str(k): [_dump(w) for w in v] for k, v in state.availability.items()}))
    session.flush()
    for c in state.clients:
        save_client(session, trainer_id, c)
    session.flush()
    for p in state.programs:
        save_program(session, trainer_id, p)
    for l in state.logs:
        save_log(session, trainer_id, l)
    save_bookings(session, trainer_id, state.bookings)
    save_busy(session, trainer_id, state.busy)
    save_messages(session, trainer_id, state.messages)
    session.commit()


def reset_trainer(session: Session, trainer_id: str) -> None:
    client_ids = [c.id for c in session.exec(select(ClientRow).where(ClientRow.trainer_id == trainer_id)).all()]
    for table in (ProgramRow, SessionLogRow, BookingRow, BusyBlockRow, MessageRow, WeekPlanRow):
        session.exec(delete(table).where(table.trainer_id == trainer_id))
    if client_ids:
        session.exec(delete(PackageRow).where(PackageRow.client_id.in_(client_ids)))
        session.exec(delete(PushSubscriptionRow).where(PushSubscriptionRow.client_id.in_(client_ids)))
    session.exec(delete(ClientRow).where(ClientRow.trainer_id == trainer_id))
    session.exec(delete(Trainer).where(Trainer.id == trainer_id))
    session.commit()

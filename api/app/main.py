"""FitnessAI API (FastAPI).

Every write returns the caller's full, fresh state (it's small: one trainer's clients), so the app never
has to stitch partial updates together. Clients get a filtered view of only their own data.

Run locally:  uvicorn app.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from .auth import Principal, can_act_for_client, current_principal, trainer_only
from .config import config
from .engine.dates import add_days, start_of_week, utcnow
from .engine.exercises import EQUIPMENT_LABELS, EXERCISES
from .engine.generator import FOCUS_ROTATION, GenOptions, apply_mods, generate_day
from .engine.planner import last_loads, plan_next_week
from .engine.scheduler import Sched, accept_time, decline_time, msg, offer_to_waitlist, uid
from .engine.dates import fmt_day, fmt_time
from .jobs import run_for_trainer
from .models import PushSubscriptionRow, Trainer
from . import repo
from .notify import deliver
from .schemas import (
    Booking, Client, Domain, ExerciseMod, HistoryPoint, Message, Program, ProgramDay, SessionLog, SessionPackage, Settings, State, Window,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    repo.create_tables()
    if config.seed_demo:
        from .seed import build_seed

        with Session(repo.engine) as s:
            if s.exec(select(Trainer)).first() is None:
                repo.seed_trainer(s, build_seed(utcnow(), config.default_timezone))
    yield


app = FastAPI(title="FitnessAI API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


# ---------- helpers ----------
def view(session: Session, p: Principal) -> dict:
    state = repo.load_state(session, p.trainer_id)
    if p.role == "client":
        cid = p.client_id
        state = State(
            clients=[c for c in state.clients if c.id == cid],
            programs=[x for x in state.programs if x.client_id == cid],
            logs=[x for x in state.logs if x.client_id == cid],
            bookings=[x for x in state.bookings if x.client_id == cid],
            busy=[],
            availability=state.availability,
            settings=state.settings,
            messages=[x for x in state.messages if x.client_id == cid],
            plans={k: v for k, v in state.plans.items() if k == cid and v.approved},
            open_slots=state.open_slots,
        )
    out = state.out()
    out["role"] = p.role
    out["me"] = p.client_id
    return out


def load(session: Session, p: Principal) -> State:
    return repo.load_state(session, p.trainer_id, extras=False)


def client_of(state: State, client_id: str) -> Client:
    c = next((x for x in state.clients if x.id == client_id), None)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


def booking_of(state: State, booking_id: str) -> Booking:
    b = next((x for x in state.bookings if x.id == booking_id), None)
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


def commit_and_deliver(session: Session, messages: list[Message]) -> None:
    session.commit()
    if messages:
        deliver(session, messages)


# ---------- read ----------
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/exercises")
def exercises():
    return {"exercises": [e.__dict__ for e in EXERCISES], "equipmentLabels": EQUIPMENT_LABELS}


@app.get("/api/state")
def get_state(p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    return view(session, p)


@app.get("/api/push/key")
def push_key():
    return {"publicKey": config.vapid_public_key or None}


# ---------- clients ----------
@app.put("/api/clients/{client_id}")
def upsert_client(client_id: str, body: Client, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    if body.id != client_id:
        raise HTTPException(400, "Client id mismatch")
    repo.save_client(session, p.trainer_id, body)
    session.commit()
    return view(session, p)


@app.post("/api/clients/{client_id}/mods")
def save_mod(client_id: str, body: ExerciseMod, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    c = client_of(load(session, p), client_id)
    c.mods = [m for m in c.mods if m.exercise_id != body.exercise_id] + [body]
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


@app.delete("/api/clients/{client_id}/mods/{exercise_id}")
def remove_mod(client_id: str, exercise_id: str, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    c = client_of(load(session, p), client_id)
    c.mods = [m for m in c.mods if m.exercise_id != exercise_id]
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


class MeasurementIn(BaseModel):
    objectiveId: str
    value: float


@app.post("/api/clients/{client_id}/measurements")
def add_measurement(client_id: str, body: MeasurementIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    c = client_of(load(session, p), client_id)
    o = next((o for o in c.objectives if o.id == body.objectiveId), None)
    if not o:
        raise HTTPException(404, "Objective not found")
    o.history.append(HistoryPoint(date=utcnow(), value=body.value))
    if o.kind == "bodyweight":
        c.weight_lb = body.value
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


class PackageIn(BaseModel):
    sessions: int
    price: Optional[float] = None
    note: Optional[str] = None


@app.post("/api/clients/{client_id}/packages")
def add_package(client_id: str, body: PackageIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    if body.sessions <= 0:
        raise HTTPException(400, "Sessions must be at least 1")
    c = client_of(load(session, p), client_id)
    c.packages.append(SessionPackage(id=uid("pk"), date=utcnow(), sessions=body.sessions, price=body.price, note=body.note or f"{body.sessions}-session pack"))
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


@app.delete("/api/clients/{client_id}/packages/{package_id}")
def remove_package(client_id: str, package_id: str, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    c = client_of(load(session, p), client_id)
    c.packages = [x for x in c.packages if x.id != package_id]
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


class PushIn(BaseModel):
    enabled: bool
    subscription: Optional[dict] = None  # PushSubscription.toJSON() from the browser


@app.post("/api/clients/{client_id}/push")
def set_push(client_id: str, body: PushIn, p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    can_act_for_client(p, client_id)
    c = client_of(load(session, p), client_id)
    c.push_enabled = body.enabled
    c.contact = "push" if body.enabled else "app"
    if body.enabled and body.subscription and body.subscription.get("endpoint"):
        keys = body.subscription.get("keys", {})
        session.add(PushSubscriptionRow(id=uid("ps"), client_id=client_id, endpoint=body.subscription["endpoint"],
                                        p256dh=keys.get("p256dh", ""), auth=keys.get("auth", ""), created_at=utcnow().isoformat()))
    if not body.enabled:
        for s in repo.push_subscriptions(session, client_id):
            session.delete(s)
    repo.save_client(session, p.trainer_id, c)
    session.commit()
    return view(session, p)


class NoteIn(BaseModel):
    body: str


@app.post("/api/clients/{client_id}/messages")
def client_note(client_id: str, body: NoteIn, p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    can_act_for_client(p, client_id)
    client_of(load(session, p), client_id)
    repo.save_messages(session, p.trainer_id, [Message(id=uid("m"), client_id=client_id, at=utcnow(), dir="in", channel="app", body=body.body.strip()[:1000])])
    session.commit()
    return view(session, p)


# ---------- programs ----------
class GenerateIn(BaseModel):
    clientId: str
    goal: str = "Fat loss"
    cardioMix: int = 40
    equipment: list[str]
    days: int = 3
    rounds: int = 2
    seed: int = 1


@app.post("/api/programs/generate")
def generate(body: GenerateIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    c = client_of(state, body.clientId)
    loads = last_loads([l for l in state.logs if l.client_id == c.id])
    include = [o.exercise_id for o in c.objectives if o.exercise_id]
    n = max(1, min(3, body.days))
    days = [
        generate_day(GenOptions(goal=body.goal, cardio_mix=max(body.cardioMix, 60) if body.goal == "Endurance" else body.cardioMix,
                                equipment=body.equipment, constraints=list(c.constraints), mods=c.mods, focus=FOCUS_ROTATION[i],
                                seed=body.seed * 31 + i * 7, rounds=body.rounds, include=include if i == 0 else [], last_loads=loads),
                     chr(65 + i), uid("d"))
        for i in range(n)
    ]
    return {"days": [d.out() for d in days]}


@app.put("/api/programs/{client_id}")
def save_program(client_id: str, body: Program, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    client_of(load(session, p), client_id)
    if body.client_id != client_id:
        raise HTTPException(400, "Client id mismatch")
    repo.save_program(session, p.trainer_id, body)
    repo.delete_plan(session, client_id)
    session.commit()
    return view(session, p)


# ---------- sessions ----------
class SessionIn(BaseModel):
    log: SessionLog
    bookingId: Optional[str] = None


@app.post("/api/sessions")
def log_session(body: SessionIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    c = client_of(state, body.log.client_id)
    repo.save_log(session, p.trainer_id, body.log)
    # lift objectives pick up the new load
    for o in c.objectives:
        if o.kind == "lift" and o.exercise_id:
            e = next((x for x in body.log.entries if x.exercise_id == o.exercise_id and x.round == 1), None)
            if e and e.load_lb is not None:
                o.history.append(HistoryPoint(date=body.log.date, value=e.load_lb))
    repo.save_client(session, p.trainer_id, c)
    if body.bookingId:
        b = next((x for x in state.bookings if x.id == body.bookingId), None)
        if b:
            b.status = "done"
            repo.save_bookings(session, p.trainer_id, [b])
    session.commit()
    return view(session, p)


class MissedIn(BaseModel):
    reason: str = "No-show"


@app.post("/api/bookings/{booking_id}/missed")
def mark_missed(booking_id: str, body: MissedIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    from .engine.planner import next_day

    state = load(session, p)
    b = booking_of(state, booking_id)
    prog = next((x for x in state.programs if x.client_id == b.client_id), None)
    day = next_day(prog, [l for l in state.logs if l.client_id == b.client_id]) if prog else None
    b.status = "cancelled"
    repo.save_bookings(session, p.trainer_id, [b])
    repo.save_log(session, p.trainer_id, SessionLog(id=uid("l"), client_id=b.client_id, date=b.start, day_id=day.id if day else None,
                                                     day_label=day.label if day else "-", day_name=day.name if day else "Session", status="missed", missed_reason=body.reason))
    session.commit()
    return view(session, p)


# ---------- next-week plan ----------
@app.post("/api/clients/{client_id}/plan")
def build_plan(client_id: str, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    c = client_of(state, client_id)
    prog = next((x for x in state.programs if x.client_id == client_id), None)
    if not prog:
        raise HTTPException(400, "Design a program first")
    sched = repo.sched_of(state)
    now = utcnow()
    week_start = add_days(start_of_week(now, sched.tz), 7)
    existing = state.plans.get(client_id)
    if not existing or existing.week_start.astimezone(sched.tz).date() != week_start.date():
        repo.save_plan(session, p.trainer_id, plan_next_week(c, prog, state.logs, now, sched.tz))
        session.commit()
    return view(session, p)


@app.post("/api/clients/{client_id}/plan/approve")
def approve_plan(client_id: str, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    c = client_of(state, client_id)
    plan = state.plans.get(client_id)
    if not plan:
        raise HTTPException(400, "No plan to approve")
    plan.approved, plan.approved_at = True, utcnow()
    repo.save_plan(session, p.trainer_id, plan)
    tz = repo.sched_of(state).tz
    first = plan.days[0] if plan.days else None
    m = msg(c, f"Your plan for next week is ready: {len(plan.days)} sessions{', starting ' + fmt_day(first.date, tz) if first else ''}. See you there!", utcnow())
    repo.save_messages(session, p.trainer_id, [m])
    commit_and_deliver(session, [m])
    return view(session, p)


# ---------- scheduling ----------
@app.post("/api/schedule/run")
def run_schedule(p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    result = run_for_trainer(session, p.trainer_id)
    return {"result": result, "state": view(session, p)}


class TimeIn(BaseModel):
    start: datetime


class BookIn(BaseModel):
    start: datetime
    bookingId: Optional[str] = None


@app.post("/api/clients/{client_id}/book")
def book(client_id: str, body: BookIn, p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    can_act_for_client(p, client_id)
    state = load(session, p)
    client_of(state, client_id)
    r = accept_time(repo.sched_of(state), client_id, body.start, utcnow(), body.bookingId)
    if not r.ok:
        raise HTTPException(409, r.reason)
    repo.save_bookings(session, p.trainer_id, [r.booking])
    repo.save_messages(session, p.trainer_id, r.messages)
    commit_and_deliver(session, r.messages)
    return view(session, p)


class DeclineIn(BaseModel):
    text: str = "These times don't work for me."


@app.post("/api/bookings/{booking_id}/decline")
def decline(booking_id: str, body: DeclineIn, p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    b = booking_of(state, booking_id)
    can_act_for_client(p, b.client_id)
    nb, ms = decline_time(repo.sched_of(state), booking_id, body.text, utcnow())
    repo.save_bookings(session, p.trainer_id, [nb])
    repo.save_messages(session, p.trainer_id, ms)
    commit_and_deliver(session, ms)
    return view(session, p)


@app.post("/api/bookings/{booking_id}/offer")
def trainer_offer(booking_id: str, body: TimeIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    b = booking_of(state, booking_id)
    c = client_of(state, b.client_id or "")
    tz = repo.sched_of(state).tz
    b.status, b.start, b.offered, b.note = "awaiting", body.start, [body.start], "You offered a new time"
    m = msg(c, f"{state.settings.trainer_name} can do {fmt_day(body.start, tz)} at {fmt_time(body.start, tz)} instead. Tap to confirm.", utcnow(), booking_id=b.id, options=[body.start])
    repo.save_bookings(session, p.trainer_id, [b])
    repo.save_messages(session, p.trainer_id, [m])
    commit_and_deliver(session, [m])
    return view(session, p)


@app.post("/api/bookings/{booking_id}/skip")
def trainer_skip(booking_id: str, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    b = booking_of(state, booking_id)
    c = client_of(state, b.client_id or "")
    tz = repo.sched_of(state).tz
    b.status, b.note = "cancelled", "Skipped"
    m = msg(c, f"No problem, we'll skip {fmt_day(b.start, tz)}. Safe travels!", utcnow(), booking_id=b.id)
    repo.save_bookings(session, p.trainer_id, [b])
    repo.save_messages(session, p.trainer_id, [m])
    commit_and_deliver(session, [m])
    return view(session, p)


@app.post("/api/bookings/{booking_id}/cancel")
def cancel(booking_id: str, p: Principal = Depends(current_principal), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    b = booking_of(state, booking_id)
    can_act_for_client(p, b.client_id)
    tz = repo.sched_of(state).tz
    msgs: list[Message] = []
    c = next((x for x in state.clients if x.id == b.client_id), None)
    if c and p.role == "trainer":
        msgs.append(msg(c, f"Your session on {fmt_day(b.start, tz)} at {fmt_time(b.start, tz)} is cancelled.", utcnow(), booking_id=b.id))
    b.status = "cancelled"
    state.bookings = [x for x in state.bookings if x.id != b.id] + [b]
    wb, wm = offer_to_waitlist(repo.sched_of(state), b.start, utcnow())
    repo.save_bookings(session, p.trainer_id, [b, *([wb] if wb else [])])
    repo.save_messages(session, p.trainer_id, [*msgs, *wm])
    commit_and_deliver(session, [*msgs, *wm])
    return view(session, p)


class OfferSlotIn(BaseModel):
    clientId: str
    start: datetime


@app.post("/api/slots/offer")
def offer_slot(body: OfferSlotIn, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    state = load(session, p)
    c = client_of(state, body.clientId)
    tz = repo.sched_of(state).tz
    b = Booking(id=uid("b"), client_id=c.id, start=body.start, duration_min=state.settings.session_min, status="awaiting", source="manual", offered=[body.start], note="You offered this slot")
    m = msg(c, f"A spot is open {fmt_day(body.start, tz)} at {fmt_time(body.start, tz)}. Tap to book it.", utcnow(), booking_id=b.id, options=[body.start])
    repo.save_bookings(session, p.trainer_id, [b])
    repo.save_messages(session, p.trainer_id, [m])
    commit_and_deliver(session, [m])
    return view(session, p)


# ---------- settings ----------
@app.put("/api/settings")
def put_settings(body: Settings, p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    repo.save_trainer_settings(session, p.trainer_id, settings=body)
    session.commit()
    return view(session, p)


@app.put("/api/availability")
def put_availability(body: dict[int, list[Window]], p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    repo.save_trainer_settings(session, p.trainer_id, availability=body)
    session.commit()
    return view(session, p)


# ---------- demo helpers (dev / demo mode only) ----------
def _demo_only():
    if config.auth_mode != "dev" and not config.seed_demo:
        raise HTTPException(404)


@app.post("/api/demo/reset")
def demo_reset(p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    _demo_only()
    from .seed import build_seed

    repo.reset_trainer(session, p.trainer_id)
    repo.seed_trainer(session, build_seed(utcnow(), config.default_timezone), trainer_id=p.trainer_id)
    return view(session, p)


@app.post("/api/demo/simulate-replies")
def simulate_replies(p: Principal = Depends(trainer_only), session: Session = Depends(repo.get_session)):
    """Waiting clients tap a time; one in three says no instead."""
    _demo_only()
    now = utcnow()
    waiting = [b for b in load(session, p).bookings if b.status == "awaiting" and b.client_id and b.start > now]
    sent: list[Message] = []
    for i, b in enumerate(waiting):
        state = load(session, p)
        s = repo.sched_of(state)
        if i % 3 == 2:
            nb, ms = decline_time(s, b.id, "That time doesn't work for me this week.", now)
            repo.save_bookings(session, p.trainer_id, [nb])
            repo.save_messages(session, p.trainer_id, ms)
            sent += ms
        else:
            r = accept_time(s, b.client_id, (b.offered or [b.start])[0], now, b.id)
            if r.ok:
                repo.save_bookings(session, p.trainer_id, [r.booking])
                repo.save_messages(session, p.trainer_id, r.messages)
                sent += r.messages
        session.commit()
    if sent:
        deliver(session, sent)
    return {"count": len(waiting), "state": view(session, p)}


__all__ = ["app", "Domain", "ProgramDay", "apply_mods", "Sched"]

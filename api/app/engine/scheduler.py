"""Shared-calendar scheduling: open slots, auto-planning invites, accept/decline, waitlist, reminders.

All functions are pure: they take the current state and return new/changed bookings and messages.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..schemas import Availability, Booking, BusyBlock, Client, Message, Settings
from .dates import DOW_SHORT, add_days, add_minutes, at_time, dow, fmt_day, fmt_time, minutes_of, same_day, start_of_day


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class Sched:
    clients: list[Client]
    bookings: list[Booking]
    busy: list[BusyBlock]
    availability: Availability
    settings: Settings
    tz: ZoneInfo = field(default=None)  # type: ignore[assignment]

    def __post_init__(self):
        if self.tz is None:
            self.tz = ZoneInfo(self.settings.timezone)


def _overlaps(a_s: datetime, a_e: datetime, b_s: datetime, b_e: datetime) -> bool:
    return a_s < b_e and b_s < a_e


def is_away(c: Client, day: datetime, tz: ZoneInfo) -> bool:
    if not c.away:
        return False
    d = start_of_day(day, tz)
    return start_of_day(c.away.from_, tz) <= d <= start_of_day(c.away.to, tz)


def busy_at(s: Sched, start: datetime, duration_min: int, ignore_booking_id: str | None = None) -> str | None:
    end = add_minutes(start, duration_min + s.settings.buffer_min)
    for b in s.busy:
        if _overlaps(start, end, b.start, b.end):
            return "busy"
    for b in s.bookings:
        if b.id == ignore_booking_id or not b.client_id or b.status in ("cancelled", "open"):
            continue
        if _overlaps(start, end, b.start, add_minutes(b.start, b.duration_min + s.settings.buffer_min)):
            return "booked"
    return None


def within_availability(s: Sched, start: datetime, duration_min: int) -> bool:
    loc = start.astimezone(s.tz)
    sm = loc.hour * 60 + loc.minute
    return any(sm >= minutes_of(w.start) and sm + duration_min <= minutes_of(w.end) for w in s.availability.get(dow(loc), []))


def open_slots(s: Sched, day: datetime, now: datetime, ignore_booking_id: str | None = None) -> list[datetime]:
    dur = s.settings.session_min
    out: list[datetime] = []
    earliest = now + timedelta(hours=s.settings.min_notice_h)
    base = start_of_day(day, s.tz)
    for w in s.availability.get(dow(base), []):
        m = minutes_of(w.start)
        while m + dur <= minutes_of(w.end):
            t = base.replace(hour=m // 60, minute=m % 60)
            m += 15
            if t < earliest or busy_at(s, t, dur, ignore_booking_id):
                continue
            if out and (t - out[-1]).total_seconds() / 60 < dur + s.settings.buffer_min:
                continue
            out.append(t)
    return out


def nearest_slots(s: Sched, target: datetime, n: int, now: datetime, search_days: int = 2, ignore_booking_id: str | None = None) -> list[datetime]:
    cands: list[datetime] = []
    for d in range(search_days + 1):
        cands += open_slots(s, add_days(target, d), now, ignore_booking_id)

    def dist(t: datetime) -> float:
        return abs((t - target).total_seconds()) + (0 if same_day(t, target, s.tz) else 86400)

    return sorted(cands, key=dist)[:n]


def channel_for(c: Client) -> str:
    # Clients who installed the app and allowed notifications get push; others see it in the app.
    return "push" if c.push_enabled else "app"


def msg(c: Client, body: str, at: datetime, **extra) -> Message:
    return Message(id=uid("m"), client_id=c.id, at=at, dir="out", channel=channel_for(c), body=body, **extra)


def _first(name: str) -> str:
    return name.split(" ")[0]


def auto_plan(s: Sched, now: datetime, days: int = 3) -> tuple[list[Booking], list[Message]]:
    """Book every client's usual slot for the next `days` days: auto-confirm standing slots,
    invite the rest, offer alternatives on conflicts, flag what needs the trainer."""
    tz = s.tz
    a = s.settings.automation
    bookings: list[Booking] = []
    messages: list[Message] = []
    working = Sched(s.clients, list(s.bookings), s.busy, s.availability, s.settings, tz)
    for d in range(1, days + 1):
        day = add_days(start_of_day(now, tz), d)
        for c in s.clients:
            if c.waitlist:
                continue
            for slot in (u for u in c.usual_slots if u.dow == dow(day)):
                target = at_time(day, slot.time, tz)
                if any(b.client_id == c.id and same_day(b.start, day, tz) and b.status != "cancelled" for b in working.bookings):
                    continue
                if is_away(c, day, tz):
                    continue
                free = within_availability(working, target, s.settings.session_min) and not busy_at(working, target, s.settings.session_min)
                b: Booking | None = None
                if free:
                    if c.standing and a.auto_confirm_standing:
                        b = Booking(id=uid("b"), client_id=c.id, start=target, duration_min=s.settings.session_min, status="confirmed", source="standing", note="Standing slot · auto-confirmed")
                        messages.append(msg(c, f"You're set for {fmt_day(target, tz)} at {fmt_time(target, tz)}. Reply if anything changes.", now, booking_id=b.id))
                    elif a.invite_ahead:
                        b = Booking(id=uid("b"), client_id=c.id, start=target, duration_min=s.settings.session_min, status="awaiting", source="invite", note="Usual slot · invite sent", offered=[target])
                        messages.append(msg(c, f"Hi {_first(c.name)}, your usual {DOW_SHORT[dow(day)]} {fmt_time(target, tz)} is open. Tap to confirm or pick another time.", now, booking_id=b.id, options=[target]))
                else:
                    alts = nearest_slots(working, target, 2, now, 1) if a.offer_alternatives else []
                    if alts:
                        b = Booking(id=uid("b"), client_id=c.id, start=alts[0], duration_min=s.settings.session_min, status="awaiting", source="invite", note=f"Usual {fmt_time(target, tz)} unavailable · alternatives offered", offered=alts)
                        opts = " or ".join(f"{fmt_day(x, tz)} {fmt_time(x, tz)}" for x in alts)
                        messages.append(msg(c, f"Hi {_first(c.name)}, your usual {DOW_SHORT[dow(day)]} {fmt_time(target, tz)} isn't available this week. Open times: {opts}. Tap one to book.", now, booking_id=b.id, options=alts))
                    else:
                        b = Booking(id=uid("b"), client_id=c.id, start=target, duration_min=s.settings.session_min, status="needs-you", source="invite", note="Usual slot unavailable and no open time nearby")
                if not b:
                    continue
                if a.ask_first and b.status == "confirmed":
                    b.status = "awaiting"
                bookings.append(b)
                working.bookings.append(b)
    return bookings, messages


@dataclass
class AcceptResult:
    ok: bool
    reason: str = ""
    booking: Booking | None = None
    messages: list[Message] = field(default_factory=list)
    replaced: str | None = None


def accept_time(s: Sched, client_id: str, start: datetime, now: datetime, booking_id: str | None = None) -> AcceptResult:
    tz = s.tz
    c = next(x for x in s.clients if x.id == client_id)
    if booking_id:
        existing = next((b for b in s.bookings if b.id == booking_id), None)
    else:
        existing = next((b for b in s.bookings if b.client_id == client_id and same_day(b.start, start, tz) and b.status in ("awaiting", "needs-you")), None)
    if busy_at(s, start, s.settings.session_min, existing.id if existing else None):
        return AcceptResult(ok=False, reason="That time was just taken. Pick another.")
    status = "needs-you" if s.settings.automation.ask_first else "confirmed"
    if existing:
        booking = existing.model_copy(update={"start": start, "status": status, "source": "standing" if existing.source == "standing" else "client", "note": "Confirmed by client", "offered": None})
    else:
        booking = Booking(id=uid("b"), client_id=client_id, start=start, duration_min=s.settings.session_min, status=status, source="client", note="Booked by client")
    inbound = Message(id=uid("m"), client_id=client_id, at=now, dir="in", channel="app", body=f"Booked {fmt_day(start, tz)} {fmt_time(start, tz)} ✓", booking_id=booking.id)
    out = msg(c, f"Confirmed: {fmt_day(start, tz)} at {fmt_time(start, tz)}. Reminder {s.settings.reminder_hours} h before.", now, booking_id=booking.id)
    return AcceptResult(ok=True, booking=booking, messages=[inbound, out], replaced=existing.id if existing else None)


def decline_time(s: Sched, booking_id: str, text: str, now: datetime) -> tuple[Booking, list[Message]]:
    tz = s.tz
    b = next(x for x in s.bookings if x.id == booking_id)
    c = next(x for x in s.clients if x.id == b.client_id)
    inbound = Message(id=uid("m"), client_id=c.id, at=now, dir="in", channel="app", body=text, booking_id=booking_id)
    excluded = {b.start, *(b.offered or [])}
    alts = []
    if s.settings.automation.offer_alternatives:
        alts = [x for x in nearest_slots(s, b.start, 4, now, 2, b.id) if x not in excluded][:2]
    if alts and not s.settings.automation.ask_first:
        updated = b.model_copy(update={"status": "awaiting", "offered": alts, "start": alts[0], "note": "Client declined · new times offered"})
        opts = " or ".join(f"{fmt_day(x, tz)} {fmt_time(x, tz)}" for x in alts)
        return updated, [inbound, msg(c, f"No problem! Open times: {opts}. Tap one to book.", now, booking_id=booking_id, options=alts)]
    return b.model_copy(update={"status": "needs-you", "note": "Client asked to change · needs your choice"}), [inbound]


def offer_to_waitlist(s: Sched, start: datetime, now: datetime) -> tuple[Booking | None, list[Message]]:
    if not s.settings.automation.waitlist:
        return None, []
    w = next((c for c in s.clients if c.waitlist), None)
    if not w:
        return None, []
    b = Booking(id=uid("b"), client_id=w.id, start=start, duration_min=s.settings.session_min, status="awaiting", source="waitlist", note="Freed slot offered to waitlist", offered=[start])
    return b, [msg(w, f"A spot opened: {fmt_day(start, s.tz)} at {fmt_time(start, s.tz)}. Tap to grab it.", now, booking_id=b.id, options=[start])]


def due_reminders(s: Sched, now: datetime) -> list[Booking]:
    horizon = now + timedelta(hours=s.settings.reminder_hours)
    return [b for b in s.bookings if b.status == "confirmed" and not b.reminded and now < b.start <= horizon]


def reminder_message(s: Sched, b: Booking, c: Client, now: datetime) -> Message:
    when = "today" if same_day(b.start, now, s.tz) else fmt_day(b.start, s.tz)
    return msg(c, f"Reminder: session {when} at {fmt_time(b.start, s.tz)}. Need to change it? Tap here.", now, booking_id=b.id)


def suggest_for(s: Sched, b: Booking, c: Client, now: datetime) -> list[datetime]:
    """Times to offer when a client's request needs the trainer (e.g. travel)."""
    tz = s.tz
    usual = c.usual_slots[0].time if c.usual_slots else "07:30"
    before: list[datetime] = []
    base = b.start
    if c.away and c.away.to >= b.start:
        base = at_time(add_days(c.away.to, 1), usual, tz)
        if c.away.from_ > now:
            before = nearest_slots(s, at_time(add_days(c.away.from_, -1), usual, tz), 1, now, 0, b.id)
    after = nearest_slots(s, base, 2, now, 2, b.id)
    out: list[datetime] = []
    for t in before + after:
        if t not in out:
            out.append(t)
    return out[:3]

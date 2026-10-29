"""Event handlers: what the app does the moment something changes. No background jobs.

Each function is pure: it takes the current schedule and returns the bookings and messages to save.
See docs/EVENTS.md for the full list of events.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ..schemas import Booking, BusyBlock, Client, Message
from .dates import add_minutes, fmt_day, fmt_time
from .scheduler import AcceptResult, Sched, accept_time, msg, nearest_slots, offer_to_waitlist, open_slots, uid, within_availability

ACTIVE = ("confirmed", "awaiting")


@dataclass
class Outcome:
    bookings: list[Booking] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    summary: str = ""


def _client(s: Sched, cid: str | None) -> Client | None:
    return next((c for c in s.clients if c.id == cid), None)


def _overlaps_busy(s: Sched, b: Booking) -> bool:
    end = add_minutes(b.start, b.duration_min)
    return any(b.start < x.end and x.start < end for x in s.busy)


def slot_conflicts(s: Sched, now: datetime) -> list[Booking]:
    """Upcoming sessions that no longer fit the trainer's hours or overlap time he blocked."""
    return [
        b for b in s.bookings
        if b.client_id and b.status in ACTIVE and b.start > now
        and (_overlaps_busy(s, b) or not within_availability(s, b.start, b.duration_min))
    ]


def resolve_conflicts(s: Sched, now: datetime) -> Outcome:
    """Trainer became unavailable (blocked time or changed hours): move every affected client.

    Each affected client is offered the two nearest open times, or — if there are none — flagged for the trainer.
    """
    out = Outcome()
    tz = s.tz
    for b in slot_conflicts(s, now):
        c = _client(s, b.client_id)
        if not c:
            continue
        taken = {x.start for x in out.bookings}
        alts = [t for t in nearest_slots(s, b.start, 4, now, 2, b.id) if t not in taken][:2]
        old = f"{fmt_day(b.start, tz)} at {fmt_time(b.start, tz)}"
        if alts:
            nb = b.model_copy(update={"status": "awaiting", "start": alts[0], "offered": alts, "note": f"Coach unavailable {fmt_time(b.start, tz)} · new times offered"})
            opts = " or ".join(f"{fmt_day(t, tz)} {fmt_time(t, tz)}" for t in alts)
            out.messages.append(msg(c, f"Sorry, your coach can't make {old} anymore. Open times: {opts}. Tap one to book.", now, booking_id=b.id, options=alts))
        else:
            nb = b.model_copy(update={"status": "needs-you", "offered": None, "note": "Coach unavailable · no open time nearby"})
            out.messages.append(msg(c, f"Your coach needs to move your session on {old}. You'll get a new time shortly.", now, booking_id=b.id))
        out.bookings.append(nb)
        s.bookings = [nb if x.id == b.id else x for x in s.bookings]
    n = len(out.bookings)
    out.summary = f"{n} session{'s' if n != 1 else ''} moved" if n else "No sessions affected"
    return out


def block_time(s: Sched, start: datetime, end: datetime, label: str, now: datetime) -> tuple[BusyBlock, Outcome]:
    """Trainer marks himself unavailable."""
    blk = BusyBlock(id=uid("x"), start=start, end=end, label=label or "Unavailable", source="Manual")
    s.busy = [*s.busy, blk]
    return blk, resolve_conflicts(s, now)


def unblock_time(s: Sched, blk: BusyBlock, now: datetime) -> Outcome:
    """Trainer removes a block: the freed time shows as open, and the first open slot goes to the waitlist."""
    s.busy = [x for x in s.busy if x.id != blk.id]
    out = Outcome(summary="Time is open again")
    freed = [t for t in open_slots(s, blk.start, now) if blk.start <= t < blk.end]
    if freed:
        wb, wm = offer_to_waitlist(s, freed[0], now)
        if wb:
            out.bookings.append(wb)
            out.messages += wm
            out.summary = "Time is open again · first slot offered to waitlist"
    return out


@dataclass
class BookResult:
    ok: bool
    reason: str = ""
    result: AcceptResult | None = None
    extra: Outcome = field(default_factory=Outcome)


def client_books(s: Sched, client_id: str, start: datetime, now: datetime, booking_id: str | None, unbooked_left: int | None, by_client: bool) -> BookResult:
    """Client picks a time: a new booking, accepting an offer, or changing a confirmed session.

    - Changing a confirmed session inside the minimum-notice window is refused (message the coach instead).
    - A new booking with no purchased sessions left is held as "needs you" until the trainer renews the package.
    - When a confirmed session moves, its old time is offered to the waitlist.
    """
    tz = s.tz
    existing = next((b for b in s.bookings if b.id == booking_id), None) if booking_id else None
    notice = timedelta(hours=s.settings.min_notice_h)
    if by_client and existing and existing.status == "confirmed" and existing.start - now < notice and existing.start != start:
        return BookResult(False, f"Your session is less than {s.settings.min_notice_h} hours away. Message your coach to change it.")
    if by_client and start - now < notice:
        return BookResult(False, f"Pick a time at least {s.settings.min_notice_h} hours from now.")

    r = accept_time(s, client_id, start, now, booking_id)
    if not r.ok:
        return BookResult(False, r.reason)

    already_counted = existing is not None and existing.status in ACTIVE
    out = Outcome()
    if unbooked_left is not None and unbooked_left <= 0 and not already_counted:
        c = _client(s, client_id)
        r.booking.status = "needs-you"
        r.booking.note = "No sessions left · renew to confirm"
        r.messages = [m for m in r.messages if m.dir == "in"]
        if c:
            r.messages.append(msg(c, f"Got it: {fmt_day(start, tz)} at {fmt_time(start, tz)}. You've used all your purchased sessions, so your coach will confirm once you renew.", now, booking_id=r.booking.id))

    if existing and existing.status == "confirmed" and existing.start != start:
        s.bookings = [r.booking if x.id == existing.id else x for x in s.bookings]
        wb, wm = offer_to_waitlist(s, existing.start, now)
        if wb:
            out.bookings.append(wb)
            out.messages += wm
    return BookResult(True, result=r, extra=out)


def client_cancels(s: Sched, b: Booking, now: datetime, by_client: bool) -> Outcome:
    """A session is cancelled. A client cancelling inside the notice window is recorded as a late cancel."""
    tz = s.tz
    out = Outcome()
    c = _client(s, b.client_id)
    late = by_client and b.start - now < timedelta(hours=s.settings.min_notice_h)
    nb = b.model_copy(update={"status": "cancelled", "note": "Late cancel by client" if late else ("Cancelled by client" if by_client else "Cancelled")})
    out.bookings.append(nb)
    when = f"{fmt_day(b.start, tz)} at {fmt_time(b.start, tz)}"
    if c and by_client:
        out.messages.append(Message(id=uid("m"), client_id=c.id, at=now, dir="in", channel="app", body=f"Cancelled {when}{' (less than ' + str(s.settings.min_notice_h) + ' h notice)' if late else ''}.", booking_id=b.id))
    elif c:
        out.messages.append(msg(c, f"Your session on {when} is cancelled.", now, booking_id=b.id))
    s.bookings = [nb if x.id == b.id else x for x in s.bookings]
    wb, wm = offer_to_waitlist(s, b.start, now)
    if wb:
        out.bookings.append(wb)
        out.messages += wm
    out.summary = "Late cancel recorded" if late else "Cancelled"
    if wb:
        out.summary += " · slot offered to waitlist"
    return out


def renewed(s: Sched, client_id: str, unbooked_left: int, now: datetime) -> Outcome:
    """Trainer added sessions: confirm bookings that were waiting only because the package ran out."""
    out = Outcome()
    c = _client(s, client_id)
    held = sorted((b for b in s.bookings if b.client_id == client_id and b.status == "needs-you" and b.start > now and (b.note or "").startswith("No sessions left")), key=lambda b: b.start)
    for b in held[: max(0, unbooked_left)]:
        if not within_availability(s, b.start, b.duration_min) or _overlaps_busy(s, b):
            continue
        nb = b.model_copy(update={"status": "confirmed", "note": "Confirmed after renewal"})
        out.bookings.append(nb)
        if c:
            out.messages.append(msg(c, f"Thanks for renewing! You're confirmed for {fmt_day(b.start, s.tz)} at {fmt_time(b.start, s.tz)}.", now, booking_id=b.id))
    return out


def low_balance_notice(c: Client, pending: int, now: datetime) -> list[Message]:
    """After a session is logged: tell the client when they're running low or out."""
    if pending < 0:
        return [msg(c, f"You've done {-pending} more session{'s' if pending < -1 else ''} than purchased. Please renew with your coach.", now)]
    if pending == 0:
        return [msg(c, "That was your last purchased session. Renew with your coach to keep your spot.", now)]
    if pending <= 2:
        return [msg(c, f"You have {pending} session{'s' if pending != 1 else ''} left in your package.", now)]
    return []

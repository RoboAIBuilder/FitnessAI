"""Session packages: purchased − done = pending. Missed sessions don't use up a session."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..schemas import Booking, Client, SessionLog

LOW_BALANCE = 2


@dataclass
class Balance:
    purchased: int
    done: int
    pending: int
    booked: int
    unbooked: int
    low: bool
    owes: int
    has_packages: bool


def session_balance(client: Client, logs: list[SessionLog], bookings: list[Booking], now: datetime) -> Balance:
    purchased = sum(p.sessions for p in client.packages)
    done = sum(1 for l in logs if l.client_id == client.id and l.status == "done") + (client.prior_done or 0)
    pending = purchased - done
    booked = sum(1 for b in bookings if b.client_id == client.id and b.start > now and b.status in ("confirmed", "awaiting"))
    has = bool(client.packages)
    return Balance(
        purchased=purchased, done=done, pending=pending, booked=booked,
        unbooked=max(0, pending - booked), low=has and 0 <= pending <= LOW_BALANCE,
        owes=-pending if pending < 0 else 0, has_packages=has,
    )

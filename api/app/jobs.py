"""Hourly job: plan the next few days, send invites and reminders, deliver notifications.

Run on a schedule (e.g. Render Cron Job, every hour):  python -m app.jobs
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlmodel import Session, select

from .engine.dates import utcnow
from .engine.scheduler import auto_plan, due_reminders, reminder_message
from .models import Trainer
from .notify import deliver
from .repo import engine, load_state, save_bookings, save_messages, sched_of

log = logging.getLogger("fitnessai.jobs")


def run_for_trainer(session: Session, trainer_id: str, now: datetime | None = None) -> dict[str, int]:
    now = now or utcnow()
    state = load_state(session, trainer_id, now, extras=False)
    s = sched_of(state)
    new_bookings, messages = auto_plan(s, now, state.settings.invite_days_ahead) if state.settings.automation.invite_ahead else ([], [])
    state.bookings.extend(new_bookings)

    reminded = []
    if state.settings.automation.reminder:
        clients = {c.id: c for c in state.clients}
        for b in due_reminders(sched_of(state), now):
            c = clients.get(b.client_id or "")
            if c:
                messages.append(reminder_message(s, b, c, now))
                b.reminded = True
                reminded.append(b)

    save_bookings(session, trainer_id, [*new_bookings, *reminded])
    save_messages(session, trainer_id, messages)
    session.commit()
    delivery = deliver(session, messages)
    return {"invites": len(new_bookings), "reminders": len(reminded), **delivery}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with Session(engine) as session:
        for t in session.exec(select(Trainer)).all():
            log.info("trainer %s: %s", t.id, run_for_trainer(session, t.id))


if __name__ == "__main__":
    main()

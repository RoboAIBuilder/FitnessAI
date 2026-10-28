"""Progress analysis and next-week planning."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from ..schemas import Client, Objective, PlanChange, PlanDay, Prescription, Program, ProgramDay, SessionLog, WeekPlan
from .dates import add_days, dow, fmt_month_day, start_of_day, start_of_week
from .exercises import EX


def _round5(n: float) -> int:
    return max(0, int((n / 5) + 0.5) * 5)


def load_history(logs: list[SessionLog], exercise_id: str) -> list[tuple[datetime, float, int]]:
    """(date, first-round load, rpe) for completed sessions, oldest first."""
    out = []
    for l in sorted((l for l in logs if l.status == "done"), key=lambda l: l.date):
        e = next((x for x in l.entries if x.exercise_id == exercise_id and x.round == 1), None)
        if e and e.load_lb is not None:
            out.append((l.date, e.load_lb, l.rpe or 7))
    return out


def last_loads(logs: list[SessionLog]) -> dict[str, float]:
    out: dict[str, float] = {}
    for l in sorted((l for l in logs if l.status == "done"), key=lambda l: l.date):
        for e in l.entries:
            if e.load_lb is not None and e.round == 1:
                out[e.exercise_id] = e.load_lb
    return out


@dataclass
class ExerciseStatus:
    kind: str  # stall | progress | hold
    load: float = 0
    sessions: int = 0
    next: float = 0


def exercise_status(logs: list[SessionLog], exercise_id: str) -> ExerciseStatus:
    h = load_history(logs, exercise_id)
    if len(h) >= 3:
        last3 = h[-3:]
        same = all(x[1] == last3[0][1] for x in last3)
        if same and last3[2][2] >= 8 and last3[0][1] > 0:
            n = 0
            for x in reversed(h):
                if x[1] != last3[0][1]:
                    break
                n += 1
            return ExerciseStatus("stall", load=last3[0][1], sessions=n)
    if len(h) >= 2:
        a, b = h[-2:]
        if a[1] == b[1] and b[2] <= 7 and b[1] > 0:
            step = (EX[exercise_id].load_step if exercise_id in EX else None) or 5
            return ExerciseStatus("progress", load=b[1], next=b[1] + step)
    return ExerciseStatus("hold")


@dataclass
class ObjectiveProgress:
    current: float
    frac: float
    time_frac: float
    projected: datetime | None
    rate_per_week: float
    status: str  # done | on-track | behind | stalled


def objective_progress(o: Objective, now: datetime) -> ObjectiveProgress:
    cur = o.history[-1].value if o.history else o.start
    span = o.target - o.start
    frac = 1 if span == 0 else min(1, max(0, (cur - o.start) / span))
    first = o.history[0].date if o.history else now
    total = (o.deadline - first).total_seconds()
    elapsed = (now - first).total_seconds()
    time_frac = min(1, max(0, elapsed / total)) if total > 0 else 1
    recent = o.history[-6:]
    projected = None
    rate = 0.0
    if len(recent) >= 2:
        weeks = (recent[-1].date - recent[0].date).total_seconds() / (7 * 86400)
        rate = (recent[-1].value - recent[0].value) / weeks if weeks > 0 else 0
        remaining = o.target - cur
        if rate != 0 and (rate > 0) == (remaining > 0):
            from datetime import timedelta

            projected = recent[-1].date + timedelta(weeks=remaining / rate)
    last3 = o.history[-3:]
    stalled = frac < 1 and len(last3) == 3 and all(x.value == last3[0].value for x in last3)
    if frac >= 1:
        status = "done"
    elif stalled:
        status = "stalled"
    elif projected and projected <= o.deadline:
        status = "on-track"
    else:
        status = "on-track" if frac + 0.08 >= time_frac else "behind"
    return ObjectiveProgress(cur, frac, time_frac, projected, rate, status)


def next_day(program: Program, logs: list[SessionLog]) -> ProgramDay:
    srt = sorted(logs, key=lambda l: l.date)
    if not srt:
        return program.days[0]
    last = srt[-1]
    idx = next((i for i, d in enumerate(program.days) if d.id == last.day_id or d.label == last.day_label), -1)
    return program.days[(idx + 1) % len(program.days)]


def plan_next_week(client: Client, program: Program, logs: list[SessionLog], now: datetime, tz: ZoneInfo) -> WeekPlan:
    week_start = add_days(start_of_week(now, tz), 7)
    changes: list[PlanChange] = []
    client_logs = [l for l in logs if l.client_id == client.id]

    # 1) exercise-level rules
    ids = {p.exercise_id for d in program.days for c in d.circuits for p in c.items}
    repl: dict[str, dict] = {}
    for id_ in sorted(ids):
        st = exercise_status(client_logs, id_)
        name = EX[id_].name if id_ in EX else id_
        if st.kind == "stall":
            tempo = EX[id_].tempo_variant if id_ in EX else None
            new_load = _round5(st.load * 0.9)
            repl[id_] = {"to": tempo, "load": new_load, "reason": "stall"}
            detail = (
                f"Switch to {EX[tempo].name.lower()} at {new_load} lb to break the plateau."
                if tempo else f"Drop to {new_load} lb and slow the tempo for one week."
            )
            changes.append(PlanChange(kind="stall", title=f"{name} stuck at {st.load:g} lb for {st.sessions} sessions", detail=detail))
        elif st.kind == "progress":
            repl[id_] = {"load": st.next, "reason": "progress"}
            changes.append(PlanChange(kind="progress", title=f"{name} felt manageable at {st.load:g} lb", detail=f"Go up to {st.next:g} lb."))

    # 2) adherence
    since = add_days(now, -14)
    recent = [l for l in client_logs if l.date >= since]
    missed = sum(1 for l in recent if l.status == "missed")
    if recent and missed >= 2:
        changes.append(PlanChange(kind="adherence", title=f"Missed {missed} of last {len(recent)} sessions", detail="Keep loads the same this week and check in about schedule or motivation."))
        repl = {k: v for k, v in repl.items() if v["reason"] != "progress"}

    # 3) objectives
    add_sprints = False
    for o in client.objectives:
        p = objective_progress(o, now)
        if o.kind == "time" and o.lower_is_better and p.status == "behind":
            add_sprints = True
            changes.append(PlanChange(kind="endurance", title=f"{o.title}: behind pace", detail="Swap a low-intensity cardio move for rope sprints, and add a 25-min tempo run on their own."))
        elif o.kind == "bodyweight" and p.status in ("on-track", "done"):
            detail = (
                f"At {abs(p.rate_per_week):.1f} lb/week, reaches {o.target:g} lb around {fmt_month_day(p.projected, tz)}. Keep the conditioning work as is."
                if p.projected else "Keep the plan as is."
            )
            changes.append(PlanChange(kind="on-track", title=f"{o.title}: on track", detail=detail))

    # 4) travel
    if client.away:
        if client.away.to >= week_start and client.away.from_ < add_days(week_start, 7):
            changes.append(PlanChange(kind="travel", title=f"Away {fmt_month_day(client.away.from_, tz)}–{fmt_month_day(client.away.to, tz)}", detail="Sessions on those days are left out of the plan; reschedule from Schedule."))

    slots = sorted(client.usual_slots, key=lambda u: (u.dow + 6) % 7)
    nd = next_day(program, client_logs)
    rot = next((i for i, d in enumerate(program.days) if d.id == nd.id), 0)
    low_cardio = {"jumping-jacks", "step-jacks", "march-fast", "mountain-climbers", "incline-climbers"}
    sprint_added = False
    days: list[PlanDay] = []
    for s in slots:
        date = add_days(week_start, (s.dow + 6) % 7)
        if client.away and start_of_day(client.away.from_, tz) <= date <= start_of_day(client.away.to, tz):
            continue
        base = program.days[rot % len(program.days)]
        rot += 1
        changed = 0
        circuits = []
        for c in base.circuits:
            items: list[Prescription] = []
            for p in c.items:
                r = repl.get(p.exercise_id)
                if r:
                    changed += 1
                    if r.get("to"):
                        e = EX[r["to"]]
                        items.append(Prescription(exercise_id=e.id, reps=e.reps, sec=e.sec, load_lb=r["load"], changed=r["reason"], note=p.note))
                    else:
                        items.append(p.model_copy(update={"load_lb": r["load"], "changed": r["reason"]}))
                    continue
                if add_sprints and not sprint_added and p.exercise_id in low_cardio:
                    sprint_added = True
                    changed += 1
                    items.append(Prescription(exercise_id="rope-sprints", sec=45, changed="endurance"))
                    continue
                items.append(p)
            circuits.append(c.model_copy(update={"items": items}))
        days.append(PlanDay(**base.model_dump(exclude={"circuits"}), circuits=circuits, date=date, changed_count=changed))

    if not changes:
        changes.append(PlanChange(kind="on-track", title="Everything on track", detail="Repeat this week with the same loads."))
    return WeekPlan(client_id=client.id, week_start=week_start, changes=changes, days=days, approved=False)


__all__ = ["exercise_status", "objective_progress", "plan_next_week", "next_day", "last_loads", "dow"]

"""Demo data: six clients with four weeks of history, built with the real engines (mirrors web/src/data/seed.ts)."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .engine.dates import add_days, at_time, dow, start_of_day
from .engine.exercises import EX
from .engine.generator import FOCUS_ROTATION, GenOptions, generate_day
from .engine.scheduler import Sched, accept_time, auto_plan, decline_time, uid
from .schemas import (
    Automation, Away, Booking, BusyBlock, CalendarSync, Client, ExerciseMod, HistoryPoint, LogEntry, Message,
    Objective, Program, SessionLog, SessionPackage, Settings, State, UsualSlot, Window,
)

FULL_KIT = ["ropes", "dumbbells", "kettlebell", "stability-ball", "med-ball", "bodyweight", "box"]


def default_settings(tz: str) -> Settings:
    return Settings(
        trainer_name="Coach", session_min=30, buffer_min=10, book_ahead_days=7, min_notice_h=12, invite_days_ahead=3,
        reminder_hours=12, automation=Automation(), timezone=tz,
        calendars=[CalendarSync(name="Google Calendar", synced=True), CalendarSync(name="YMCA shifts", synced=True)],
    )


def default_availability() -> dict[int, list[Window]]:
    W = lambda a, b: Window(start=a, end=b)  # noqa: E731
    return {
        0: [],
        1: [W("06:00", "09:00"), W("12:00", "14:00"), W("16:00", "20:00")],
        2: [W("12:00", "14:00"), W("17:00", "20:00")],
        3: [W("06:00", "09:00"), W("16:00", "20:00")],
        4: [W("12:00", "14:00"), W("17:00", "20:00")],
        5: [W("06:00", "09:00"), W("16:00", "19:00")],
        6: [W("08:00", "11:00")],
    }


def build_seed(now: datetime, tz_name: str = "America/New_York") -> State:
    tz = ZoneInfo(tz_name)
    today = start_of_day(now, tz)
    d = lambda n: add_days(today, n)  # noqa: E731
    U = lambda dw, t: UsualSlot(dow=dw, time=t)  # noqa: E731

    def hist(vals: list[float], start: int, step: int = 7) -> list[HistoryPoint]:
        return [HistoryPoint(date=d(start + i * step), value=v) for i, v in enumerate(vals)]

    clients = [
        Client(
            id="c-priya", name="Priya Shah", age=34, height_in=65, weight_lb=158, start_weight_lb=164, body_fat_pct=31,
            since=d(-210), frequency=3, usual_slots=[U(1, "07:30"), U(3, "07:30"), U(5, "07:30")],
            standing=False, flexible_window="Weekdays 6–9 AM", contact="push", push_enabled=True, color="#2747D6",
            constraints=["knee"],
            notes="Prefers morning sessions. Runs on her own Saturdays. Responds well to clear weekly targets.",
            mods=[
                ExerciseMod(exercise_id="mountain-climbers", kind="swap", swap_to_id="incline-climbers", detail="Hands on bench", reason="Wrist", saved_at=d(-9)),
                ExerciseMod(exercise_id="rope-waves", kind="shorter", detail="30 s instead of 40 s", reason="Shoulder", saved_at=d(-2)),
                ExerciseMod(exercise_id="walking-lunge", kind="swap", swap_to_id="step-up", detail="Step-up, low box", reason="Knee", saved_at=d(-200)),
            ],
            away=Away(**{"from": d(12)}, to=d(14), note="Traveling"),
            objectives=[
                Objective(id="o-p1", title="Lose 15 lb", kind="bodyweight", unit="lb", start=164, target=149, lower_is_better=True, deadline=d(100), history=hist([164, 163, 162.5, 161, 160.5, 160, 159, 158], -49)),
                Objective(id="o-p2", title="Goblet squat 55 lb × 12", kind="lift", unit="lb", start=25, target=55, lower_is_better=False, exercise_id="goblet-squat", deadline=d(70)),
                Objective(id="o-p3", title="5K under 32:00", kind="time", unit="sec", start=2200, target=1920, lower_is_better=True, deadline=d(60),
                          history=[HistoryPoint(date=d(-60), value=2200), HistoryPoint(date=d(-30), value=2110), HistoryPoint(date=d(-13), value=2050)]),
            ],
        ),
        Client(
            id="c-daniel", name="Daniel Ortiz", age=41, height_in=70, weight_lb=192, start_weight_lb=201,
            since=d(-120), frequency=3, usual_slots=[U(1, "06:00"), U(3, "06:00"), U(5, "06:00")],
            standing=True, flexible_window="Early mornings only", contact="push", push_enabled=True, color="#1E6B3A",
            notes="Has to leave by 6:35 for work. Likes heavier kettlebell work.",
            objectives=[
                Objective(id="o-d1", title="Get to 185 lb", kind="bodyweight", unit="lb", start=201, target=185, lower_is_better=True, deadline=d(80), history=hist([201, 199, 198, 197, 195.5, 194, 193, 192], -49)),
                Objective(id="o-d2", title="KB deadlift 70 lb × 12", kind="lift", unit="lb", start=35, target=70, lower_is_better=False, exercise_id="kb-deadlift", deadline=d(90)),
            ],
        ),
        Client(
            id="c-marcus", name="Marcus Lee", age=29, height_in=69, weight_lb=176, start_weight_lb=176,
            since=d(-60), frequency=2, usual_slots=[U(1, "12:15"), U(4, "12:15")],
            flexible_window="Lunchtime or after 5 PM", contact="app", push_enabled=False, color="#8A3608",
            constraints=["shoulder"], notes="Desk job, tight hips. Old shoulder strain — no overhead pressing.",
            objectives=[
                Objective(id="o-m1", title="Hold a 90 s plank", kind="custom", unit="sec", start=30, target=90, lower_is_better=False, deadline=d(45),
                          history=[HistoryPoint(date=d(-56), value=30), HistoryPoint(date=d(-35), value=45), HistoryPoint(date=d(-14), value=55)]),
            ],
        ),
        Client(
            id="c-elena", name="Elena Ruiz", age=38, height_in=64, weight_lb=141, start_weight_lb=145,
            since=d(-90), frequency=2, usual_slots=[U(2, "17:30"), U(4, "17:30")],
            flexible_window="Weekday evenings", contact="push", push_enabled=True, color="#7A2E8C",
            constraints=["wrist"], notes="Teacher — evenings only during school year.",
            mods=[ExerciseMod(exercise_id="plank", kind="swap", swap_to_id="forearm-plank", detail="Forearms instead of hands", reason="Wrist", saved_at=d(-40))],
            objectives=[
                Objective(id="o-e1", title="DB push press 25 lb × 10", kind="lift", unit="lb", start=10, target=25, lower_is_better=False, exercise_id="db-push-press", deadline=d(60)),
            ],
        ),
        Client(
            id="c-leo", name="Leo Grant", age=52, height_in=72, weight_lb=210, start_weight_lb=214,
            since=d(-45), frequency=2, usual_slots=[U(1, "18:30"), U(3, "18:30")],
            flexible_window="Evenings", contact="app", push_enabled=False, color="#5B6470",
            constraints=["back"], notes="Lower-back history. Keep hinges light; no slams.",
            objectives=[
                Objective(id="o-l1", title="Get to 195 lb", kind="bodyweight", unit="lb", start=214, target=195, lower_is_better=True, deadline=d(150), history=hist([214, 213, 213, 212, 211.5, 210], -35)),
            ],
        ),
        Client(
            id="c-sam", name="Sam Kim", age=26, height_in=67, weight_lb=160, start_weight_lb=160,
            since=d(-5), frequency=1, flexible_window="Any weekday noon or evening", contact="app", push_enabled=False,
            color="#0E6E70", notes="On the waitlist for a regular slot.", waitlist=True,
        ),
    ]

    # ----- Programs -----
    programs: list[Program] = []
    for ci, c in enumerate([c for c in clients if not c.waitlist]):
        days_n = max(2, min(3, c.frequency))
        include = [o.exercise_id for o in c.objectives if o.exercise_id]
        programs.append(Program(
            id=f"p-{c.id}", client_id=c.id, name="Fat loss + strength", goal="Fat loss", format="circuit", days_per_week=c.frequency,
            session_min=30, cardio_mix=40, equipment=FULL_KIT, block=2, weeks=6, start=d(-17),
            days=[
                generate_day(GenOptions(goal="Fat loss", cardio_mix=40, equipment=FULL_KIT, constraints=list(c.constraints), mods=c.mods,
                                        focus=FOCUS_ROTATION[i], seed=100 + ci * 17 + i * 5, include=include if i == 0 else []),
                             chr(65 + i), f"{c.id}-d{i}")
                for i in range(days_n)
            ],
        ))

    # ----- History: four weeks on usual days -----
    logs: list[SessionLog] = []
    bookings: list[Booking] = []
    for c in (c for c in clients if not c.waitlist):
        prog = next(p for p in programs if p.client_id == c.id)
        dates: list[datetime] = []
        for i in range(-28, 1):
            day = add_days(today, i)
            for s in (u for u in c.usual_slots if u.dow == dow(day)):
                t = at_time(day, s.time, tz)
                if t < now - timedelta(minutes=40):
                    dates.append(t)
        for k, t in enumerate(dates):
            day = prog.days[k % len(prog.days)]
            missed = (c.id == "c-priya" and k == len(dates) - 3) or (c.id == "c-marcus" and k in (len(dates) - 1, len(dates) - 3))
            bookings.append(Booking(id=uid("b"), client_id=c.id, start=t, duration_min=30, status="cancelled" if missed else "done", source="standing" if c.standing else "invite"))
            if missed:
                logs.append(SessionLog(id=uid("l"), client_id=c.id, date=t, day_id=day.id, day_label=day.label, day_name=day.name, status="missed",
                                       missed_reason="Client sick" if c.id == "c-priya" else "No-show"))
                continue
            done_before = sum(1 for l in logs if l.client_id == c.id and l.status == "done")
            entries: list[LogEntry] = []
            for circ in day.circuits:
                for rnd in range(1, circ.rounds + 1):
                    for p in circ.items:
                        e = EX.get(p.exercise_id)
                        load = p.load_lb
                        if load is not None and e and e.load_step:
                            base = e.load_lb if e.load_lb is not None else load
                            load = base + e.load_step * min(2, done_before // 4)
                            if c.id == "c-priya" and p.exercise_id == "goblet-squat":
                                load = min(45, 25 + 5 * done_before)
                            if c.id == "c-elena" and p.exercise_id == "db-push-press":
                                load = min(20, 10 + 5 * (done_before // 2))
                        entries.append(LogEntry(exercise_id=p.exercise_id, circuit=circ.label, round=rnd, reps=p.reps, sec=p.sec, load_lb=load,
                                                mod=p.note if p.note and "saved mod" in p.note else None))
            rpe = min(9, 7 + (done_before - 4)) if c.id == "c-priya" and done_before >= 4 else 7
            set_times = [x + ((k * 7 + i * 13) % 40) - 15 for i, x in enumerate([450, 470, 440, 465])]
            logs.append(SessionLog(
                id=uid("l"), client_id=c.id, date=t, day_id=day.id, day_label=day.label, day_name=day.name, status="done",
                duration_min=round(sum(set_times) / 60) + 1, rpe=rpe, set_times_sec=set_times, entries=entries,
                note="Felt strong, slept well." if k == len(dates) - 1 and c.id == "c-priya" else None,
            ))

    for c in clients:
        for o in c.objectives:
            if o.kind != "lift" or not o.exercise_id:
                continue
            o.history = []
            for l in sorted((l for l in logs if l.client_id == c.id and l.status == "done"), key=lambda l: l.date):
                e = next((x for x in l.entries if x.exercise_id == o.exercise_id and x.round == 1), None)
                if e and e.load_lb is not None:
                    o.history.append(HistoryPoint(date=l.date, value=e.load_lb))

    # ----- Session packages -----
    want_left = {"c-priya": 8, "c-daniel": 11, "c-marcus": 4, "c-elena": 1, "c-leo": 2}
    price = 60
    for c in clients:
        if c.waitlist:
            c.packages = [SessionPackage(id=uid("pk"), date=d(-5), sessions=5, price=5 * 65, note="Intro 5-pack")]
            continue
        done = sum(1 for l in logs if l.client_id == c.id and l.status == "done")
        total = done + want_left.get(c.id, 5)
        first = total - 10
        c.packages = (
            [SessionPackage(id=uid("pk"), date=c.since, sessions=first, price=first * price, note=f"{first}-session pack"),
             SessionPackage(id=uid("pk"), date=d(-16), sessions=10, price=10 * price, note="10-session pack")]
            if first >= 4 else
            [SessionPackage(id=uid("pk"), date=c.since, sessions=total, price=total * price, note=f"{total}-session pack")]
        )

    # ----- Busy blocks from other jobs -----
    busy: list[BusyBlock] = []
    for i in range(-28, 22):
        day = add_days(today, i)
        w = dow(day)
        if w in (1, 3, 5):
            busy.append(BusyBlock(id=uid("x"), start=at_time(day, "09:00", tz), end=at_time(day, "13:00", tz), label="Other job", source="Google Calendar"))
        if w in (2, 4):
            busy.append(BusyBlock(id=uid("x"), start=at_time(day, "14:00", tz), end=at_time(day, "17:00", tz), label="YMCA front desk", source="YMCA shifts"))

    # ----- Today's remaining sessions -----
    for c in (c for c in clients if not c.waitlist):
        for s in (u for u in c.usual_slots if u.dow == dow(today)):
            t = at_time(today, s.time, tz)
            if t >= now - timedelta(minutes=40):
                bookings.append(Booking(id=uid("b"), client_id=c.id, start=t, duration_min=30, status="confirmed", source="standing" if c.standing else "invite"))

    settings = default_settings(tz_name)
    availability = default_availability()
    sched = Sched(clients, bookings, busy, availability, settings, tz)
    new_b, messages = auto_plan(sched, now - timedelta(minutes=95), 5)
    bookings += new_b

    def accept(client_id: str, pick: int = 0):
        b = next((x for x in bookings if x.client_id == client_id and x.status == "awaiting"), None)
        if not b:
            return
        choice = (b.offered or [b.start])[pick] if b.offered and pick < len(b.offered) else b.start
        r = accept_time(Sched(clients, bookings, busy, availability, settings, tz), client_id, choice, now - timedelta(minutes=60), b.id)
        if r.ok:
            bookings[bookings.index(b)] = r.booking
            messages.extend(r.messages)

    accept("c-priya")
    accept("c-leo")
    mb = next((x for x in bookings if x.client_id == "c-marcus" and x.status == "awaiting"), None)
    if mb:
        nb, ms = decline_time(Sched(clients, bookings, busy, availability, settings, tz), mb.id, "Can't make that one this week.", now - timedelta(minutes=80))
        bookings[bookings.index(mb)] = nb
        messages.extend(ms)
        accept("c-marcus", 1)

    # Priya's travel request (needs the trainer)
    priya = clients[0]
    away_day = priya.away.from_
    for i in range(7):
        cand = add_days(priya.away.from_, i)
        if any(u.dow == dow(cand) for u in priya.usual_slots):
            away_day = cand
            break
    slot = next((u for u in priya.usual_slots if u.dow == dow(away_day)), priya.usual_slots[0])
    tb = Booking(id=uid("b"), client_id=priya.id, start=at_time(away_day, slot.time, tz), duration_min=30, status="needs-you", source="client", note="Client away · asked to move")
    bookings.append(tb)
    fmt = lambda x: x.astimezone(tz).strftime("%b ") + str(x.astimezone(tz).day)  # noqa: E731
    messages.append(Message(id=uid("m"), client_id=priya.id, at=now - timedelta(minutes=30), dir="in", channel="app",
                            body=f"I'm traveling {fmt(away_day)}–{fmt(priya.away.to)}. Can we move that session?", booking_id=tb.id))
    messages.sort(key=lambda m: m.at)

    return State(clients=clients, programs=programs, logs=logs, bookings=bookings, busy=busy, availability=availability, settings=settings, messages=messages)

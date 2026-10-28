"""Engine tests — same checks as web/src/engine/engine.test.ts, plus a parity test against the TypeScript generator."""
import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.engine.balance import session_balance
from app.engine.dates import add_days, dow, start_of_day
from app.engine.generator import GenOptions, generate_day
from app.engine.planner import exercise_status, objective_progress, plan_next_week
from app.engine.scheduler import Sched, accept_time, auto_plan, decline_time, open_slots
from app.schemas import ExerciseMod
from app.seed import FULL_KIT, build_seed

TZ = ZoneInfo("America/New_York")
NOW = datetime(2026, 10, 23, 21, 0, tzinfo=TZ).astimezone(timezone.utc)


@pytest.fixture(scope="module")
def seed():
    return build_seed(NOW)


def ids_of(day):
    return [p.exercise_id for c in day.circuits for p in c.items]


def test_generator_two_circuits_constraints_and_mods():
    day = generate_day(GenOptions(
        goal="Fat loss", cardio_mix=40, equipment=FULL_KIT, constraints=["knee"],
        mods=[ExerciseMod(exercise_id="mountain-climbers", kind="swap", swap_to_id="incline-climbers", detail="Hands on bench", reason="Wrist", saved_at=NOW)],
        focus="lower", seed=7, include=["goblet-squat"]), "A", "d1")
    assert len(day.circuits) == 2 and all(len(c.items) == 4 for c in day.circuits)
    ids = ids_of(day)
    assert "goblet-squat" in ids
    assert not {"walking-lunge", "jumping-jacks", "mountain-climbers"} & set(ids)
    assert len(set(ids)) == 8


def test_generator_respects_equipment():
    ids = ids_of(generate_day(GenOptions(goal="Strength", cardio_mix=30, equipment=["dumbbells", "bodyweight"], constraints=[], mods=[], focus="full", seed=3), "A", "x"))
    assert not any(i.startswith("rope") or i.startswith("kb-") for i in ids)


def test_generator_matches_typescript():
    """The Python port produces exactly the same drafts as the web app for the same inputs."""
    cases = json.loads((Path(__file__).parent / "fixtures" / "ts_generator.json").read_text())
    for case in cases:
        o = case["opts"]
        day = generate_day(GenOptions(goal=o["goal"], cardio_mix=o["cardioMix"], equipment=o["equipment"], constraints=o["constraints"],
                                      mods=[ExerciseMod.model_validate(m) for m in o["mods"]], focus=o["focus"], seed=o["seed"], include=o["include"]), "A", "x")
        got = day.out()["circuits"]
        want = case["day"]["circuits"]
        assert got == want, f"mismatch for {o}"


def test_stall_detected_and_tempo_planned(seed):
    priya = next(c for c in seed.clients if c.id == "c-priya")
    prog = next(p for p in seed.programs if p.client_id == "c-priya")
    assert exercise_status([l for l in seed.logs if l.client_id == "c-priya"], "goblet-squat").kind == "stall"
    plan = plan_next_week(priya, prog, seed.logs, NOW, TZ)
    assert any(c.kind == "stall" for c in plan.changes)
    assert "tempo-goblet-squat" in [p.exercise_id for d in plan.days for c in d.circuits for p in c.items]
    assert plan.days


def test_marcus_attendance_flag(seed):
    m = next(c for c in seed.clients if c.id == "c-marcus")
    plan = plan_next_week(m, next(p for p in seed.programs if p.client_id == m.id), seed.logs, NOW, TZ)
    assert any(c.kind == "adherence" for c in plan.changes)


def test_weight_objective_on_track(seed):
    priya = next(c for c in seed.clients if c.id == "c-priya")
    assert objective_progress(priya.objectives[0], NOW).status == "on-track"


def test_no_double_booking(seed):
    active = [b for b in seed.bookings if b.status in ("confirmed", "awaiting")]
    starts = [b.start for b in active]
    assert len(starts) == len(set(starts))
    assert len(seed.messages) > 3


def test_open_slots_skip_busy_blocks(seed):
    s = Sched(seed.clients, seed.bookings, seed.busy, seed.availability, seed.settings)
    today = start_of_day(NOW, TZ)
    mon = next(add_days(today, i) for i in range(1, 8) if dow(add_days(today, i)) == 1)
    for t in open_slots(s, mon, NOW):
        h = t.astimezone(TZ).hour
        assert h < 9 or h >= 13


def test_decline_then_accept():
    st = build_seed(NOW)
    past = [b for b in st.bookings if b.start < NOW]
    s = Sched(st.clients, past, st.busy, st.availability, st.settings)
    new_b, _ = auto_plan(s, NOW, 3)
    s.bookings = past + new_b
    b = next(x for x in new_b if x.status == "awaiting")
    nb, _ = decline_time(s, b.id, "no", NOW)
    assert nb.status in ("awaiting", "needs-you")
    if nb.offered:
        s.bookings = [nb if x.id == b.id else x for x in s.bookings]
        assert accept_time(s, b.client_id, nb.offered[0], NOW, b.id).ok


def test_unique_exercises_in_seeded_days(seed):
    for p in seed.programs:
        for d in p.days:
            ids = ids_of(d)
            assert len(ids) == len(set(ids))


def test_session_balances(seed):
    bal = lambda cid: session_balance(next(c for c in seed.clients if c.id == cid), seed.logs, seed.bookings, NOW)  # noqa: E731
    e = bal("c-elena")
    assert e.pending == 1 and e.low
    p = bal("c-priya")
    assert p.pending == 8 and p.purchased - p.done == p.pending
    sam = bal("c-sam")
    assert (sam.purchased, sam.done, sam.pending) == (5, 0, 5)
    m = bal("c-marcus")
    assert m.done == sum(1 for l in seed.logs if l.client_id == "c-marcus" and l.status == "done")

"""Circuit session generator: two circuits of four, honouring limits, saved modifications and equipment."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..schemas import Circuit, ExerciseMod, Prescription, ProgramDay
from .exercises import EX, EXERCISES, TEMPO_IDS, Exercise

M32 = 0xFFFFFFFF

DAY_NAMES = {"lower": "Lower + cardio", "upper": "Upper + cardio", "full": "Full body + ball"}
FOCUS_ROTATION = ["lower", "upper", "full", "lower", "upper"]
STRENGTH_PATTERNS = {
    "lower": ["squat", "hinge", "lunge", "pull", "push", "carry"],
    "upper": ["push", "pull", "push", "pull", "carry", "squat"],
    "full": ["squat", "push", "hinge", "pull", "lunge", "carry"],
}


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


def rng(seed: int):
    """mulberry32 — same sequence as the web app, so both produce identical drafts."""
    a = seed & M32

    def nxt() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return nxt


@dataclass
class GenOptions:
    goal: str
    cardio_mix: int
    equipment: list[str]
    constraints: list[str]
    mods: list[ExerciseMod]
    focus: str
    seed: int
    rounds: int = 2
    include: list[str] = field(default_factory=list)
    last_loads: dict[str, float] = field(default_factory=dict)


def _usable(e: Exercise, o: GenOptions) -> bool:
    ok_equip = all(q in ("bodyweight", "box") or q in o.equipment for q in e.equipment)
    return ok_equip and not any(c in o.constraints for c in e.avoid_for) and e.id not in TEMPO_IDS


def _canonical(pattern: str, type_: str) -> Exercise | None:
    return next((e for e in EXERCISES if e.pattern == pattern and e.type == type_ and e.id not in TEMPO_IDS), None)


def base_prescription(e: Exercise, goal: str, last_loads: dict[str, float] | None = None) -> Prescription:
    p = Prescription(exercise_id=e.id)
    if e.measure == "time":
        p.sec = e.sec
    else:
        p.reps = e.reps
    if e.load_lb is not None:
        p.load_lb = (last_loads or {}).get(e.id, e.load_lb)
    if goal == "Strength" and p.reps and p.load_lb:
        p.reps = max(6, p.reps - 2)
    if goal == "Endurance" and p.sec:
        p.sec = p.sec + 10
    return p


def apply_mods(p: Prescription, mods: list[ExerciseMod], constraints: list[str] | None = None) -> Prescription:
    """Apply a client's remembered modification for this exercise, if any."""
    mod = next((m for m in mods if m.exercise_id == p.exercise_id), None)
    if not mod:
        return p
    tag = f"saved mod ({mod.reason.lower()})"
    if mod.kind == "swap":
        to = EX.get(mod.swap_to_id or "")
        if not to:
            return p.model_copy(update={"note": f"{mod.detail} · {tag}"})
        return base_prescription(to, "Fat loss").model_copy(update={"note": f"{mod.detail or 'swapped in'} · {tag}"})
    if mod.kind == "shorter":
        sec = max(15, _js_round((p.sec * 0.75) / 5) * 5) if p.sec else p.sec
        reps = max(4, p.reps - 3) if p.reps and not p.sec else p.reps
        return p.model_copy(update={"sec": sec, "reps": reps, "note": f"{mod.detail or 'shorter'} · {tag}"})
    if mod.kind == "lighter":
        step = (EX[p.exercise_id].load_step if p.exercise_id in EX else None) or 5
        load = max(0, p.load_lb - step) if p.load_lb else p.load_lb
        return p.model_copy(update={"load_lb": load, "note": f"{mod.detail or 'lighter load'} · {tag}"})
    if mod.kind == "easier":
        return p.model_copy(update={"note": f"{mod.detail or 'easier variation'} · {tag}"})
    # skip → same pattern, safe for this client
    pat = EX[p.exercise_id].pattern if p.exercise_id in EX else None
    alt = next((e for e in EXERCISES if e.id != p.exercise_id and e.pattern == pat and not any(c in (constraints or []) for c in e.avoid_for)), None)
    if not alt:
        return p
    return base_prescription(alt, "Fat loss").model_copy(update={"note": f"replaces {EX[p.exercise_id].name.lower()} · {tag}"})


def generate_day(o: GenOptions, label: str, id_: str) -> ProgramDay:
    r = rng(o.seed)
    pool = [e for e in EXERCISES if _usable(e, o) and o.focus in e.focus]
    used: set[str] = set()

    cardio_n = min(5, max(2, _js_round(8 * o.cardio_mix / 100)))
    core_n = 3 if o.goal == "Mobility" else 2
    strength_n = 8 - cardio_n - core_n

    def take(cands: list[Exercise]) -> Exercise | None:
        c = [e for e in cands if e.id not in used]
        if not c:
            return None
        e = c[math.floor(r() * len(c))]
        used.add(e.id)
        return e

    strength: list[tuple[Exercise, str | None]] = []
    forced = [EX[i] for i in o.include if i in EX and _usable(EX[i], o)]
    for e in forced:
        if e.type == "strength" and len(strength) < strength_n and e.id not in used:
            used.add(e.id)
            strength.append((e, None))
    for pat in STRENGTH_PATTERNS[o.focus]:
        if len(strength) >= strength_n:
            break
        if any(s[0].pattern == pat for s in strength) and pat not in ("push", "pull"):
            continue
        e = take([x for x in pool if x.type == "strength" and x.pattern == pat])
        if not e:
            continue
        note = None
        can = _canonical(pat, "strength")
        if can and can.id != e.id:
            hit = next((c for c in can.avoid_for if c in o.constraints), None)
            if hit:
                note = f"replaces {can.name.lower()} · {hit}"
        strength.append((e, note))
    while len(strength) < strength_n:
        e = take([x for x in pool if x.type == "strength"])
        if not e:
            break
        strength.append((e, None))

    cardio: list[Exercise] = [e for e in forced if e.type == "cardio"]
    while len(cardio) < cardio_n:
        e = take([x for x in pool if x.type == "cardio"])
        if not e:
            break
        cardio.append(e)
    core: list[Exercise] = []
    while len(core) < core_n:
        e = take([x for x in pool if x.type == "core"])
        if not e:
            break
        core.append(e)

    c_a = math.ceil(len(cardio) / 2)
    groups = [{"cardio": cardio[:c_a], "other": []}, {"cardio": cardio[c_a:], "other": []}]
    for s in [*strength, *[(e, None) for e in core]]:
        g0 = groups[0]
        target = g0 if len(g0["cardio"]) + len(g0["other"]) < 4 else groups[1]
        target["other"].append(s)

    circuits: list[Circuit] = []
    for gi, g in enumerate(groups):
        cs, os_ = list(g["cardio"]), list(g["other"])
        order = ["c", "o", "o", "c"] if len(cs) >= 2 else ["c", "o", "o", "o"] if len(cs) == 1 else ["o", "o", "o", "o"]
        items: list[Prescription] = []
        for slot in order:
            if slot == "c" and cs:
                items.append(base_prescription(cs.pop(0), o.goal, o.last_loads))
            elif os_:
                e, note = os_.pop(0)
                p = base_prescription(e, o.goal, o.last_loads)
                if note:
                    p.note = note
                items.append(p)
            elif cs:
                items.append(base_prescription(cs.pop(0), o.goal, o.last_loads))
        circuits.append(Circuit(label="A" if gi == 0 else "B", rounds=o.rounds, items=[apply_mods(p, o.mods, o.constraints) for p in items]))

    # A saved swap can land on an exercise already in the day: replace the repeat
    seen: set[str] = set()
    modded = {m.exercise_id for m in o.mods}
    for c in circuits:
        new_items = []
        for p in c.items:
            if p.exercise_id not in seen:
                seen.add(p.exercise_id)
                new_items.append(p)
                continue
            t = EX[p.exercise_id].type if p.exercise_id in EX else None
            alt = next((e for e in pool if e.type == t and e.id not in seen and e.id not in used and e.id not in modded), None)
            if not alt:
                new_items.append(p)
                continue
            seen.add(alt.id)
            used.add(alt.id)
            new_items.append(base_prescription(alt, o.goal, o.last_loads))
        c.items = new_items

    return ProgramDay(id=id_, label=label, name=DAY_NAMES[o.focus], focus=o.focus, circuits=circuits)


def _js_round(x: float) -> int:
    """JavaScript Math.round (halves round up)."""
    return math.floor(x + 0.5)


def round_seconds(c: Circuit) -> int:
    work = 0
    for p in c.items:
        e = EX.get(p.exercise_id)
        if p.sec:
            work += p.sec
        else:
            work += (p.reps or 10) * 3 * (2 if e and e.per_side else 1)
    return work + len(c.items) * 15 + 45


def describe(p: Prescription) -> str:
    e = EX.get(p.exercise_id)
    parts = []
    if p.sec:
        parts.append(f"{p.sec} s")
    if p.reps:
        parts.append(f"{p.reps}{' / side' if e and e.per_side else ''}")
    if p.load_lb:
        parts.append(f"{p.load_lb:g} lb")
    return " · ".join(parts)

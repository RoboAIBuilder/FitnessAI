"""Exercise library (shared with the web app via exercises.json)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

_DATA = json.loads((Path(__file__).with_name("exercises.json")).read_text())


@dataclass(frozen=True)
class Exercise:
    id: str
    name: str
    type: str  # cardio | strength | core
    pattern: str
    equipment: tuple[str, ...]
    measure: str  # reps | time
    avoid_for: tuple[str, ...]
    focus: tuple[str, ...]
    reps: int | None = None
    sec: int | None = None
    load_lb: float | None = None
    load_step: float | None = None
    per_side: bool = False
    tempo_variant: str | None = None
    extra: dict = field(default_factory=dict, compare=False)


def _ex(d: dict) -> Exercise:
    return Exercise(
        id=d["id"], name=d["name"], type=d["type"], pattern=d["pattern"], equipment=tuple(d["equipment"]),
        measure=d["measure"], avoid_for=tuple(d.get("avoidFor", [])), focus=tuple(d["focus"]),
        reps=d.get("reps"), sec=d.get("sec"), load_lb=d.get("loadLb"), load_step=d.get("loadStep"),
        per_side=bool(d.get("perSide")), tempo_variant=d.get("tempoVariant"),
    )


EXERCISES: list[Exercise] = [_ex(d) for d in _DATA["exercises"]]
EX: dict[str, Exercise] = {e.id: e for e in EXERCISES}
EQUIPMENT_LABELS: dict[str, str] = _DATA["equipmentLabels"]
TEMPO_IDS = {e.tempo_variant for e in EXERCISES if e.tempo_variant}


def ex_name(id_: str) -> str:
    return EX[id_].name if id_ in EX else id_


def alternatives_for(id_: str, avoid: list[str] | None = None, equipment: list[str] | None = None) -> list[Exercise]:
    base = EX.get(id_)
    if not base:
        return []
    avoid = avoid or []
    out = [
        e for e in EXERCISES
        if e.id != id_
        and (e.pattern == base.pattern or (base.type == "cardio" and e.type == "cardio"))
        and not any(c in avoid for c in e.avoid_for)
        and (equipment is None or all(q in equipment or q in ("bodyweight", "box") for q in e.equipment))
    ]
    return sorted(out, key=lambda e: e.pattern != base.pattern)

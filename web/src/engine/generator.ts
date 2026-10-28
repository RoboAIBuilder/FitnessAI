import type { Circuit, Constraint, Equip, Exercise, ExerciseMod, Goal, Pattern, Prescription, ProgramDay } from '../types';
import { EX, EXERCISES } from '../data/exercises';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPO_IDS = new Set(EXERCISES.map((e) => e.tempoVariant).filter(Boolean) as string[]);

export interface GenOptions {
  goal: Goal;
  cardioMix: number; // 0..100 share of cardio slots
  equipment: Equip[];
  constraints: Constraint[];
  mods: ExerciseMod[];
  focus: 'lower' | 'upper' | 'full';
  seed: number;
  rounds?: number;
  include?: string[]; // exercise ids that must appear (objective lifts)
  lastLoads?: Record<string, number>;
}

const STRENGTH_PATTERNS: Record<GenOptions['focus'], Pattern[]> = {
  lower: ['squat', 'hinge', 'lunge', 'pull', 'push', 'carry'],
  upper: ['push', 'pull', 'push', 'pull', 'carry', 'squat'],
  full: ['squat', 'push', 'hinge', 'pull', 'lunge', 'carry']
};

export const DAY_NAMES: Record<GenOptions['focus'], string> = {
  lower: 'Lower + cardio',
  upper: 'Upper + cardio',
  full: 'Full body + ball'
};

function usable(e: Exercise, o: GenOptions) {
  const okEquip = e.equipment.every((q) => q === 'bodyweight' || q === 'box' || o.equipment.includes(q));
  return okEquip && !e.avoidFor.some((c) => o.constraints.includes(c)) && !TEMPO_IDS.has(e.id);
}

/** The first library exercise for a pattern — used to explain constraint-driven substitutions. */
function canonical(pattern: Pattern, type: Exercise['type']) {
  return EXERCISES.find((e) => e.pattern === pattern && e.type === type && !TEMPO_IDS.has(e.id));
}

function pick<T>(arr: T[], r: () => number): T | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(r() * arr.length)];
}

export function basePrescription(e: Exercise, goal: Goal, lastLoads?: Record<string, number>): Prescription {
  const p: Prescription = { exerciseId: e.id };
  if (e.measure === 'time') p.sec = e.sec;
  else p.reps = e.reps;
  if (e.loadLb !== undefined) p.loadLb = lastLoads?.[e.id] ?? e.loadLb;
  if (goal === 'Strength' && p.reps && p.loadLb) {
    p.reps = Math.max(6, p.reps - 2);
  }
  if (goal === 'Endurance' && p.sec) p.sec = p.sec + 10;
  if (goal === 'Muscle' && p.reps) p.reps = p.reps;
  return p;
}

/** Apply a client's remembered modifications to a prescription. */
export function applyMods(p: Prescription, mods: ExerciseMod[], constraints: Constraint[] = []): Prescription {
  const mod = mods.find((m) => m.exerciseId === p.exerciseId);
  if (!mod) return p;
  const tag = `saved mod (${mod.reason.toLowerCase()})`;
  switch (mod.kind) {
    case 'swap': {
      const to = mod.swapToId && EX[mod.swapToId];
      if (!to) return { ...p, note: `${mod.detail} · ${tag}` };
      return { ...basePrescription(to, 'Fat loss'), note: `${mod.detail || 'swapped in'} · ${tag}` };
    }
    case 'shorter':
      return {
        ...p,
        sec: p.sec ? Math.max(15, Math.round((p.sec * 0.75) / 5) * 5) : p.sec,
        reps: p.reps && !p.sec ? Math.max(4, p.reps - 3) : p.reps,
        note: `${mod.detail || 'shorter'} · ${tag}`
      };
    case 'lighter': {
      const step = EX[p.exerciseId]?.loadStep ?? 5;
      return { ...p, loadLb: p.loadLb ? Math.max(0, p.loadLb - step) : p.loadLb, note: `${mod.detail || 'lighter load'} · ${tag}` };
    }
    case 'easier':
      return { ...p, note: `${mod.detail || 'easier variation'} · ${tag}` };
    case 'skip': {
      const alt = EXERCISES.find(
        (e) => e.id !== p.exerciseId && e.pattern === EX[p.exerciseId]?.pattern && !e.avoidFor.some((c) => constraints.includes(c))
      );
      return alt ? { ...basePrescription(alt, 'Fat loss'), note: `replaces ${EX[p.exerciseId]?.name.toLowerCase()} · ${tag}` } : p;
    }
  }
}

export function generateDay(o: GenOptions, label: string, id: string): ProgramDay {
  const r = rng(o.seed);
  const rounds = o.rounds ?? 2;
  const pool = EXERCISES.filter((e) => usable(e, o) && e.focus.includes(o.focus));
  const used = new Set<string>();

  let cardioN = Math.round((8 * o.cardioMix) / 100);
  cardioN = Math.min(5, Math.max(2, cardioN));
  const coreN = o.goal === 'Mobility' ? 3 : 2;
  const strengthN = 8 - cardioN - coreN;

  const take = (cands: Exercise[]) => {
    const c = cands.filter((e) => !used.has(e.id));
    const e = pick(c, r);
    if (e) used.add(e.id);
    return e;
  };

  // Strength by pattern priority
  const strength: { e: Exercise; note?: string }[] = [];
  const forced = (o.include ?? []).map((i) => EX[i]).filter((e) => e && usable(e, o));
  for (const e of forced) {
    if (e.type === 'strength' && strength.length < strengthN && !used.has(e.id)) {
      used.add(e.id);
      strength.push({ e });
    }
  }
  for (const pat of STRENGTH_PATTERNS[o.focus]) {
    if (strength.length >= strengthN) break;
    if (strength.some((s) => s.e.pattern === pat) && pat !== 'push' && pat !== 'pull') continue;
    const e = take(pool.filter((x) => x.type === 'strength' && x.pattern === pat));
    if (!e) continue;
    const can = canonical(pat, 'strength');
    let note: string | undefined;
    if (can && can.id !== e.id) {
      const hit = can.avoidFor.find((c) => o.constraints.includes(c));
      if (hit) note = `replaces ${can.name.toLowerCase()} · ${hit}`;
    }
    strength.push({ e, note });
  }
  while (strength.length < strengthN) {
    const e = take(pool.filter((x) => x.type === 'strength'));
    if (!e) break;
    strength.push({ e });
  }

  const cardio: Exercise[] = [];
  for (const e of forced) if (e.type === 'cardio' && !cardio.includes(e)) cardio.push(e);
  while (cardio.length < cardioN) {
    const e = take(pool.filter((x) => x.type === 'cardio'));
    if (!e) break;
    cardio.push(e);
  }
  const core: Exercise[] = [];
  while (core.length < coreN) {
    const e = take(pool.filter((x) => x.type === 'core'));
    if (!e) break;
    core.push(e);
  }

  // Distribute into two circuits of four, interleaving cardio and strength
  const cA = Math.ceil(cardio.length / 2);
  const groups: { cardio: Exercise[]; other: { e: Exercise; note?: string }[] }[] = [
    { cardio: cardio.slice(0, cA), other: [] },
    { cardio: cardio.slice(cA), other: [] }
  ];
  const others = [...strength, ...core.map((e) => ({ e, note: undefined as string | undefined }))];
  // strength first fills circuit A (bigger lifts first), core goes last
  for (const s of others) {
    const target = groups[0].cardio.length + groups[0].other.length < 4 ? groups[0] : groups[1];
    target.other.push(s);
  }

  const circuits: Circuit[] = groups.map((g, gi) => {
    const items: Prescription[] = [];
    const cs = [...g.cardio];
    const os = [...g.other];
    // pattern: cardio, strength, strength, cardio (or as available)
    const order: ('c' | 'o')[] = cs.length >= 2 ? ['c', 'o', 'o', 'c'] : cs.length === 1 ? ['c', 'o', 'o', 'o'] : ['o', 'o', 'o', 'o'];
    for (const slot of order) {
      if (slot === 'c' && cs.length) {
        const e = cs.shift()!;
        items.push(basePrescription(e, o.goal, o.lastLoads));
      } else if (os.length) {
        const s = os.shift()!;
        items.push({ ...basePrescription(s.e, o.goal, o.lastLoads), ...(s.note ? { note: s.note } : {}) });
      } else if (cs.length) {
        items.push(basePrescription(cs.shift()!, o.goal, o.lastLoads));
      }
    }
    return {
      label: gi === 0 ? 'A' : 'B',
      rounds,
      items: items.map((p) => applyMods(p, o.mods, o.constraints))
    } as Circuit;
  });

  // A saved swap can land on an exercise that's already in the day: replace the repeat
  const seen = new Set<string>();
  for (const c of circuits) {
    c.items = c.items.map((p) => {
      if (!seen.has(p.exerciseId)) {
        seen.add(p.exerciseId);
        return p;
      }
      const type = EX[p.exerciseId]?.type;
      const alt = pool.find((e) => e.type === type && !seen.has(e.id) && !used.has(e.id) && !o.mods.some((m) => m.exerciseId === e.id));
      if (!alt) return p;
      seen.add(alt.id);
      used.add(alt.id);
      return basePrescription(alt, o.goal, o.lastLoads);
    });
  }

  return { id, label, name: DAY_NAMES[o.focus], focus: o.focus, circuits };
}

export const FOCUS_ROTATION: GenOptions['focus'][] = ['lower', 'upper', 'full', 'lower', 'upper'];

/** Rough seconds per round: work + 15 s transitions + 45 s rest at the end of the round. */
export function roundSeconds(c: Circuit) {
  const work = c.items.reduce((sum, p) => {
    const e = EX[p.exerciseId];
    if (p.sec) return sum + p.sec;
    const reps = p.reps ?? 10;
    return sum + reps * 3 * (e?.perSide ? 2 : 1);
  }, 0);
  return work + c.items.length * 15 + 45;
}

export function describePrescription(p: Prescription) {
  const e = EX[p.exerciseId];
  const parts: string[] = [];
  if (p.sec) parts.push(`${p.sec} s`);
  if (p.reps) parts.push(`${p.reps}${e?.perSide ? ' / side' : ''}`);
  if (p.loadLb) parts.push(`${p.loadLb} lb`);
  return parts.join(' · ');
}

import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed';
import { generateDay } from './generator';
import { planNextWeek, exerciseStatus, objectiveProgress } from './planner';
import { autoPlan, openSlots, acceptTime, declineTime } from './scheduler';
import { addDays, startOfDay } from '../lib/dates';

const NOW = new Date('2026-10-23T21:00:00');

describe('generator', () => {
  it('builds two circuits of four, honours constraints and saved mods', () => {
    const day = generateDay(
      {
        goal: 'Fat loss', cardioMix: 40, equipment: ['ropes', 'dumbbells', 'kettlebell', 'stability-ball', 'med-ball', 'bodyweight', 'box'],
        constraints: ['knee'], mods: [{ exerciseId: 'mountain-climbers', kind: 'swap', swapToId: 'incline-climbers', detail: 'Hands on bench', reason: 'Wrist', savedAt: '' }],
        focus: 'lower', seed: 7, include: ['goblet-squat']
      },
      'A', 'd1'
    );
    expect(day.circuits).toHaveLength(2);
    day.circuits.forEach((c) => expect(c.items).toHaveLength(4));
    const ids = day.circuits.flatMap((c) => c.items.map((p) => p.exerciseId));
    expect(ids).toContain('goblet-squat');
    expect(ids).not.toContain('walking-lunge');
    expect(ids).not.toContain('jumping-jacks');
    expect(ids).not.toContain('mountain-climbers');
    expect(new Set(ids).size).toBe(8);
  });

  it('excludes machines and missing equipment', () => {
    const day = generateDay({ goal: 'Strength', cardioMix: 30, equipment: ['dumbbells', 'bodyweight'], constraints: [], mods: [], focus: 'full', seed: 3 }, 'A', 'x');
    const ids = day.circuits.flatMap((c) => c.items.map((p) => p.exerciseId));
    expect(ids.some((i) => i.startsWith('rope'))).toBe(false);
    expect(ids.some((i) => i.startsWith('kb-'))).toBe(false);
  });
});

describe('seed + planner', () => {
  const s = buildSeed(NOW);
  const priya = s.clients.find((c) => c.id === 'c-priya')!;
  const prog = s.programs.find((p) => p.clientId === 'c-priya')!;

  it('detects Priya goblet squat stall and plans the tempo variant', () => {
    const st = exerciseStatus(s.logs.filter((l) => l.clientId === 'c-priya'), 'goblet-squat');
    expect(st.kind).toBe('stall');
    const plan = planNextWeek(priya, prog, s.logs, NOW);
    expect(plan.changes.some((c) => c.kind === 'stall')).toBe(true);
    const ids = plan.days.flatMap((d) => d.circuits.flatMap((c) => c.items.map((p) => p.exerciseId)));
    expect(ids).toContain('tempo-goblet-squat');
    expect(plan.days.length).toBeGreaterThan(0);
  });

  it('flags Marcus attendance', () => {
    const m = s.clients.find((c) => c.id === 'c-marcus')!;
    const plan = planNextWeek(m, s.programs.find((p) => p.clientId === m.id)!, s.logs, NOW);
    expect(plan.changes.some((c) => c.kind === 'adherence')).toBe(true);
  });

  it('weight objective is on track', () => {
    expect(objectiveProgress(priya.objectives[0], NOW).status).toBe('on-track');
  });

  it('auto-plan produced bookings and messages without double-booking', () => {
    expect(s.messages.length).toBeGreaterThan(3);
    const active = s.bookings.filter((b) => ['confirmed', 'awaiting'].includes(b.status));
    for (const a of active)
      for (const b of active)
        if (a !== b) expect(a.start === b.start).toBe(false);
  });

  it('open slots skip busy blocks', () => {
    const mon = addDays(startOfDay(NOW), ((1 - NOW.getDay() + 7) % 7) || 7);
    const slots = openSlots(s, mon, NOW);
    for (const t of slots) expect(t.getHours() < 9 || t.getHours() >= 13).toBe(true);
  });

  it('decline then accept flow', () => {
    const fresh = buildSeed(NOW);
    const plan = autoPlan({ ...fresh, bookings: fresh.bookings.filter((b) => new Date(b.start) < NOW) }, NOW, 3);
    const b = plan.bookings.find((x) => x.status === 'awaiting')!;
    const st = { ...fresh, bookings: [...fresh.bookings.filter((x) => new Date(x.start) < NOW), ...plan.bookings] };
    const d = declineTime(st, b.id, 'no', NOW);
    expect(['awaiting', 'needs-you']).toContain(d.booking.status);
    if (d.booking.offered) {
      const st2 = { ...st, bookings: st.bookings.map((x) => (x.id === b.id ? d.booking : x)) };
      const r = acceptTime(st2, b.clientId!, d.booking.offered[0], NOW, b.id);
      expect(r.ok).toBe(true);
    }
  });
});

describe('no duplicate exercises after saved swaps', () => {
  it('every seeded program day has 8 distinct exercises', () => {
    const s = buildSeed(NOW);
    for (const p of s.programs)
      for (const d of p.days) {
        const ids = d.circuits.flatMap((c) => c.items.map((i) => i.exerciseId));
        expect(new Set(ids).size).toBe(ids.length);
      }
  });
});

import { sessionBalance } from '../lib/balance';
describe('session packages', () => {
  const s = buildSeed(NOW);
  it('pending = purchased - done, with seeded balances', () => {
    const e = sessionBalance(s, 'c-elena', NOW);
    expect(e.pending).toBe(1);
    expect(e.low).toBe(true);
    const p = sessionBalance(s, 'c-priya', NOW);
    expect(p.purchased - p.done).toBe(p.pending);
    expect(p.pending).toBe(8);
    const sam = sessionBalance(s, 'c-sam', NOW);
    expect(sam).toMatchObject({ purchased: 5, done: 0, pending: 5 });
  });
  it('missed sessions do not count as done', () => {
    const m = sessionBalance(s, 'c-marcus', NOW);
    const done = s.logs.filter((l) => l.clientId === 'c-marcus' && l.status === 'done').length;
    expect(m.done).toBe(done);
  });
  it('a logged session reduces pending by one', () => {
    const before = sessionBalance(s, 'c-leo', NOW).pending;
    const s2 = { ...s, logs: [...s.logs, { ...s.logs.find((l) => l.clientId === 'c-leo' && l.status === 'done')!, id: 'x' }] };
    expect(sessionBalance(s2, 'c-leo', NOW).pending).toBe(before - 1);
  });
});

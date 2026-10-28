import type { Client, Objective, PlanChange, Program, ProgramDay, SessionLog, WeekPlan } from '../types';
import { EX } from '../data/exercises';
import { addDays, fmtMonthDay, startOfDay, startOfWeek } from '../lib/dates';

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

/** Load history for one exercise across completed sessions (first-round load), oldest first. */
export function loadHistory(logs: SessionLog[], exerciseId: string) {
  return logs
    .filter((l) => l.status === 'done')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const e = l.entries.find((x) => x.exerciseId === exerciseId && x.round === 1);
      return e && e.loadLb !== undefined ? { date: l.date, load: e.loadLb, rpe: l.rpe ?? 7 } : null;
    })
    .filter(Boolean) as { date: string; load: number; rpe: number }[];
}

export function lastLoads(logs: SessionLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of [...logs].filter((x) => x.status === 'done').sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of l.entries) if (e.loadLb !== undefined && e.round === 1) out[e.exerciseId] = e.loadLb;
  }
  return out;
}

export type ExerciseStatus = { kind: 'stall'; load: number; sessions: number } | { kind: 'progress'; load: number; next: number } | { kind: 'hold' };

export function exerciseStatus(logs: SessionLog[], exerciseId: string): ExerciseStatus {
  const h = loadHistory(logs, exerciseId);
  if (h.length >= 3) {
    const last3 = h.slice(-3);
    const same = last3.every((x) => x.load === last3[0].load);
    const hard = last3[2].rpe >= 8;
    if (same && hard && last3[0].load > 0) {
      let n = 0;
      for (let i = h.length - 1; i >= 0 && h[i].load === last3[0].load; i--) n++;
      return { kind: 'stall', load: last3[0].load, sessions: n };
    }
  }
  if (h.length >= 2) {
    const [a, b] = h.slice(-2);
    if (a.load === b.load && b.rpe <= 7 && b.load > 0) {
      const step = EX[exerciseId]?.loadStep ?? 5;
      return { kind: 'progress', load: b.load, next: b.load + step };
    }
  }
  return { kind: 'hold' };
}

/** Objective progress (0..1), current value and whether the client is ahead of the calendar. */
export function objectiveProgress(o: Objective, now = new Date()) {
  const cur = o.history.length ? o.history[o.history.length - 1].value : o.start;
  const span = o.target - o.start;
  const frac = span === 0 ? 1 : Math.min(1, Math.max(0, (cur - o.start) / span));
  const first = o.history.length ? new Date(o.history[0].date) : now;
  const total = new Date(o.deadline).getTime() - first.getTime();
  const elapsed = now.getTime() - first.getTime();
  const timeFrac = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 1;
  // projection from the last 6 entries
  const recent = o.history.slice(-6);
  let projected: Date | null = null;
  let ratePerWeek = 0;
  if (recent.length >= 2) {
    const t0 = new Date(recent[0].date).getTime();
    const t1 = new Date(recent[recent.length - 1].date).getTime();
    const weeks = (t1 - t0) / (7 * 86400000);
    ratePerWeek = weeks > 0 ? (recent[recent.length - 1].value - recent[0].value) / weeks : 0;
    const remaining = o.target - cur;
    if (ratePerWeek !== 0 && Math.sign(ratePerWeek) === Math.sign(remaining)) {
      projected = new Date(t1 + (remaining / ratePerWeek) * 7 * 86400000);
    }
  }
  // stall: last 3 entries identical
  const last3 = o.history.slice(-3);
  const stalled = frac < 1 && last3.length === 3 && last3.every((x) => x.value === last3[0].value);
  let status: 'done' | 'on-track' | 'behind' | 'stalled';
  if (frac >= 1) status = 'done';
  else if (stalled) status = 'stalled';
  else if (projected && projected <= new Date(o.deadline)) status = 'on-track';
  else status = frac + 0.08 >= timeFrac ? 'on-track' : 'behind';
  return { current: cur, frac, timeFrac, projected, ratePerWeek, status };
}

export function fmtObjectiveValue(o: Objective, v: number) {
  if (o.unit === 'sec' && o.kind === 'time' && o.target > 300) {
    return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
  }
  if (o.unit === 'sec') return `${v} s`;
  return `${v} ${o.unit}`;
}

/** Program day that a given session index maps to (simple rotation). */
export function dayForIndex(program: Program, i: number): ProgramDay {
  return program.days[((i % program.days.length) + program.days.length) % program.days.length];
}

/** Next day in rotation after the client's last completed or missed session. */
export function nextDay(program: Program, logs: SessionLog[]): ProgramDay {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last) return program.days[0];
  const idx = program.days.findIndex((d) => d.id === last.dayId || d.label === last.dayLabel);
  return program.days[(idx + 1) % program.days.length];
}

export function planNextWeek(client: Client, program: Program, logs: SessionLog[], now = new Date()): WeekPlan {
  const weekStart = addDays(startOfWeek(now), 7);
  const changes: PlanChange[] = [];
  const clientLogs = logs.filter((l) => l.clientId === client.id);

  // 1) Exercise-level rules
  const allIds = new Set(program.days.flatMap((d) => d.circuits.flatMap((c) => c.items.map((p) => p.exerciseId))));
  const replacements: Record<string, { toId?: string; load?: number; reason: string }> = {};
  for (const id of allIds) {
    const st = exerciseStatus(clientLogs, id);
    const name = EX[id]?.name ?? id;
    if (st.kind === 'stall') {
      const tempo = EX[id]?.tempoVariant;
      const newLoad = round5(st.load * 0.9);
      replacements[id] = { toId: tempo, load: newLoad, reason: 'stall' };
      changes.push({
        kind: 'stall',
        title: `${name} stuck at ${st.load} lb for ${st.sessions} sessions`,
        detail: tempo ? `Switch to ${EX[tempo].name.toLowerCase()} at ${newLoad} lb to break the plateau.` : `Drop to ${newLoad} lb and slow the tempo for one week.`
      });
    } else if (st.kind === 'progress') {
      replacements[id] = { load: st.next, reason: 'progress' };
      changes.push({ kind: 'progress', title: `${name} felt manageable at ${st.load} lb`, detail: `Go up to ${st.next} lb.` });
    }
  }

  // 2) Adherence
  const twoWeeksAgo = addDays(now, -14).toISOString();
  const recent = clientLogs.filter((l) => l.date >= twoWeeksAgo);
  const missed = recent.filter((l) => l.status === 'missed').length;
  if (recent.length && missed >= 2) {
    changes.push({
      kind: 'adherence',
      title: `Missed ${missed} of last ${recent.length} sessions`,
      detail: 'Keep loads the same this week and check in about schedule or motivation.'
    });
    // don't progress loads when attendance is poor
    for (const k of Object.keys(replacements)) if (replacements[k].reason === 'progress') delete replacements[k];
  }

  // 3) Objectives
  let addRopeSprints = false;
  for (const o of client.objectives) {
    const p = objectiveProgress(o, now);
    if (o.kind === 'time' && o.lowerIsBetter && p.status === 'behind') {
      addRopeSprints = true;
      changes.push({
        kind: 'endurance',
        title: `${o.title}: behind pace`,
        detail: 'Swap a low-intensity cardio move for rope sprints, and add a 25-min tempo run on their own.'
      });
    } else if (o.kind === 'bodyweight' && (p.status === 'on-track' || p.status === 'done')) {
      changes.push({
        kind: 'on-track',
        title: `${o.title}: on track`,
        detail: p.projected ? `At ${Math.abs(p.ratePerWeek).toFixed(1)} lb/week, reaches ${o.target} lb around ${fmtMonthDay(p.projected)}. Keep the conditioning work as is.` : 'Keep the plan as is.'
      });
    }
  }

  // 4) Travel
  if (client.away) {
    const from = new Date(client.away.from);
    const to = new Date(client.away.to);
    if (to >= weekStart && from < addDays(weekStart, 7)) {
      changes.push({ kind: 'travel', title: `Away ${fmtMonthDay(from)}–${fmtMonthDay(to)}`, detail: 'Sessions on those days are left out of the plan; reschedule from Schedule.' });
    }
  }

  // Build the days for next week from usual slots
  const slots = [...client.usualSlots].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7));
  let rot = program.days.indexOf(nextDay(program, clientLogs));
  if (rot < 0) rot = 0;
  const lowCardio = new Set(['jumping-jacks', 'step-jacks', 'march-fast', 'mountain-climbers', 'incline-climbers']);
  let sprintAdded = false;
  const days: WeekPlan['days'] = [];
  for (const s of slots) {
    const date = addDays(weekStart, (s.dow + 6) % 7);
    if (client.away && startOfDay(date) >= startOfDay(new Date(client.away.from)) && startOfDay(date) <= startOfDay(new Date(client.away.to))) continue;
    const base = program.days[rot % program.days.length];
    rot++;
    let changed = 0;
    const circuits = base.circuits.map((c) => ({
      ...c,
      items: c.items.map((p) => {
        const r = replacements[p.exerciseId];
        if (r) {
          changed++;
          if (r.toId) {
            const e = EX[r.toId];
            return { exerciseId: r.toId, reps: e.reps, sec: e.sec, loadLb: r.load, changed: r.reason, note: p.note };
          }
          return { ...p, loadLb: r.load, changed: r.reason };
        }
        if (addRopeSprints && !sprintAdded && lowCardio.has(p.exerciseId)) {
          sprintAdded = true;
          changed++;
          return { exerciseId: 'rope-sprints', sec: 45, changed: 'endurance' };
        }
        return p;
      })
    }));
    days.push({ ...base, circuits, date: date.toISOString(), changedCount: changed });
  }

  if (!changes.length) changes.push({ kind: 'on-track', title: 'Everything on track', detail: 'Repeat this week with the same loads.' });
  return { clientId: client.id, weekStart: weekStart.toISOString(), changes, days, approved: false };
}

import type { Availability, Booking, BusyBlock, Client, Equip, LogEntry, Message, Program, SessionLog, Settings } from '../types';
import { EX } from './exercises';
import { FOCUS_ROTATION, generateDay } from '../engine/generator';
import { acceptTime, autoPlan, declineTime, type SchedState } from '../engine/scheduler';
import { addDays, addMinutes, atTime, startOfDay, uid } from '../lib/dates';

const FULL_KIT: Equip[] = ['ropes', 'dumbbells', 'kettlebell', 'stability-ball', 'med-ball', 'bodyweight', 'box'];

export const DEFAULT_SETTINGS: Settings = {
  trainerName: 'Coach',
  sessionMin: 30,
  bufferMin: 10,
  bookAheadDays: 7,
  minNoticeH: 12,
  inviteDaysAhead: 3,
  reminderHours: 12,
  automation: { inviteAhead: true, autoConfirmStanding: true, reminder: true, offerAlternatives: true, waitlist: true, askFirst: false },
  calendars: [
    { name: 'Google Calendar', synced: true },
    { name: 'YMCA shifts', synced: true }
  ]
};

export const DEFAULT_AVAILABILITY: Availability = {
  0: [],
  1: [{ start: '06:00', end: '09:00' }, { start: '12:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  2: [{ start: '12:00', end: '14:00' }, { start: '17:00', end: '20:00' }],
  3: [{ start: '06:00', end: '09:00' }, { start: '16:00', end: '20:00' }],
  4: [{ start: '12:00', end: '14:00' }, { start: '17:00', end: '20:00' }],
  5: [{ start: '06:00', end: '09:00' }, { start: '16:00', end: '19:00' }],
  6: [{ start: '08:00', end: '11:00' }]
};

export interface SeedState extends SchedState {
  programs: Program[];
  logs: SessionLog[];
}

export function buildSeed(now = new Date()): SeedState {
  const today = startOfDay(now);
  const d = (n: number) => addDays(today, n).toISOString();

  const clients: Client[] = [
    {
      id: 'c-priya', name: 'Priya Shah', age: 34, heightIn: 65, weightLb: 158, startWeightLb: 164, bodyFatPct: 31,
      since: d(-210), frequency: 3, usualSlots: [{ dow: 1, time: '07:30' }, { dow: 3, time: '07:30' }, { dow: 5, time: '07:30' }],
      standing: false, flexibleWindow: 'Weekdays 6–9 AM', contact: 'push', pushEnabled: true, color: '#2747D6', packages: [],
      constraints: ['knee'],
      notes: 'Prefers morning sessions. Runs on her own Saturdays. Responds well to clear weekly targets.',
      mods: [
        { exerciseId: 'mountain-climbers', kind: 'swap', swapToId: 'incline-climbers', detail: 'Hands on bench', reason: 'Wrist', savedAt: d(-9) },
        { exerciseId: 'rope-waves', kind: 'shorter', detail: '30 s instead of 40 s', reason: 'Shoulder', savedAt: d(-2) },
        { exerciseId: 'walking-lunge', kind: 'swap', swapToId: 'step-up', detail: 'Step-up, low box', reason: 'Knee', savedAt: d(-200) }
      ],
      away: { from: d(12), to: d(14), note: 'Traveling' },
      objectives: [
        { id: 'o-p1', title: 'Lose 15 lb', kind: 'bodyweight', unit: 'lb', start: 164, target: 149, lowerIsBetter: true, deadline: d(100),
          history: [164, 163, 162.5, 161, 160.5, 160, 159, 158].map((v, i) => ({ date: d(-49 + i * 7), value: v })) },
        { id: 'o-p2', title: 'Goblet squat 55 lb × 12', kind: 'lift', unit: 'lb', start: 25, target: 55, lowerIsBetter: false, exerciseId: 'goblet-squat', deadline: d(70), history: [] },
        { id: 'o-p3', title: '5K under 32:00', kind: 'time', unit: 'sec', start: 2200, target: 1920, lowerIsBetter: true, deadline: d(60),
          history: [{ date: d(-60), value: 2200 }, { date: d(-30), value: 2110 }, { date: d(-13), value: 2050 }] }
      ]
    },
    {
      id: 'c-daniel', name: 'Daniel Ortiz', age: 41, heightIn: 70, weightLb: 192, startWeightLb: 201,
      since: d(-120), frequency: 3, usualSlots: [{ dow: 1, time: '06:00' }, { dow: 3, time: '06:00' }, { dow: 5, time: '06:00' }],
      standing: true, flexibleWindow: 'Early mornings only', contact: 'push', pushEnabled: true, color: '#1E6B3A', packages: [],
      constraints: [], notes: 'Has to leave by 6:35 for work. Likes heavier kettlebell work.', mods: [],
      objectives: [
        { id: 'o-d1', title: 'Get to 185 lb', kind: 'bodyweight', unit: 'lb', start: 201, target: 185, lowerIsBetter: true, deadline: d(80),
          history: [201, 199, 198, 197, 195.5, 194, 193, 192].map((v, i) => ({ date: d(-49 + i * 7), value: v })) },
        { id: 'o-d2', title: 'KB deadlift 70 lb × 12', kind: 'lift', unit: 'lb', start: 35, target: 70, lowerIsBetter: false, exerciseId: 'kb-deadlift', deadline: d(90), history: [] }
      ]
    },
    {
      id: 'c-marcus', name: 'Marcus Lee', age: 29, heightIn: 69, weightLb: 176, startWeightLb: 176,
      since: d(-60), frequency: 2, usualSlots: [{ dow: 1, time: '12:15' }, { dow: 4, time: '12:15' }],
      standing: false, flexibleWindow: 'Lunchtime or after 5 PM', contact: 'app', pushEnabled: false, color: '#8A3608', packages: [],
      constraints: ['shoulder'], notes: 'Desk job, tight hips. Old shoulder strain — no overhead pressing.', mods: [],
      objectives: [
        { id: 'o-m1', title: 'Hold a 90 s plank', kind: 'custom', unit: 'sec', start: 30, target: 90, lowerIsBetter: false, deadline: d(45),
          history: [{ date: d(-56), value: 30 }, { date: d(-35), value: 45 }, { date: d(-14), value: 55 }] }
      ]
    },
    {
      id: 'c-elena', name: 'Elena Ruiz', age: 38, heightIn: 64, weightLb: 141, startWeightLb: 145,
      since: d(-90), frequency: 2, usualSlots: [{ dow: 2, time: '17:30' }, { dow: 4, time: '17:30' }],
      standing: false, flexibleWindow: 'Weekday evenings', contact: 'push', pushEnabled: true, color: '#7A2E8C', packages: [],
      constraints: ['wrist'], notes: 'Teacher — evenings only during school year.', mods: [
        { exerciseId: 'plank', kind: 'swap', swapToId: 'forearm-plank', detail: 'Forearms instead of hands', reason: 'Wrist', savedAt: d(-40) }
      ],
      objectives: [
        { id: 'o-e1', title: 'DB push press 25 lb × 10', kind: 'lift', unit: 'lb', start: 10, target: 25, lowerIsBetter: false, exerciseId: 'db-push-press', deadline: d(60), history: [] }
      ]
    },
    {
      id: 'c-leo', name: 'Leo Grant', age: 52, heightIn: 72, weightLb: 210, startWeightLb: 214,
      since: d(-45), frequency: 2, usualSlots: [{ dow: 1, time: '18:30' }, { dow: 3, time: '18:30' }],
      standing: false, flexibleWindow: 'Evenings', contact: 'app', pushEnabled: false, color: '#5B6470', packages: [],
      constraints: ['back'], notes: 'Lower-back history. Keep hinges light; no slams.', mods: [],
      objectives: [
        { id: 'o-l1', title: 'Get to 195 lb', kind: 'bodyweight', unit: 'lb', start: 214, target: 195, lowerIsBetter: true, deadline: d(150),
          history: [214, 213, 213, 212, 211.5, 210].map((v, i) => ({ date: d(-35 + i * 7), value: v })) }
      ]
    },
    {
      id: 'c-sam', name: 'Sam Kim', age: 26, heightIn: 67, weightLb: 160, startWeightLb: 160,
      since: d(-5), frequency: 1, usualSlots: [], standing: false, flexibleWindow: 'Any weekday noon or evening', contact: 'app', pushEnabled: false,
      color: '#0E6E70', packages: [], constraints: [], notes: 'On the waitlist for a regular slot.', mods: [], waitlist: true, objectives: []
    }
  ];

  // ----- Programs (generated by the same engine the builder uses) -----
  const programs: Program[] = clients
    .filter((c) => !c.waitlist)
    .map((c, ci) => {
      const daysN = Math.max(2, Math.min(3, c.frequency));
      const include = c.objectives.map((o) => o.exerciseId).filter(Boolean) as string[];
      return {
        id: `p-${c.id}`,
        clientId: c.id,
        name: 'Fat loss + strength',
        goal: 'Fat loss',
        format: 'circuit',
        daysPerWeek: c.frequency,
        sessionMin: 30,
        cardioMix: 40,
        equipment: FULL_KIT,
        block: 2,
        weeks: 6,
        start: d(-17),
        days: Array.from({ length: daysN }, (_, i) =>
          generateDay(
            { goal: 'Fat loss', cardioMix: 40, equipment: FULL_KIT, constraints: c.constraints, mods: c.mods, focus: FOCUS_ROTATION[i], seed: 100 + ci * 17 + i * 5, include: i === 0 ? include : [] },
            String.fromCharCode(65 + i),
            `${c.id}-d${i}`
          )
        )
      } as Program;
    });

  // ----- History: four weeks of logs on each client's usual days -----
  const logs: SessionLog[] = [];
  const bookings: Booking[] = [];
  for (const c of clients.filter((x) => !x.waitlist)) {
    const prog = programs.find((p) => p.clientId === c.id)!;
    const sessionDates: Date[] = [];
    for (let i = -28; i <= 0; i++) {
      const day = addDays(today, i);
      for (const s of c.usualSlots.filter((u) => u.dow === day.getDay())) {
        const t = atTime(day, s.time);
        if (t < addMinutes(now, -40)) sessionDates.push(t);
      }
    }
    sessionDates.forEach((t, k) => {
      const day = prog.days[k % prog.days.length];
      const missed =
        (c.id === 'c-priya' && k === sessionDates.length - 3) ||
        (c.id === 'c-marcus' && (k === sessionDates.length - 1 || k === sessionDates.length - 3));
      const booking: Booking = { id: uid('b'), clientId: c.id, start: t.toISOString(), durationMin: 30, status: missed ? 'cancelled' : 'done', source: c.standing ? 'standing' : 'invite' };
      bookings.push(booking);
      if (missed) {
        logs.push({ id: uid('l'), clientId: c.id, date: t.toISOString(), dayId: day.id, dayLabel: day.label, dayName: day.name, status: 'missed', missedReason: c.id === 'c-priya' ? 'Client sick' : 'No-show', durationMin: 0, setTimesSec: [], entries: [] });
        return;
      }
      const entries: LogEntry[] = [];
      const doneBefore = logs.filter((l) => l.clientId === c.id && l.status === 'done').length;
      day.circuits.forEach((circ) => {
        for (let round = 1; round <= circ.rounds; round++) {
          circ.items.forEach((p) => {
            const e = EX[p.exerciseId];
            let load = p.loadLb;
            if (load !== undefined && e?.loadStep) {
              // progress every other session; Priya's goblet squat stalls at 45
              const base = e.loadLb ?? load;
              // modest progression: one step every 4 sessions, at most two steps in four weeks
              load = base + e.loadStep * Math.min(2, Math.floor(doneBefore / 4));
              if (c.id === 'c-priya' && p.exerciseId === 'goblet-squat') load = Math.min(45, 25 + 5 * doneBefore);
              if (c.id === 'c-elena' && p.exerciseId === 'db-push-press') load = Math.min(20, 10 + 5 * Math.floor(doneBefore / 2));
            }
            entries.push({ exerciseId: p.exerciseId, circuit: circ.label, round, reps: p.reps, sec: p.sec, loadLb: load, mod: p.note?.includes('saved mod') ? p.note : undefined });
          });
        }
      });
      const rpe = c.id === 'c-priya' && doneBefore >= 4 ? Math.min(9, 7 + (doneBefore - 4)) : 7;
      const setTimesSec = [450, 470, 440, 465].map((x, i) => x + ((k * 7 + i * 13) % 40) - 15);
      logs.push({
        id: uid('l'), clientId: c.id, date: t.toISOString(), dayId: day.id, dayLabel: day.label, dayName: day.name, status: 'done',
        durationMin: Math.round(setTimesSec.reduce((a, b) => a + b, 0) / 60) + 1, rpe, setTimesSec, entries,
        note: k === sessionDates.length - 1 && c.id === 'c-priya' ? 'Felt strong, slept well.' : undefined
      });
    });
  }

  // lift objective history from logs
  for (const c of clients) {
    for (const o of c.objectives) {
      if (o.kind !== 'lift' || !o.exerciseId) continue;
      o.history = logs
        .filter((l) => l.clientId === c.id && l.status === 'done')
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => {
          const e = l.entries.find((x) => x.exerciseId === o.exerciseId && x.round === 1);
          return e?.loadLb !== undefined ? { date: l.date, value: e.loadLb } : null;
        })
        .filter(Boolean) as { date: string; value: number }[];
    }
  }

  // ----- Session packages: sized so each client has a realistic balance -----
  const wantLeft: Record<string, number> = { 'c-priya': 8, 'c-daniel': 11, 'c-marcus': 4, 'c-elena': 1, 'c-leo': 2 };
  const PRICE = 60;
  for (const c of clients) {
    if (c.waitlist) {
      c.packages = [{ id: uid('pk'), date: d(-5), sessions: 5, price: 5 * 65, note: 'Intro 5-pack' }];
      continue;
    }
    const done = logs.filter((l) => l.clientId === c.id && l.status === 'done').length;
    const total = done + (wantLeft[c.id] ?? 5);
    const first = total - 10;
    c.packages =
      first >= 4
        ? [
            { id: uid('pk'), date: c.since, sessions: first, price: first * PRICE, note: `${first}-session pack` },
            { id: uid('pk'), date: d(-16), sessions: 10, price: 10 * PRICE, note: '10-session pack' }
          ]
        : [{ id: uid('pk'), date: c.since, sessions: total, price: total * PRICE, note: `${total}-session pack` }];
  }

  // ----- Busy blocks from other jobs -----
  const busy: BusyBlock[] = [];
  for (let i = -28; i <= 21; i++) {
    const day = addDays(today, i);
    const dow = day.getDay();
    if (dow === 1 || dow === 3 || dow === 5)
      busy.push({ id: uid('x'), start: atTime(day, '09:00').toISOString(), end: atTime(day, '13:00').toISOString(), label: 'Other job', source: 'Google Calendar' });
    if (dow === 2 || dow === 4)
      busy.push({ id: uid('x'), start: atTime(day, '14:00').toISOString(), end: atTime(day, '17:00').toISOString(), label: 'YMCA front desk', source: 'YMCA shifts' });
  }

  // ----- Today's remaining sessions (confirmed) -----
  for (const c of clients.filter((x) => !x.waitlist)) {
    for (const s of c.usualSlots.filter((u) => u.dow === today.getDay())) {
      const t = atTime(today, s.time);
      if (t >= addMinutes(now, -40)) bookings.push({ id: uid('b'), clientId: c.id, start: t.toISOString(), durationMin: 30, status: 'confirmed', source: c.standing ? 'standing' : 'invite' });
    }
  }

  // ----- Upcoming days: run the real auto-planner, then play a few client replies -----
  let state: SeedState = { clients, programs, logs, bookings, busy, availability: DEFAULT_AVAILABILITY, settings: DEFAULT_SETTINGS, messages: [] };
  const sentAt = addMinutes(now, -95);
  const plan = autoPlan(state, sentAt, 5);
  state = { ...state, bookings: [...state.bookings, ...plan.bookings], messages: [...plan.messages] };

  const replyAt = addMinutes(now, -60);
  const applyAccept = (clientId: string, pickIndex = 0) => {
    const b = state.bookings.find((x) => x.clientId === clientId && x.status === 'awaiting');
    if (!b) return;
    const choice = b.offered?.[pickIndex] ?? b.start;
    const r = acceptTime(state, clientId, choice, replyAt, b.id);
    if (r.ok) state = { ...state, bookings: state.bookings.map((x) => (x.id === b.id ? r.booking : x)), messages: [...state.messages, ...r.messages] };
  };
  applyAccept('c-priya');
  applyAccept('c-leo');
  // Marcus says no to what was offered first, then accepts the second offer
  const mb = state.bookings.find((x) => x.clientId === 'c-marcus' && x.status === 'awaiting');
  if (mb) {
    const r = declineTime(state, mb.id, "Can't make that one this week.", addMinutes(now, -80));
    state = { ...state, bookings: state.bookings.map((x) => (x.id === mb.id ? r.booking : x)), messages: [...state.messages, ...r.messages] };
    applyAccept('c-marcus', 1);
  }

  // Priya's travel request (needs the trainer)
  const priya = clients[0];
  let awayDay = new Date(priya.away!.from);
  for (let i = 0; i < 7; i++) {
    const cand = addDays(new Date(priya.away!.from), i);
    if (priya.usualSlots.some((u) => u.dow === cand.getDay())) {
      awayDay = cand;
      break;
    }
  }
  const awaySlot = priya.usualSlots.find((u) => u.dow === awayDay.getDay()) ?? priya.usualSlots[0];
  const travelMsg: Message = { id: uid('m'), clientId: priya.id, at: addMinutes(now, -30).toISOString(), dir: 'in', channel: 'app', body: `I'm traveling ${awayDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${new Date(priya.away!.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Can we move that session?` };
  state.bookings.push({ id: uid('b'), clientId: priya.id, start: atTime(awayDay, awaySlot.time).toISOString(), durationMin: 30, status: 'needs-you', source: 'client', note: 'Client away · asked to move' });
  travelMsg.bookingId = state.bookings[state.bookings.length - 1].id;
  state.messages.push(travelMsg);

  state.messages.sort((a, b) => a.at.localeCompare(b.at));
  return state;
}

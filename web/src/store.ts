import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  ActiveSession, Automation, Availability, Booking, BusyBlock, Circuit, Client, ExerciseMod, LogEntry, Message, Program, ProgramDay, SessionLog, Settings, WeekPlan
} from './types';
import { buildSeed, DEFAULT_SETTINGS } from './data/seed';
import { apiMode } from './api';
import { EX, exName } from './data/exercises';
import { applyMods } from './engine/generator';
import { lastLoads, nextDay, planNextWeek } from './engine/planner';
import { autoPlan, declineTime, dueReminders, msg, nearestSlots, openSlots, type SchedState } from './engine/scheduler';
import { addDays, fmtDay, fmtTime, sameDay, startOfDay, startOfWeek, uid } from './lib/dates';
import { sessionBalance } from './lib/balance';
import * as ev from './engine/events';

// Storage that never throws (private mode, blocked storage, sandboxed previews)
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    memory.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      /* memory only */
    }
  },
  removeItem: (k) => {
    memory.delete(k);
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
};

export interface Toast {
  id: string;
  text: string;
}

interface Data {
  clients: Client[];
  programs: Program[];
  logs: SessionLog[];
  bookings: Booking[];
  busy: BusyBlock[];
  availability: Availability;
  settings: Settings;
  messages: Message[];
  plans: Record<string, WeekPlan>;
  active: ActiveSession | null;
  reminded: string[];
  seededAt: string;
  // filled by the Python API (absent in the offline demo)
  role?: 'trainer' | 'client';
  me?: string | null;
  openSlots?: Record<string, string[]>;
  suggestions?: Record<string, string[]>;
  loaded: boolean;
  authNeeded: boolean;
  apiError?: string;
}

interface Actions {
  reset: () => void;
  toast: (text: string) => void;
  dismissToast: (id: string) => void;
  // clients
  upsertClient: (c: Client) => void;
  saveMod: (clientId: string, mod: ExerciseMod) => void;
  removeMod: (clientId: string, exerciseId: string) => void;
  addMeasurement: (clientId: string, objectiveId: string, value: number) => void;
  addPackage: (clientId: string, sessions: number, price?: number, note?: string) => void;
  removePackage: (clientId: string, packageId: string) => void;
  // programs
  saveProgram: (p: Program) => void;
  // live session
  startSession: (clientId: string, bookingId?: string) => void;
  stepSession: (delta: number) => void;
  adjustCurrent: (field: 'loadLb' | 'reps' | 'sec', delta: number) => void;
  modifyCurrent: (m: { kind: ExerciseMod['kind']; reason: string; detail: string; swapToId?: string; remember: boolean }) => void;
  finishSession: (rpe: number, note: string) => string | null;
  discardSession: () => void;
  markMissed: (bookingId: string, reason: string) => void;
  // planning
  buildPlan: (clientId: string) => WeekPlan | null;
  approvePlan: (clientId: string) => void;
  // scheduling
  runAutoPlan: () => number;
  planAndRemind: () => Promise<{ invites: number; reminders: number }>;
  clientAccept: (clientId: string, startISO: string, bookingId?: string) => Promise<{ ok: boolean; reason?: string }>;
  clientDecline: (bookingId: string, text: string) => void;
  trainerOffer: (bookingId: string, startISO: string) => void;
  trainerSkip: (bookingId: string) => void;
  offerOpenSlot: (clientId: string, startISO: string) => void;
  cancelBooking: (bookingId: string, byClient?: boolean) => void;
  blockTime: (startISO: string, endISO: string, label: string) => Promise<string>;
  unblockTime: (blockId: string) => Promise<string>;
  setUsualSlot: (clientId: string, dow: number, time: string) => void;
  signOut: () => void;
  simulateReplies: () => Promise<number>;
  sendReminders: () => number;
  setAvailability: (a: Availability) => void;
  setAutomation: (patch: Partial<Automation>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setPush: (clientId: string, enabled: boolean, subscription?: unknown) => void;
  load: () => Promise<void>;
  addClientMessage: (clientId: string, body: string) => void;
}

export type AppState = Data & Actions & { toasts: Toast[] };

const seedData = (): Data => {
  const s = buildSeed(new Date());
  return {
    clients: s.clients,
    programs: s.programs,
    logs: s.logs,
    bookings: s.bookings,
    busy: s.busy,
    availability: s.availability,
    settings: s.settings,
    messages: s.messages,
    plans: {},
    active: null,
    reminded: [],
    seededAt: new Date().toISOString(),
    loaded: true,
    authNeeded: false
  };
};

const emptyData = (): Data => ({
  clients: [], programs: [], logs: [], bookings: [], busy: [], availability: {}, settings: { ...DEFAULT_SETTINGS }, messages: [], plans: {},
  active: null, reminded: [], seededAt: '', loaded: false, authNeeded: false
});

const sched = (s: Data): SchedState => ({
  clients: s.clients,
  bookings: s.bookings,
  busy: s.busy,
  availability: s.availability,
  settings: s.settings,
  messages: s.messages
});

/** The program day to run for a client on a given date: approved weekly plan first, then rotation. */
export function dayToRun(s: Data, clientId: string, date = new Date()): ProgramDay | null {
  const program = s.programs.find((p) => p.clientId === clientId);
  if (!program) return null;
  const plan = s.plans[clientId];
  if (plan?.approved) {
    const d = plan.days.find((x) => sameDay(new Date(x.date), date));
    if (d) return d;
  }
  return nextDay(program, s.logs.filter((l) => l.clientId === clientId));
}

const totalSteps = (circuits: Circuit[]) => circuits.reduce((n, c) => n + c.items.length * c.rounds, 0);

/** Map a step index to circuit / round / item. */
export function stepInfo(a: ActiveSession) {
  let i = a.step;
  let setIndex = 0;
  for (let ci = 0; ci < a.circuits.length; ci++) {
    const c = a.circuits[ci];
    for (let r = 0; r < c.rounds; r++) {
      if (i < c.items.length) return { ci, round: r + 1, item: i, setIndex, circuit: c };
      i -= c.items.length;
      setIndex++;
    }
  }
  const c = a.circuits[a.circuits.length - 1];
  return { ci: a.circuits.length - 1, round: c.rounds, item: c.items.length - 1, setIndex: setIndex - 1, circuit: c };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const applyOutcome = (out: ev.Outcome) =>
        set((st) => {
          const ids = new Set(out.bookings.map((b) => b.id));
          return { bookings: [...st.bookings.filter((b) => !ids.has(b.id)), ...out.bookings], messages: [...st.messages, ...out.messages] };
        });
      return {
      ...(apiMode ? emptyData() : seedData()),
      toasts: [],

      load: async () => {},
      reset: () => set({ ...seedData(), toasts: [] }),
      toast: (text) => {
        const id = uid('t');
        set((s) => ({ toasts: [...s.toasts, { id, text }] }));
        setTimeout(() => get().dismissToast(id), 3200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      upsertClient: (c) =>
        set((s) => {
          const exists = s.clients.some((x) => x.id === c.id);
          return { clients: exists ? s.clients.map((x) => (x.id === c.id ? c : x)) : [...s.clients, c] };
        }),

      saveMod: (clientId, mod) =>
        set((s) => ({
          clients: s.clients.map((c) => (c.id === clientId ? { ...c, mods: [...c.mods.filter((m) => m.exerciseId !== mod.exerciseId), mod] } : c))
        })),
      removeMod: (clientId, exerciseId) =>
        set((s) => ({ clients: s.clients.map((c) => (c.id === clientId ? { ...c, mods: c.mods.filter((m) => m.exerciseId !== exerciseId) } : c)) })),

      addPackage: (clientId, sessions, price, note) => {
        if (!(sessions > 0)) return;
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id === clientId
              ? { ...c, packages: [...(c.packages ?? []), { id: uid('pk'), date: new Date().toISOString(), sessions, price, note: note || `${sessions}-session pack` }] }
              : c
          )
        }));
        const b = sessionBalance(get(), clientId);
        // Event: renewal confirms bookings held for lack of sessions
        const out = ev.renewed(sched(get()), clientId, b.pending - b.booked);
        if (out.bookings.length) applyOutcome(out);
        get().toast(`Added ${sessions} sessions · ${b.owes ? `still owes ${b.owes}` : `${b.pending} pending`}`);
      },
      removePackage: (clientId, packageId) =>
        set((s) => ({ clients: s.clients.map((c) => (c.id === clientId ? { ...c, packages: (c.packages ?? []).filter((p) => p.id !== packageId) } : c)) })),

      addMeasurement: (clientId, objectiveId, value) =>
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id !== clientId
              ? c
              : {
                  ...c,
                  weightLb: c.objectives.find((o) => o.id === objectiveId)?.kind === 'bodyweight' ? value : c.weightLb,
                  objectives: c.objectives.map((o) => (o.id === objectiveId ? { ...o, history: [...o.history, { date: new Date().toISOString(), value }] } : o))
                }
          )
        })),

      saveProgram: (p) =>
        set((s) => {
          const plans = { ...s.plans };
          delete plans[p.clientId];
          return { programs: [...s.programs.filter((x) => x.clientId !== p.clientId), p], plans };
        }),

      // ---------- Live session ----------
      startSession: (clientId, bookingId) => {
        const s = get();
        const client = s.clients.find((c) => c.id === clientId);
        const day = dayToRun(s, clientId);
        if (!client || !day) return;
        const loads = lastLoads(s.logs.filter((l) => l.clientId === clientId));
        const circuits: Circuit[] = day.circuits.map((c) => ({
          ...c,
          items: c.items.map((p) => {
            const withMods = p.note?.includes('saved mod') ? p : applyMods(p, client.mods, client.constraints);
            const load = withMods.changed ? withMods.loadLb : loads[withMods.exerciseId] ?? withMods.loadLb;
            return { ...withMods, loadLb: load };
          })
        }));
        const now = Date.now();
        set({ active: { clientId, bookingId, dayId: day.id, startedAt: now, setStartedAt: now, step: 0, setTimes: [], circuits, entries: [], todayMods: {} } });
      },

      stepSession: (delta) =>
        set((s) => {
          const a = s.active;
          if (!a) return {};
          const total = totalSteps(a.circuits);
          const info = stepInfo(a);
          const p = info.circuit.items[info.item];
          let entries = a.entries;
          let setTimes = a.setTimes;
          let setStartedAt = a.setStartedAt;
          if (delta > 0) {
            const entry: LogEntry = { exerciseId: p.exerciseId, circuit: info.circuit.label, round: info.round, reps: p.reps, sec: p.sec, loadLb: p.loadLb, mod: a.todayMods[p.exerciseId] ?? (p.note?.includes('saved mod') ? p.note : undefined) };
            entries = [...entries.filter((e) => !(e.exerciseId === entry.exerciseId && e.round === entry.round && e.circuit === entry.circuit)), entry];
            if (info.item === info.circuit.items.length - 1) {
              setTimes = [...setTimes, Math.round((Date.now() - a.setStartedAt) / 1000)];
              setStartedAt = Date.now();
            }
          }
          const step = Math.min(total - 1, Math.max(0, a.step + delta));
          return { active: { ...a, step, entries, setTimes, setStartedAt } };
        }),

      adjustCurrent: (field, delta) =>
        set((s) => {
          const a = s.active;
          if (!a) return {};
          const info = stepInfo(a);
          const circuits = a.circuits.map((c, ci) =>
            ci !== info.ci
              ? c
              : { ...c, items: c.items.map((p, ii) => (ii !== info.item ? p : { ...p, [field]: Math.max(0, (p[field] ?? 0) + delta) })) }
          );
          return { active: { ...a, circuits } };
        }),

      modifyCurrent: ({ kind, reason, detail, swapToId, remember }) => {
        const s = get();
        const a = s.active;
        if (!a) return;
        const info = stepInfo(a);
        const p = info.circuit.items[info.item];
        const original = p.exerciseId;
        const mod: ExerciseMod = { exerciseId: original, kind, swapToId, detail, reason, savedAt: new Date().toISOString() };
        // apply to every remaining occurrence in this session
        const replaced = applyMods({ ...p, note: undefined }, [mod]);
        const label = `${remember ? 'Saved' : 'Today only'}: ${detail || kind} · ${reason.toLowerCase()}`;
        const circuits = a.circuits.map((c) => ({
          ...c,
          items: c.items.map((x) => (x.exerciseId === original ? { ...replaced, note: label } : x))
        }));
        set({ active: { ...a, circuits, todayMods: { ...a.todayMods, [replaced.exerciseId]: label } } });
        if (remember) get().saveMod(a.clientId, mod);
        get().toast(remember ? `Saved for next time: ${exName(original)}` : 'Changed for today only');
      },

      finishSession: (rpe, note) => {
        const s = get();
        const a = s.active;
        if (!a) return null;
        const log = buildLog(s, a, rpe, note);
        const entries = log.entries;
        // lift objectives pick up the new load
        const clients = s.clients.map((c) => {
          if (c.id !== a.clientId) return c;
          return {
            ...c,
            objectives: c.objectives.map((o) => {
              if (o.kind !== 'lift' || !o.exerciseId) return o;
              const e = entries.find((x) => (x.exerciseId === o.exerciseId || EX[o.exerciseId!]?.tempoVariant === x.exerciseId) && x.round === 1);
              return e?.loadLb !== undefined && e.exerciseId === o.exerciseId ? { ...o, history: [...o.history, { date: log.date, value: e.loadLb }] } : o;
            })
          };
        });
        set({
          logs: [...s.logs, log],
          clients,
          active: null,
          bookings: s.bookings.map((b) => (b.id === a.bookingId ? { ...b, status: 'done' } : b))
        });
        const bal = sessionBalance(get(), a.clientId);
        const who = get().clients.find((c) => c.id === a.clientId);
        if (bal.hasPackages && who) set((st) => ({ messages: [...st.messages, ...ev.lowBalanceNotice(who, bal.pending)] }));
        get().toast(!bal.hasPackages ? 'Session logged' : bal.owes ? `Session logged · owes ${bal.owes}` : `Session logged · ${bal.pending} left`);
        return log.id;
      },

      discardSession: () => set({ active: null }),

      markMissed: (bookingId, reason) => {
        const s = get();
        const b = s.bookings.find((x) => x.id === bookingId);
        if (!b || !b.clientId) return;
        const program = s.programs.find((p) => p.clientId === b.clientId);
        const day = program ? nextDay(program, s.logs.filter((l) => l.clientId === b.clientId)) : null;
        set({
          bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'cancelled' } : x)),
          logs: [...s.logs, { id: uid('l'), clientId: b.clientId, date: b.start, dayId: day?.id, dayLabel: day?.label ?? '-', dayName: day?.name ?? 'Session', status: 'missed', missedReason: reason, durationMin: 0, setTimesSec: [], entries: [] }]
        });
      },

      // ---------- Planning ----------
      buildPlan: (clientId) => {
        const s = get();
        const client = s.clients.find((c) => c.id === clientId);
        const program = s.programs.find((p) => p.clientId === clientId);
        if (!client || !program) return null;
        const existing = s.plans[clientId];
        const weekStart = addDays(startOfWeek(new Date()), 7).toISOString();
        if (existing && existing.weekStart === weekStart) return existing;
        const plan = planNextWeek(client, program, s.logs, new Date());
        set({ plans: { ...s.plans, [clientId]: plan } });
        return plan;
      },
      approvePlan: (clientId) => {
        const s = get();
        const plan = s.plans[clientId];
        const client = s.clients.find((c) => c.id === clientId);
        if (!plan || !client) return;
        const first = plan.days[0];
        const m = msg(client, `Your plan for next week is ready: ${plan.days.length} sessions${first ? `, starting ${fmtDay(first.date)}` : ''}. See you there!`, new Date());
        set({ plans: { ...s.plans, [clientId]: { ...plan, approved: true, approvedAt: new Date().toISOString() } }, messages: [...s.messages, m] });
        get().toast(`Plan approved and sent to ${client.name.split(' ')[0]}`);
      },

      // ---------- Scheduling ----------
      runAutoPlan: () => {
        const s = get();
        const r = autoPlan(sched(s), new Date(), s.settings.inviteDaysAhead);
        set({ bookings: [...s.bookings, ...r.bookings], messages: [...s.messages, ...r.messages] });
        return r.bookings.length;
      },
      planAndRemind: async () => {
        const invites = get().runAutoPlan();
        const reminders = get().sendReminders();
        return { invites, reminders };
      },
      clientAccept: async (clientId, startISO, bookingId) => {
        const s = get();
        const bal = sessionBalance(s, clientId);
        const r = ev.clientBooks(sched(s), clientId, startISO, new Date(), bookingId, bal.hasPackages ? bal.pending - bal.booked : 1, s.role === 'client');
        if (!r.ok) return { ok: false, reason: r.reason };
        const bookings = r.replaced ? s.bookings.map((b) => (b.id === r.replaced ? r.booking : b)) : [...s.bookings, r.booking];
        set({ bookings: [...bookings, ...r.extra.bookings], messages: [...s.messages, ...r.messages, ...r.extra.messages] });
        return { ok: true };
      },
      clientDecline: (bookingId, text) => {
        const s = get();
        const r = declineTime(sched(s), bookingId, text, new Date());
        set({ bookings: s.bookings.map((b) => (b.id === bookingId ? r.booking : b)), messages: [...s.messages, ...r.messages] });
      },
      trainerOffer: (bookingId, startISO) => {
        const s = get();
        const b = s.bookings.find((x) => x.id === bookingId);
        const c = s.clients.find((x) => x.id === b?.clientId);
        if (!b || !c) return;
        const t = new Date(startISO);
        const m = msg(c, `${s.settings.trainerName} can do ${fmtDay(t)} at ${fmtTime(t)} instead. Tap to confirm.`, new Date(), { bookingId, options: [startISO] });
        set({
          bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'awaiting', start: startISO, offered: [startISO], note: 'You offered a new time' } : x)),
          messages: [...s.messages, m]
        });
        get().toast(`Offer sent to ${c.name.split(' ')[0]}`);
      },
      trainerSkip: (bookingId) => {
        const s = get();
        const b = s.bookings.find((x) => x.id === bookingId);
        const c = s.clients.find((x) => x.id === b?.clientId);
        if (!b || !c) return;
        const m = msg(c, `No problem, we'll skip ${fmtDay(b.start)}. Safe travels!`, new Date(), { bookingId });
        set({ bookings: s.bookings.map((x) => (x.id === bookingId ? { ...x, status: 'cancelled', note: 'Skipped' } : x)), messages: [...s.messages, m] });
        get().toast('Session skipped and client told');
      },
      offerOpenSlot: (clientId, startISO) => {
        const s = get();
        const c = s.clients.find((x) => x.id === clientId);
        if (!c) return;
        const t = new Date(startISO);
        const b: Booking = { id: uid('b'), clientId, start: startISO, durationMin: s.settings.sessionMin, status: 'awaiting', source: 'manual', offered: [startISO], note: 'You offered this slot' };
        const m = msg(c, `A spot is open ${fmtDay(t)} at ${fmtTime(t)}. Tap to book it.`, new Date(), { bookingId: b.id, options: [startISO] });
        set({ bookings: [...s.bookings, b], messages: [...s.messages, m] });
        get().toast(`Offered to ${c.name.split(' ')[0]}`);
      },
      cancelBooking: (bookingId, byClient = false) => {
        const s = get();
        const b = s.bookings.find((x) => x.id === bookingId);
        if (!b) return;
        const out = ev.cancelSession(sched(s), b, new Date(), byClient);
        applyOutcome(out);
        get().toast(out.summary);
      },
      blockTime: async (startISO, endISO, label) => {
        const r = ev.blockTime(sched(get()), new Date(startISO), new Date(endISO), label);
        set((st) => ({ busy: [...st.busy, r.block] }));
        applyOutcome(r.out);
        return r.out.summary;
      },
      unblockTime: async (blockId) => {
        const s = get();
        const blk = s.busy.find((x) => x.id === blockId);
        if (!blk) return 'Not found';
        const out = ev.unblockTime(sched(s), blk);
        set({ busy: s.busy.filter((x) => x.id !== blockId) });
        applyOutcome(out);
        return out.summary;
      },
      setUsualSlot: (clientId, dow, time) =>
        set((s) => ({ clients: s.clients.map((c) => (c.id === clientId ? { ...c, usualSlots: [...c.usualSlots.filter((u) => u.dow !== dow), { dow, time }] } : c)) })),
      signOut: () => {},
      simulateReplies: async () => {
        const s = get();
        let n = 0;
        const awaiting = s.bookings.filter((b) => b.status === 'awaiting' && b.clientId && new Date(b.start) > new Date());
        awaiting.forEach((b, i) => {
          const cur = get();
          const choice = b.offered?.[0] ?? b.start;
          if (i % 3 === 2) {
            cur.clientDecline(b.id, 'That time doesn’t work for me this week.');
          } else {
            void cur.clientAccept(b.clientId!, choice, b.id);
          }
          n++;
        });
        return n;
      },
      sendReminders: () => {
        const s = get();
        const due = dueReminders(sched(s), new Date()).filter((b) => !s.reminded.includes(b.id));
        const msgs = due
          .map((b) => {
            const c = s.clients.find((x) => x.id === b.clientId);
            return c ? msg(c, `Reminder: session ${sameDay(new Date(b.start), new Date()) ? 'today' : fmtDay(b.start)} at ${fmtTime(b.start)}. Need to change it? Tap here.`, new Date(), { bookingId: b.id }) : null;
          })
          .filter(Boolean) as Message[];
        set({ messages: [...s.messages, ...msgs], reminded: [...s.reminded, ...due.map((b) => b.id)] });
        return msgs.length;
      },
      setAvailability: (a) => {
        set({ availability: a });
        const out = ev.resolveConflicts(sched(get()));
        if (out.bookings.length) {
          applyOutcome(out);
          get().toast(out.summary);
        }
      },
      setAutomation: (patch) => set((s) => ({ settings: { ...s.settings, automation: { ...s.settings.automation, ...patch } } })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setPush: (clientId, enabled) => set((s) => ({ clients: s.clients.map((c) => (c.id === clientId ? { ...c, pushEnabled: enabled, contact: enabled ? 'push' : 'app' } : c)) })),
      addClientMessage: (clientId, body) => {
        const s = get();
        const m: Message = { id: uid('m'), clientId, at: new Date().toISOString(), dir: 'in', channel: 'app', body };
        set({ messages: [...s.messages, m] });
      }
    };
    },
    {
      name: apiMode ? 'fitnessai-live-v1' : 'fitnessai-v1',
      version: 2,
      // Older saved demo data has no session packages: start fresh from the sample data.
      migrate: () => seedData() as unknown as AppState,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => {
        if (apiMode) return { active: s.active } as Partial<AppState>;
        const { toasts: _t, ...rest } = s;
        void _t;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as Partial<AppState>;
      }
    }
  )
);

function totalSetCount(circuits: Circuit[]) {
  return circuits.reduce((n, c) => n + c.rounds, 0);
}

// ---------- selectors ----------
export const todayBookings = (s: Data, day = new Date()) =>
  s.bookings
    .filter((b) => b.clientId && sameDay(new Date(b.start), day) && b.status !== 'cancelled' && b.status !== 'open')
    .sort((a, b) => a.start.localeCompare(b.start));

export const upcoming = (s: Data, days: number) => {
  const from = startOfDay(new Date());
  const to = addDays(from, days + 1);
  return s.bookings.filter((b) => new Date(b.start) >= from && new Date(b.start) < to && b.status !== 'cancelled');
};

/** Build the session log for the running session (shared by demo and API modes). */
export function buildLog(s: Data, a: ActiveSession, rpe: number, note: string): SessionLog {
  const program = s.programs.find((p) => p.clientId === a.clientId);
  const day = program?.days.find((d) => d.id === a.dayId) ?? s.plans[a.clientId]?.days.find((d) => d.id === a.dayId);
  const info = stepInfo(a);
  const p = info.circuit.items[info.item];
  const entries = [
    ...a.entries.filter((e) => !(e.exerciseId === p.exerciseId && e.round === info.round && e.circuit === info.circuit.label)),
    { exerciseId: p.exerciseId, circuit: info.circuit.label, round: info.round, reps: p.reps, sec: p.sec, loadLb: p.loadLb, mod: a.todayMods[p.exerciseId] }
  ];
  const setTimes = [...a.setTimes];
  if (setTimes.length < totalSetCount(a.circuits)) setTimes.push(Math.round((Date.now() - a.setStartedAt) / 1000));
  return {
    id: uid('l'),
    clientId: a.clientId,
    date: new Date(a.startedAt).toISOString(),
    dayId: a.dayId,
    dayLabel: day?.label ?? 'A',
    dayName: day?.name ?? 'Session',
    status: 'done',
    durationMin: Math.max(1, Math.round((Date.now() - a.startedAt) / 60000)),
    rpe,
    setTimesSec: setTimes,
    entries,
    note: note || undefined
  };
}

const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Open start times on a day: from the server when connected, computed on the device in the demo. */
export function slotsFor(s: Data, day: Date, ignoreBookingId?: string): Date[] {
  if (apiMode) return (s.openSlots?.[localKey(day)] ?? []).map((x) => new Date(x));
  return openSlots(sched(s), day, new Date(), ignoreBookingId);
}

/** Times to offer for a request that needs the trainer. */
export function suggestionsFor(s: Data, b: Booking, c: Client): Date[] {
  if (apiMode) return (s.suggestions?.[b.id] ?? []).map((x) => new Date(x));
  const st = sched(s);
  const start = new Date(b.start);
  const usual = c.usualSlots[0]?.time ?? '07:30';
  const at = (d: Date, t: string) => {
    const x = new Date(d);
    const [h, m] = t.split(':').map(Number);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const base = c.away && new Date(c.away.to) >= start ? at(addDays(new Date(c.away.to), 1), usual) : start;
  const before = c.away && new Date(c.away.from) > new Date() ? nearestSlots(st, at(addDays(new Date(c.away.from), -1), usual), 1, new Date(), 0, b.id) : [];
  const all = [...before, ...nearestSlots(st, base, 2, new Date(), 2, b.id)];
  return all.filter((t, i) => all.findIndex((x) => x.getTime() === t.getTime()) === i).slice(0, 3);
}

export type { Data };

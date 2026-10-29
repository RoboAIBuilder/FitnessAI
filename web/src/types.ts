// ---------- Exercise library ----------
export type ExType = 'cardio' | 'strength' | 'core';
export type Equip = 'ropes' | 'dumbbells' | 'kettlebell' | 'stability-ball' | 'med-ball' | 'bodyweight' | 'box' | 'machines';
export type Pattern = 'squat' | 'hinge' | 'lunge' | 'push' | 'pull' | 'carry' | 'conditioning' | 'core';
export type Constraint = 'knee' | 'shoulder' | 'back' | 'wrist';

export interface Exercise {
  id: string;
  name: string;
  type: ExType;
  pattern: Pattern;
  equipment: Equip[];
  measure: 'reps' | 'time';
  reps?: number;
  sec?: number;
  loadLb?: number; // starting load if loaded
  loadStep?: number;
  perSide?: boolean;
  avoidFor: Constraint[];
  focus: ('lower' | 'upper' | 'full')[];
  tempoVariant?: string; // id of a slower/tempo variant used to break stalls
}

// ---------- Clients ----------
export type ModKind = 'swap' | 'easier' | 'lighter' | 'shorter' | 'skip';

export interface ExerciseMod {
  exerciseId: string;
  kind: ModKind;
  swapToId?: string;
  detail: string;
  reason: string;
  savedAt: string; // ISO date
}

export interface Objective {
  id: string;
  title: string;
  kind: 'bodyweight' | 'lift' | 'time' | 'custom';
  unit: string; // lb, sec, reps
  start: number;
  target: number;
  lowerIsBetter: boolean;
  exerciseId?: string; // for lift objectives
  deadline: string; // ISO date
  history: { date: string; value: number }[];
}

export interface UsualSlot {
  dow: number; // 0 Sun..6 Sat
  time: string; // HH:MM
}

export interface Client {
  id: string;
  name: string;
  age?: number;
  heightIn: number;
  weightLb: number;
  startWeightLb: number;
  bodyFatPct?: number;
  since: string;
  frequency: number;
  usualSlots: UsualSlot[];
  standing: boolean; // auto-confirm usual slots
  flexibleWindow: string; // free text, e.g. "Weekdays 6–9 AM"
  contact: 'push' | 'app' | 'text';
  pushEnabled: boolean;
  phone?: string;
  email?: string;
  accessCode?: string; // sign-in code; defaults to first name, lowercase
  objectives: Objective[];
  constraints: Constraint[];
  notes: string;
  mods: ExerciseMod[];
  away?: { from: string; to: string; note: string };
  waitlist?: boolean;
  color: string;
  packages: SessionPackage[];
  priorDone?: number; // sessions completed before using the app
}

export interface SessionPackage {
  id: string;
  date: string; // ISO purchase date
  sessions: number;
  price?: number; // USD, optional
  note?: string;
}

// ---------- Programs ----------
export interface Prescription {
  exerciseId: string;
  reps?: number;
  sec?: number;
  loadLb?: number;
  note?: string; // e.g. "saved mod: hands on bench (wrist)"
  changed?: string; // next-week change reason
}

export interface Circuit {
  label: 'A' | 'B';
  rounds: number;
  items: Prescription[];
}

export interface ProgramDay {
  id: string;
  label: string; // A / B / C
  name: string; // "Lower + ropes"
  focus: 'lower' | 'upper' | 'full';
  circuits: Circuit[];
}

export type Goal = 'Fat loss' | 'Strength' | 'Muscle' | 'Endurance' | 'Mobility';
export type Format = 'circuit' | 'straight' | 'intervals';

export interface Program {
  id: string;
  clientId: string;
  name: string;
  goal: Goal;
  format: Format;
  daysPerWeek: number;
  sessionMin: number;
  cardioMix: number; // 0..100
  equipment: Equip[];
  block: number;
  weeks: number;
  start: string;
  days: ProgramDay[];
}

// ---------- Logs ----------
export interface LogEntry {
  exerciseId: string;
  circuit: 'A' | 'B';
  round: number;
  reps?: number;
  sec?: number;
  loadLb?: number;
  mod?: string;
}

export interface SessionLog {
  id: string;
  clientId: string;
  date: string; // ISO datetime
  dayId?: string;
  dayLabel: string;
  dayName: string;
  status: 'done' | 'missed';
  missedReason?: string;
  durationMin: number;
  rpe?: number;
  setTimesSec: number[];
  entries: LogEntry[];
  note?: string;
}

// ---------- Scheduling ----------
export type BookingStatus = 'confirmed' | 'awaiting' | 'needs-you' | 'open' | 'cancelled' | 'done';

export interface Booking {
  id: string;
  clientId: string | null;
  start: string; // ISO datetime
  durationMin: number;
  status: BookingStatus;
  source: 'standing' | 'invite' | 'client' | 'waitlist' | 'manual';
  note?: string;
  offered?: string[]; // ISO starts offered to client
}

export interface BusyBlock {
  id: string;
  start: string;
  end: string;
  label: string;
  source: string; // 'Google Calendar' | 'YMCA shifts' | 'Manual' (blocked in FitnessAI)
}

export type Availability = Record<number, { start: string; end: string }[]>; // dow -> windows

export interface Automation {
  inviteAhead: boolean;
  autoConfirmStanding: boolean;
  reminder: boolean;
  offerAlternatives: boolean;
  waitlist: boolean;
  askFirst: boolean;
}

export interface Settings {
  trainerName: string;
  sessionMin: number;
  bufferMin: number;
  bookAheadDays: number;
  minNoticeH: number;
  inviteDaysAhead: number;
  reminderHours: number;
  automation: Automation;
  calendars: { name: BusyBlock['source']; synced: boolean }[];
}

export interface Message {
  id: string;
  clientId: string;
  at: string;
  dir: 'out' | 'in';
  channel: 'push' | 'text' | 'app';
  body: string;
  bookingId?: string;
  options?: string[]; // ISO starts offered
}

// ---------- Next-week plan ----------
export interface PlanChange {
  kind: 'stall' | 'progress' | 'endurance' | 'adherence' | 'on-track' | 'travel' | 'deload';
  title: string;
  detail: string;
}

export interface WeekPlan {
  clientId: string;
  weekStart: string;
  changes: PlanChange[];
  days: (ProgramDay & { date: string; changedCount: number })[];
  approved: boolean;
  approvedAt?: string;
}

// ---------- Live session ----------
export interface ActiveSession {
  clientId: string;
  bookingId?: string;
  dayId: string;
  startedAt: number;
  setStartedAt: number;
  step: number; // 0..(circuits*rounds*items - 1)
  setTimes: number[];
  circuits: Circuit[]; // working copy (mods applied, loads adjustable)
  entries: LogEntry[];
  todayMods: Record<string, string>; // exerciseId -> description for this session
}

import type { Booking, Client, SessionLog } from '../types';

export const LOW_BALANCE = 2;

export interface Balance {
  purchased: number;
  done: number;
  pending: number; // purchased − done (negative = done more than paid for)
  booked: number; // upcoming confirmed/awaiting bookings
  unbooked: number; // pending sessions not yet on the calendar
  low: boolean;
  owes: number;
  hasPackages: boolean;
}

/** Sessions purchased vs completed for one client. Missed sessions don't use up a session. */
export function sessionBalance(s: { clients: Client[]; logs: SessionLog[]; bookings: Booking[] }, clientId: string, now = new Date()): Balance {
  const c = s.clients.find((x) => x.id === clientId);
  const packages = c?.packages ?? [];
  const purchased = packages.reduce((n, p) => n + p.sessions, 0);
  const done = s.logs.filter((l) => l.clientId === clientId && l.status === 'done').length + (c?.priorDone ?? 0);
  const pending = purchased - done;
  const booked = s.bookings.filter((b) => b.clientId === clientId && new Date(b.start) > now && (b.status === 'confirmed' || b.status === 'awaiting')).length;
  return {
    purchased,
    done,
    pending,
    booked,
    unbooked: Math.max(0, pending - booked),
    low: packages.length > 0 && pending >= 0 && pending <= LOW_BALANCE,
    owes: pending < 0 ? -pending : 0,
    hasPackages: packages.length > 0
  };
}

export const leftLabel = (b: Balance) =>
  !b.hasPackages ? 'No package' : b.owes ? `Owes ${b.owes}` : `${b.pending} left`;

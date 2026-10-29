// Event handlers for the offline demo — same rules as api/app/engine/events.py.
import type { Booking, BusyBlock, Message } from '../types';
import { addMinutes, fmtDay, fmtTime, uid } from '../lib/dates';
import { acceptTime, msg, nearestSlots, offerToWaitlist, openSlots, withinAvailability, type SchedState } from './scheduler';

export interface Outcome {
  bookings: Booking[];
  messages: Message[];
  summary: string;
}

const ACTIVE = ['confirmed', 'awaiting'];

const overlapsBusy = (s: SchedState, b: Booking) => {
  const st = new Date(b.start);
  const end = addMinutes(st, b.durationMin);
  return s.busy.some((x) => st < new Date(x.end) && new Date(x.start) < end);
};

export function slotConflicts(s: SchedState, now = new Date()) {
  return s.bookings.filter(
    (b) => b.clientId && ACTIVE.includes(b.status) && new Date(b.start) > now && (overlapsBusy(s, b) || !withinAvailability(s, new Date(b.start), b.durationMin))
  );
}

/** Trainer became unavailable: offer each affected client the two nearest open times, or flag the trainer. */
export function resolveConflicts(s: SchedState, now = new Date()): Outcome {
  const out: Outcome = { bookings: [], messages: [], summary: '' };
  let bookings = [...s.bookings];
  for (const b of slotConflicts(s, now)) {
    const c = s.clients.find((x) => x.id === b.clientId);
    if (!c) continue;
    const taken = new Set(out.bookings.map((x) => x.start));
    const alts = nearestSlots({ ...s, bookings }, new Date(b.start), 4, now, 2, b.id).filter((t) => !taken.has(t.toISOString())).slice(0, 2);
    const old = `${fmtDay(b.start)} at ${fmtTime(b.start)}`;
    let nb: Booking;
    if (alts.length) {
      nb = { ...b, status: 'awaiting', start: alts[0].toISOString(), offered: alts.map((t) => t.toISOString()), note: `Coach unavailable ${fmtTime(b.start)} · new times offered` };
      out.messages.push(msg(c, `Sorry, your coach can't make ${old} anymore. Open times: ${alts.map((t) => `${fmtDay(t)} ${fmtTime(t)}`).join(' or ')}. Tap one to book.`, now, { bookingId: b.id, options: nb.offered }));
    } else {
      nb = { ...b, status: 'needs-you', offered: undefined, note: 'Coach unavailable · no open time nearby' };
      out.messages.push(msg(c, `Your coach needs to move your session on ${old}. You'll get a new time shortly.`, now, { bookingId: b.id }));
    }
    out.bookings.push(nb);
    bookings = bookings.map((x) => (x.id === b.id ? nb : x));
  }
  const n = out.bookings.length;
  out.summary = n ? `${n} session${n === 1 ? '' : 's'} moved` : 'No sessions affected';
  return out;
}

export function blockTime(s: SchedState, start: Date, end: Date, label: string, now = new Date()): { block: BusyBlock; out: Outcome } {
  const block: BusyBlock = { id: uid('x'), start: start.toISOString(), end: end.toISOString(), label: label || 'Unavailable', source: 'Manual' };
  return { block, out: resolveConflicts({ ...s, busy: [...s.busy, block] }, now) };
}

export function unblockTime(s: SchedState, block: BusyBlock, now = new Date()): Outcome {
  const st = { ...s, busy: s.busy.filter((x) => x.id !== block.id) };
  const freed = openSlots(st, new Date(block.start), now).filter((t) => t >= new Date(block.start) && t < new Date(block.end));
  const out: Outcome = { bookings: [], messages: [], summary: 'Time is open again' };
  if (freed.length) {
    const w = offerToWaitlist(st, freed[0], now);
    if (w.booking) {
      out.bookings.push(w.booking);
      out.messages.push(...w.messages);
      out.summary = 'Time is open again · first slot offered to waitlist';
    }
  }
  return out;
}

/** Client picks a time: new booking, accepting an offer, or changing a confirmed session. */
export function clientBooks(s: SchedState, clientId: string, startISO: string, now: Date, bookingId: string | undefined, unbookedLeft: number, byClient: boolean) {
  const existing = bookingId ? s.bookings.find((b) => b.id === bookingId) : undefined;
  const noticeMs = s.settings.minNoticeH * 3600000;
  const start = new Date(startISO);
  if (byClient && existing?.status === 'confirmed' && new Date(existing.start).getTime() - now.getTime() < noticeMs && existing.start !== startISO)
    return { ok: false as const, reason: `Your session is less than ${s.settings.minNoticeH} hours away. Message your coach to change it.` };
  const r = acceptTime(s, clientId, startISO, now, bookingId);
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const extra: Outcome = { bookings: [], messages: [], summary: '' };
  const counted = !!existing && ACTIVE.includes(existing.status);
  let booking = r.booking;
  let messages = r.messages;
  if (unbookedLeft <= 0 && !counted) {
    const c = s.clients.find((x) => x.id === clientId);
    booking = { ...booking, status: 'needs-you', note: 'No sessions left · renew to confirm' };
    messages = messages.filter((m) => m.dir === 'in');
    if (c) messages.push(msg(c, `Got it: ${fmtDay(start)} at ${fmtTime(start)}. You've used all your purchased sessions, so your coach will confirm once you renew.`, now, { bookingId: booking.id }));
  }
  if (existing?.status === 'confirmed' && existing.start !== startISO) {
    const w = offerToWaitlist({ ...s, bookings: s.bookings.map((x) => (x.id === existing.id ? booking : x)) }, new Date(existing.start), now);
    if (w.booking) {
      extra.bookings.push(w.booking);
      extra.messages.push(...w.messages);
    }
  }
  return { ok: true as const, booking, messages, replaced: r.replaced, extra };
}

/** Cancel a session; a client cancelling inside the notice window is a late cancel. Old time goes to the waitlist. */
export function cancelSession(s: SchedState, b: Booking, now: Date, byClient: boolean): Outcome {
  const c = s.clients.find((x) => x.id === b.clientId);
  const late = byClient && new Date(b.start).getTime() - now.getTime() < s.settings.minNoticeH * 3600000;
  const nb: Booking = { ...b, status: 'cancelled', note: late ? 'Late cancel by client' : byClient ? 'Cancelled by client' : 'Cancelled' };
  const out: Outcome = { bookings: [nb], messages: [], summary: late ? 'Late cancel recorded' : 'Cancelled' };
  const when = `${fmtDay(b.start)} at ${fmtTime(b.start)}`;
  if (c && byClient) out.messages.push({ id: uid('m'), clientId: c.id, at: now.toISOString(), dir: 'in', channel: 'app', body: `Cancelled ${when}${late ? ` (less than ${s.settings.minNoticeH} h notice)` : ''}.`, bookingId: b.id });
  else if (c) out.messages.push(msg(c, `Your session on ${when} is cancelled.`, now, { bookingId: b.id }));
  const w = offerToWaitlist({ ...s, bookings: s.bookings.map((x) => (x.id === b.id ? nb : x)) }, new Date(b.start), now);
  if (w.booking) {
    out.bookings.push(w.booking);
    out.messages.push(...w.messages);
    out.summary += ' · slot offered to waitlist';
  }
  return out;
}

/** Package renewed: confirm bookings held because the client had no sessions left. */
export function renewed(s: SchedState, clientId: string, unbookedLeft: number, now = new Date()): Outcome {
  const c = s.clients.find((x) => x.id === clientId);
  const held = s.bookings
    .filter((b) => b.clientId === clientId && b.status === 'needs-you' && new Date(b.start) > now && (b.note ?? '').startsWith('No sessions left'))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, Math.max(0, unbookedLeft));
  const out: Outcome = { bookings: [], messages: [], summary: '' };
  for (const b of held) {
    out.bookings.push({ ...b, status: 'confirmed', note: 'Confirmed after renewal' });
    if (c) out.messages.push(msg(c, `Thanks for renewing! You're confirmed for ${fmtDay(b.start)} at ${fmtTime(b.start)}.`, now, { bookingId: b.id }));
  }
  return out;
}

export function lowBalanceNotice(c: { id: string; pushEnabled: boolean } & Parameters<typeof msg>[0], pending: number, now = new Date()): Message[] {
  if (pending < 0) return [msg(c, `You've done ${-pending} more session${pending < -1 ? 's' : ''} than purchased. Please renew with your coach.`, now)];
  if (pending === 0) return [msg(c, 'That was your last purchased session. Renew with your coach to keep your spot.', now)];
  if (pending <= 2) return [msg(c, `You have ${pending} session${pending === 1 ? '' : 's'} left in your package.`, now)];
  return [];
}

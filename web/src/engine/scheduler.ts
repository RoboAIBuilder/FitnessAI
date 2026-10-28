import type { Availability, Booking, BusyBlock, Client, Message, Settings } from '../types';
import { addDays, addMinutes, atTime, DOW_SHORT, fmtDay, fmtTime, minutesOf, sameDay, startOfDay, uid } from '../lib/dates';

export interface SchedState {
  clients: Client[];
  bookings: Booking[];
  busy: BusyBlock[];
  availability: Availability;
  settings: Settings;
  messages: Message[];
}

const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && bS < aE;

export function isAway(c: Client, day: Date) {
  if (!c.away) return false;
  const d = startOfDay(day);
  return d >= startOfDay(new Date(c.away.from)) && d <= startOfDay(new Date(c.away.to));
}

export function busyAt(s: SchedState, start: Date, durationMin: number, ignoreBookingId?: string) {
  const end = addMinutes(start, durationMin + s.settings.bufferMin);
  const blk = s.busy.find((b) => overlaps(start, end, new Date(b.start), new Date(b.end)));
  if (blk) return { kind: 'busy' as const, label: blk.label };
  const bk = s.bookings.find(
    (b) =>
      b.id !== ignoreBookingId &&
      b.clientId &&
      b.status !== 'cancelled' &&
      b.status !== 'open' &&
      overlaps(start, end, new Date(b.start), addMinutes(new Date(b.start), b.durationMin + s.settings.bufferMin))
  );
  if (bk) return { kind: 'booked' as const, label: 'booked' };
  return null;
}

export function withinAvailability(s: SchedState, start: Date, durationMin: number) {
  const wins = s.availability[start.getDay()] ?? [];
  const sm = start.getHours() * 60 + start.getMinutes();
  return wins.some((w) => sm >= minutesOf(w.start) && sm + durationMin <= minutesOf(w.end));
}

/** Open start times on a day, honouring availability, synced busy blocks, bookings and minimum notice. */
export function openSlots(s: SchedState, day: Date, now = new Date(), ignoreBookingId?: string): Date[] {
  const dur = s.settings.sessionMin;
  const step = 15;
  const out: Date[] = [];
  const earliest = addMinutes(now, s.settings.minNoticeH * 60);
  for (const w of s.availability[day.getDay()] ?? []) {
    for (let m = minutesOf(w.start); m + dur <= minutesOf(w.end); m += step) {
      const t = startOfDay(day);
      t.setMinutes(m);
      if (t < earliest) continue;
      if (busyAt(s, t, dur, ignoreBookingId)) continue;
      // keep slots on a clean grid: skip a slot if the previous kept one is less than session+buffer earlier
      const prev = out[out.length - 1];
      if (prev && (t.getTime() - prev.getTime()) / 60000 < dur + s.settings.bufferMin) continue;
      out.push(t);
    }
  }
  return out;
}

/** Nearest open slots to a target time, same day first then the next days. */
export function nearestSlots(s: SchedState, target: Date, n = 2, now = new Date(), searchDays = 2, ignoreBookingId?: string) {
  const cands: Date[] = [];
  for (let d = 0; d <= searchDays; d++) {
    const day = addDays(target, d);
    cands.push(...openSlots(s, day, now, ignoreBookingId));
  }
  return cands
    .sort((a, b) => {
      const da = Math.abs(a.getTime() - target.getTime()) + (sameDay(a, target) ? 0 : 86400000);
      const db = Math.abs(b.getTime() - target.getTime()) + (sameDay(b, target) ? 0 : 86400000);
      return da - db;
    })
    .slice(0, n);
}

export function channelFor(c: Client): Message['channel'] {
  return c.pushEnabled ? 'push' : 'app';
}

export function msg(c: Client, body: string, at: Date, extra: Partial<Message> = {}): Message {
  return { id: uid('m'), clientId: c.id, at: at.toISOString(), dir: 'out', channel: channelFor(c), body, ...extra };
}

const first = (name: string) => name.split(' ')[0];

/**
 * Plan the next N days: book every client's usual slot, invite or auto-confirm,
 * offer alternatives on conflicts, and flag what needs the trainer.
 */
export function autoPlan(s: SchedState, now = new Date(), days = 3) {
  const bookings: Booking[] = [];
  const messages: Message[] = [];
  const working: SchedState = { ...s, bookings: [...s.bookings] };
  const a = s.settings.automation;
  for (let d = 1; d <= days; d++) {
    const day = addDays(startOfDay(now), d);
    for (const c of s.clients) {
      if (c.waitlist) continue;
      for (const slot of c.usualSlots.filter((u) => u.dow === day.getDay())) {
        const target = atTime(day, slot.time);
        const exists = working.bookings.some((b) => b.clientId === c.id && sameDay(new Date(b.start), day) && b.status !== 'cancelled');
        if (exists) continue;
        if (isAway(c, day)) continue;
        const free = withinAvailability(working, target, s.settings.sessionMin) && !busyAt(working, target, s.settings.sessionMin);
        let b: Booking;
        if (free) {
          if (c.standing && a.autoConfirmStanding) {
            b = { id: uid('b'), clientId: c.id, start: target.toISOString(), durationMin: s.settings.sessionMin, status: 'confirmed', source: 'standing', note: 'Standing slot · auto-confirmed' };
            messages.push(msg(c, `You're set for ${fmtDay(target)} at ${fmtTime(target)}. Reply if anything changes.`, now, { bookingId: b.id }));
          } else if (a.inviteAhead) {
            b = { id: uid('b'), clientId: c.id, start: target.toISOString(), durationMin: s.settings.sessionMin, status: 'awaiting', source: 'invite', note: 'Usual slot · invite sent', offered: [target.toISOString()] };
            messages.push(msg(c, `Hi ${first(c.name)}, your usual ${DOW_SHORT[day.getDay()]} ${fmtTime(target)} is open. Tap to confirm or pick another time.`, now, { bookingId: b.id, options: [target.toISOString()] }));
          } else continue;
        } else {
          const alts = a.offerAlternatives ? nearestSlots(working, target, 2, now, 1) : [];
          if (alts.length) {
            b = { id: uid('b'), clientId: c.id, start: alts[0].toISOString(), durationMin: s.settings.sessionMin, status: 'awaiting', source: 'invite', note: `Usual ${fmtTime(target)} unavailable · alternatives offered`, offered: alts.map((x) => x.toISOString()) };
            messages.push(
              msg(c, `Hi ${first(c.name)}, your usual ${DOW_SHORT[day.getDay()]} ${fmtTime(target)} isn't available this week. Open times: ${alts.map((x) => `${fmtDay(x)} ${fmtTime(x)}`).join(' or ')}. Tap one to book.`, now, { bookingId: b.id, options: b.offered })
            );
          } else {
            b = { id: uid('b'), clientId: c.id, start: target.toISOString(), durationMin: s.settings.sessionMin, status: 'needs-you', source: 'invite', note: 'Usual slot unavailable and no open time nearby' };
          }
        }
        if (a.askFirst && b.status === 'confirmed') b.status = 'awaiting';
        bookings.push(b);
        working.bookings.push(b);
      }
    }
  }
  return { bookings, messages };
}

/** A client accepts one of the offered times (or any open time from the booking page). */
export function acceptTime(s: SchedState, clientId: string, startISO: string, now = new Date(), bookingId?: string) {
  const c = s.clients.find((x) => x.id === clientId)!;
  const start = new Date(startISO);
  const existing = bookingId
    ? s.bookings.find((b) => b.id === bookingId)
    : s.bookings.find((b) => b.clientId === clientId && sameDay(new Date(b.start), start) && (b.status === 'awaiting' || b.status === 'needs-you'));
  const clash = busyAt(s, start, s.settings.sessionMin, existing?.id);
  if (clash) return { ok: false as const, reason: 'That time was just taken. Pick another.' };
  const booking: Booking = existing
    ? { ...existing, start: startISO, status: s.settings.automation.askFirst ? 'needs-you' : 'confirmed', source: existing.source === 'standing' ? 'standing' : 'client', note: 'Confirmed by client', offered: undefined }
    : { id: uid('b'), clientId, start: startISO, durationMin: s.settings.sessionMin, status: s.settings.automation.askFirst ? 'needs-you' : 'confirmed', source: 'client', note: 'Booked by client' };
  const inbound: Message = { id: uid('m'), clientId, at: now.toISOString(), dir: 'in', channel: 'app', body: `Booked ${fmtDay(start)} ${fmtTime(start)} ✓`, bookingId: booking.id };
  const out = msg(c, `Confirmed: ${fmtDay(start)} at ${fmtTime(start)}. Reminder ${s.settings.reminderHours} h before.`, addMinutes(now, 0), { bookingId: booking.id });
  return { ok: true as const, booking, messages: [inbound, out], replaced: existing?.id };
}

/** A client says the offered time doesn't work: offer the next open slots, or flag the trainer. */
export function declineTime(s: SchedState, bookingId: string, text: string, now = new Date()) {
  const b = s.bookings.find((x) => x.id === bookingId)!;
  const c = s.clients.find((x) => x.id === b.clientId)!;
  const inbound: Message = { id: uid('m'), clientId: c.id, at: now.toISOString(), dir: 'in', channel: 'app', body: text, bookingId };
  const target = new Date(b.start);
  const excluded = new Set([b.start, ...(b.offered ?? [])]);
  const alts = s.settings.automation.offerAlternatives
    ? nearestSlots(s, target, 4, now, 2, b.id).filter((x) => !excluded.has(x.toISOString())).slice(0, 2)
    : [];
  if (alts.length && !s.settings.automation.askFirst) {
    const updated: Booking = { ...b, status: 'awaiting', offered: alts.map((x) => x.toISOString()), start: alts[0].toISOString(), note: 'Client declined · new times offered' };
    const out = msg(c, `No problem! Open times: ${alts.map((x) => `${fmtDay(x)} ${fmtTime(x)}`).join(' or ')}. Tap one to book.`, now, { bookingId, options: updated.offered });
    return { booking: updated, messages: [inbound, out] };
  }
  return { booking: { ...b, status: 'needs-you' as const, note: 'Client asked to change · needs your choice' }, messages: [inbound] };
}

/** Free a slot (cancel/decline) and offer it to the waitlist. */
export function offerToWaitlist(s: SchedState, start: Date, now = new Date()) {
  if (!s.settings.automation.waitlist) return { messages: [] as Message[], booking: null as Booking | null };
  const w = s.clients.find((c) => c.waitlist);
  if (!w) return { messages: [] as Message[], booking: null as Booking | null };
  const booking: Booking = { id: uid('b'), clientId: w.id, start: start.toISOString(), durationMin: s.settings.sessionMin, status: 'awaiting', source: 'waitlist', note: 'Freed slot offered to waitlist', offered: [start.toISOString()] };
  return { booking, messages: [msg(w, `A spot opened: ${fmtDay(start)} at ${fmtTime(start)}. Tap to grab it.`, now, { bookingId: booking.id, options: booking.offered })] };
}

/** Reminders that are due within the reminder window for confirmed bookings. */
export function dueReminders(s: SchedState, now = new Date()) {
  const horizon = addMinutes(now, s.settings.reminderHours * 60);
  return s.bookings.filter((b) => b.status === 'confirmed' && new Date(b.start) > now && new Date(b.start) <= horizon);
}

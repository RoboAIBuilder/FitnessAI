import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, CalendarX2, Link2, Lock, SlidersHorizontal, Sparkles } from 'lucide-react';
import { slotsFor, useStore } from '../store';
import { addDays, ampm, atTime, DOW_SHORT, fmtDay, fmtTime, fmtTimeShort, hhmm, sameDay, startOfDay } from '../lib/dates';
import { Avatar, Page, Sheet } from '../ui';
import type { Booking } from '../types';

type Row =
  | { kind: 'booking'; at: Date; b: Booking }
  | { kind: 'busy'; at: Date; end: Date; label: string; source: string; id: string }
  | { kind: 'open'; at: Date };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'good' },
  awaiting: { label: 'Awaiting', cls: 'accent' },
  'needs-you': { label: 'Needs you', cls: 'warn' },
  done: { label: 'Done', cls: '' }
};

export default function Schedule() {
  const s = useStore();
  const nav = useNavigate();
  const today = startOfDay(new Date());
  const [sel, setSel] = useState(1);
  const [sheet, setSheet] = useState<Row | null>(null);
  const [blocking, setBlocking] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const day = days[sel];

  const rows = useMemo(() => {
    const out: Row[] = [];
    s.bookings
      .filter((b) => b.clientId && sameDay(new Date(b.start), day) && b.status !== 'cancelled' && b.status !== 'open')
      .forEach((b) => out.push({ kind: 'booking', at: new Date(b.start), b }));
    s.busy.filter((x) => sameDay(new Date(x.start), day)).forEach((x) => out.push({ kind: 'busy', at: new Date(x.start), end: new Date(x.end), label: x.label, source: x.source, id: x.id }));
    slotsFor(s, day).forEach((t) => out.push({ kind: 'open', at: t }));
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [s, day]);

  const range = s.bookings.filter((b) => b.clientId && new Date(b.start) > new Date() && new Date(b.start) < addDays(today, s.settings.inviteDaysAhead + 1));
  const confirmed = range.filter((b) => b.status === 'confirmed').length;
  const awaiting = range.filter((b) => b.status === 'awaiting').length;
  const needs = s.bookings.filter((b) => b.status === 'needs-you' && new Date(b.start) > new Date()).length;
  const countFor = (d: Date) => s.bookings.filter((b) => b.clientId && sameDay(new Date(b.start), d) && ['confirmed', 'awaiting', 'needs-you', 'done'].includes(b.status)).length;
  const pushCount = s.clients.filter((c) => c.pushEnabled).length;

  return (
    <Page>
      <header className="topbar" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">Shared with {s.clients.length} clients · open times only</span>
          <h1 className="title">Schedule</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to={`/book/${s.clients[0]?.id}`} className="icon-btn" aria-label="Preview the client booking page"><Link2 size={20} aria-hidden="true" /></Link>
          <Link to="/schedule/settings" className="icon-btn" aria-label="Availability and automation"><SlidersHorizontal size={20} aria-hidden="true" /></Link>
        </div>
      </header>

      <div className="cal-strip">
        {days.map((d, i) => (
          <button key={i} type="button" className="day-btn" aria-pressed={i === sel} onClick={() => setSel(i)} aria-label={fmtDay(d)}>
            <span className="w">{i === 0 ? 'Today' : DOW_SHORT[d.getDay()]}</span>
            <span className="d">{d.getDate()}</span>
            <span className="n">{s.availability[d.getDay()]?.length ? `${countFor(d)}` : 'off'}</span>
          </button>
        ))}
      </div>

      <section className="card inverse">
        <div className="row">
          <Sparkles size={18} aria-hidden="true" color="var(--spark)" />
          <h2 className="h2">Next {s.settings.inviteDaysAhead} days</h2>
        </div>
        <span className="small" style={{ lineHeight: 1.45 }}>
          Tap <b>Plan &amp; remind now</b> to invite clients to their usual times for the next {s.settings.inviteDaysAhead} days and remind upcoming sessions. Bookings, changes and cancellations update the moment they happen. {pushCount} clients get app notifications.
        </span>
        <div className="grid3" style={{ textAlign: 'center' }}>
          <div style={{ background: 'var(--inverse-2)', borderRadius: 10, padding: '8px 4px' }}><div className="display-num" style={{ fontSize: 22, color: '#9fddb5' }}>{confirmed}</div><div className="xs muted">Confirmed</div></div>
          <div style={{ background: 'var(--inverse-2)', borderRadius: 10, padding: '8px 4px' }}><div className="display-num" style={{ fontSize: 22, color: '#b9c6ff' }}>{awaiting}</div><div className="xs muted">Awaiting reply</div></div>
          <div style={{ background: 'var(--inverse-2)', borderRadius: 10, padding: '8px 4px' }}><div className="display-num" style={{ fontSize: 22, color: '#ffb27a' }}>{needs}</div><div className="xs muted">Needs you</div></div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn sm"
            style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
            onClick={async () => {
              const { invites: n, reminders: r } = await s.planAndRemind();
              s.toast(n || r ? `${n} new invite${n === 1 ? '' : 's'} · ${r} reminder${r === 1 ? '' : 's'} sent` : 'Everything is already planned');
            }}
          >
            <BellRing size={16} aria-hidden="true" /> Plan &amp; remind now
          </button>
          <Link to="/schedule/replies" className="btn sm light">Client replies{needs ? ` (${needs})` : ''}</Link>
        </div>
      </section>

      <div className="row between baseline">
        <h2 className="h2">{fmtDay(day)}</h2>
        <button type="button" className="btn sm" onClick={() => setBlocking(true)}>
          <CalendarX2 size={16} aria-hidden="true" /> Block time
        </button>
      </div>
      <div className="row between baseline" style={{ marginTop: -6 }}>
        <span />
        <span className="xs muted">
          {rows.filter((r) => r.kind === 'booking').length} sessions · {rows.filter((r) => r.kind === 'open').length} open
        </span>
      </div>
      {!s.availability[day.getDay()]?.length && !rows.length && <div className="card ghost small muted">Day off. Change it in availability settings.</div>}
      <div className="stack">
        {rows.map((r, i) => {
          if (r.kind === 'busy')
            return r.source === 'Manual' ? (
              <button key={i} type="button" className="card tight ghost" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => setSheet(r)}>
                <span className="time-col"><b className="muted">{fmtTimeShort(r.at)}</b><span>– {fmtTime(r.end)}</span></span>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="semibold muted">Unavailable · {r.label}</span>
                  <span className="xs muted">Blocked by you · tap to remove</span>
                </span>
                <CalendarX2 size={16} aria-hidden="true" className="muted" />
              </button>
            ) : (
              <div key={i} className="card tight ghost" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <span className="time-col"><b className="muted">{fmtTimeShort(r.at)}</b><span>– {fmtTime(r.end)}</span></span>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="semibold muted">Busy · {r.label}</span>
                  <span className="xs muted">From {r.source} · hidden from clients</span>
                </span>
                <Lock size={16} aria-hidden="true" className="muted" />
              </div>
            );
          if (r.kind === 'open')
            return (
              <button key={i} type="button" className="card tight dashed" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => setSheet(r)}>
                <span className="time-col"><b>{fmtTimeShort(r.at)}</b><span>{ampm(r.at)} · {s.settings.sessionMin}m</span></span>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="semibold" style={{ color: 'var(--accent)' }}>Open slot</span>
                  <span className="xs muted">Visible to clients · tap to offer it</span>
                </span>
              </button>
            );
          const c = s.clients.find((x) => x.id === r.b.clientId)!;
          const st = STATUS[r.b.status] ?? { label: r.b.status, cls: '' };
          return (
            <button key={i} type="button" className={`card tight${r.b.status === 'needs-you' ? ' alert' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => setSheet(r)}>
              <span className="time-col"><b>{fmtTimeShort(r.at)}</b><span>{ampm(r.at)} · {r.b.durationMin}m</span></span>
              <span className="grow stack" style={{ gap: 0 }}>
                <span className="semibold">{c.name}</span>
                <span className="xs muted">{r.b.note ?? (r.b.source === 'standing' ? 'Standing slot' : '')}</span>
              </span>
              <span className={`chip ${st.cls}`}>{st.label}</span>
            </button>
          );
        })}
      </div>

      {blocking && <BlockSheet day={day} onClose={() => setBlocking(false)} />}
      {sheet?.kind === 'busy' && (
        <Sheet title={`${sheet.label} · ${fmtTime(sheet.at)}–${fmtTime(sheet.end)}`} eyebrow={fmtDay(sheet.at).toUpperCase()} onClose={() => setSheet(null)}>
          <span className="small muted">Removing this block opens the time to clients again. The first open slot is offered to the waitlist.</span>
          <button type="button" className="btn danger block" onClick={async () => { const id = sheet.id; setSheet(null); const msg = await s.unblockTime(id); if (msg) s.toast(msg); }}>Remove block</button>
        </Sheet>
      )}
      {sheet?.kind === 'open' && (
        <Sheet title={`Offer ${fmtDay(sheet.at)} · ${fmtTime(sheet.at)}`} eyebrow="OPEN SLOT" onClose={() => setSheet(null)}>
          <span className="small muted">Sends this time to one client. They tap to book it.</span>
          <div className="stack">
            {s.clients.map((c) => (
              <button key={c.id} type="button" className="card tight" style={{ flexDirection: 'row', alignItems: 'center' }} onClick={() => { s.offerOpenSlot(c.id, sheet.at.toISOString()); setSheet(null); }}>
                <Avatar client={c} />
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="semibold">{c.name}</span>
                  <span className="xs muted">{c.waitlist ? 'Waitlist · ' : ''}{c.flexibleWindow || 'No preference saved'}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'booking' && (
        <BookingSheet
          b={sheet.b}
          onClose={() => setSheet(null)}
          onStart={() => {
            s.startSession(sheet.b.clientId!, sheet.b.id);
            nav('/session');
          }}
        />
      )}
    </Page>
  );
}

function BookingSheet({ b, onClose, onStart }: { b: Booking; onClose: () => void; onStart: () => void }) {
  const s = useStore();
  const c = s.clients.find((x) => x.id === b.clientId)!;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const thread = s.messages.filter((m) => m.bookingId === b.id).slice(-4);
  const isToday = sameDay(new Date(b.start), new Date());
  return (
    <Sheet title={c.name} eyebrow={`${fmtDay(b.start)} · ${fmtTime(b.start)}`} onClose={onClose}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={`chip ${STATUS[b.status]?.cls ?? ''}`}>{STATUS[b.status]?.label ?? b.status}</span>
        <span className="chip">{c.pushEnabled ? 'App notifications' : 'Notifications off'}</span>
      </div>
      {thread.length > 0 && (
        <div className="stack tight">
          {thread.map((m) => (
            <div key={m.id} className={`bubble ${m.dir === 'in' ? 'in' : 'out'}`}>{m.body}</div>
          ))}
        </div>
      )}
      {b.status === 'done' ? (
        <Link to={`/clients/${c.id}/history`} className="btn block" onClick={onClose}>See session log</Link>
      ) : (
        <>
          {(b.status === 'confirmed' && isToday) && <button type="button" className="btn primary block" onClick={onStart}>Start session</button>}
          {b.status === 'needs-you' && <Link to="/schedule/replies" className="btn primary block" onClick={onClose}>Choose a new time</Link>}
          <div className="btn-row">
            <Link to={`/clients/${c.id}`} className="btn" onClick={onClose}>Profile</Link>
            {confirmCancel ? (
              <button type="button" className="btn danger" onClick={() => { s.cancelBooking(b.id); onClose(); }}>Yes, cancel</button>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmCancel(true)}>Cancel session</button>
            )}
          </div>
          {confirmCancel && <span className="xs muted">The client is told, and the slot is offered to the waitlist.</span>}
        </>
      )}
    </Sheet>
  );
}

function BlockSheet({ day, onClose }: { day: Date; onClose: () => void }) {
  const s = useStore();
  const [date, setDate] = useState(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
  const win = s.availability[day.getDay()]?.[0];
  const [from, setFrom] = useState(win?.start ?? '09:00');
  const [to, setTo] = useState(win ? hhmm(new Date(atTime(day, win.start).getTime() + 3600000)) : '10:00');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const d = new Date(`${date}T12:00`);
  const start = atTime(d, from);
  const end = atTime(d, to);
  const affected = s.bookings.filter((b) => b.clientId && ['confirmed', 'awaiting'].includes(b.status) && new Date(b.start) < end && new Date(new Date(b.start).getTime() + b.durationMin * 60000) > start);
  return (
    <Sheet title="Block time" eyebrow="MAKE YOURSELF UNAVAILABLE" onClose={onClose}>
      <form
        className="stack loose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (end <= start) {
            setError('End time must be after start time.');
            return;
          }
          setBusy(true);
          const msg = await s.blockTime(start.toISOString(), end.toISOString(), label.trim() || 'Unavailable');
          setBusy(false);
          onClose();
          if (msg) s.toast(msg);
        }}
      >
        <div className="field"><label htmlFor="blk-date">Date</label><input id="blk-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="blk-from">From</label><input id="blk-from" type="time" step={900} className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label htmlFor="blk-to">To</label><input id="blk-to" type="time" step={900} className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="blk-label">Reason (only you see it)</label><input id="blk-label" className="input" value={label} placeholder="e.g. Doctor" onChange={(e) => setLabel(e.target.value)} /></div>
        {affected.length > 0 ? (
          <div className="banner warn">
            <span>
              {affected.length} booked session{affected.length > 1 ? 's' : ''} in this time ({affected.map((b) => s.clients.find((c) => c.id === b.clientId)?.name.split(' ')[0]).join(', ')}). Each client is offered the two nearest open times right away.
            </span>
          </div>
        ) : (
          <span className="small muted">No booked sessions in this time.</span>
        )}
        {error && <div className="banner warn" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Blocking…' : 'Block time'}</button>
      </form>
    </Sheet>
  );
}

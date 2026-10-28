import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Play, Settings, Sparkles } from 'lucide-react';
import { dayToRun, todayBookings, upcoming, useStore } from '../store';
import { insights } from '../insights';
import { Page, Empty } from '../ui';
import { addDays, ampm, fmtDay, fmtTimeShort } from '../lib/dates';
import { leftLabel, sessionBalance } from '../lib/balance';
import type { Booking } from '../types';

export default function Today() {
  const s = useStore();
  const nav = useNavigate();
  const now = new Date();
  let day = now;
  let list = todayBookings(s, now);
  let label = 'Today';
  if (!list.length) {
    day = addDays(now, 1);
    list = todayBookings(s, day);
    label = 'Tomorrow';
  }
  const nextUp = list.find((b) => b.status !== 'done' && new Date(b.start).getTime() > now.getTime() - 45 * 60000);
  const ins = insights(s);
  const attention = ins.filter((i) => i.tone === 'warn').length;
  const next3 = upcoming(s, 3).filter((b) => b.clientId && new Date(b.start) > now);
  const awaiting = next3.filter((b) => b.status === 'awaiting').length;
  const needs = next3.filter((b) => b.status === 'needs-you').length;
  const active = s.active ? s.clients.find((c) => c.id === s.active!.clientId) : null;

  const start = (b: Booking) => {
    if (!b.clientId) return;
    s.startSession(b.clientId, b.id);
    nav('/session');
  };

  return (
    <Page>
      <header className="topbar" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{fmtDay(now)} · YMCA</span>
          <h1 className="title">Today</h1>
        </div>
        <Link to="/schedule/settings" className="icon-btn" aria-label="Availability and automation settings">
          <Settings size={20} aria-hidden="true" />
        </Link>
      </header>

      {active && (
        <Link to="/session" className="card focus tight" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Play size={20} aria-hidden="true" color="var(--accent)" />
          <span className="grow semibold">Resume session with {active.name}</span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      )}

      <div className="grid3">
        <div className="stat">
          <span className="display-num">{list.length}</span>
          <span className="lbl">Sessions {label.toLowerCase()}</span>
        </div>
        <div className="stat">
          <span className="display-num">{s.clients.filter((c) => !c.waitlist).length}</span>
          <span className="lbl">Active clients</span>
        </div>
        <Link to="/progress" className={`stat${attention ? ' warn' : ''}`}>
          <span className="display-num">{attention}</span>
          <span className="lbl">Need attention</span>
        </Link>
      </div>

      <Link to="/schedule" className="card tight" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <span className="avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 12 }}>
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <span className="grow stack" style={{ gap: 2 }}>
          <span className="semibold">Next 3 days: {next3.length} sessions</span>
          <span className="small muted">
            Invites sent for you · {awaiting} awaiting{needs ? <> · <b className="warn-text">{needs} need you</b></> : null}
          </span>
        </span>
        <ChevronRight size={20} aria-hidden="true" className="muted" />
      </Link>

      <section className="stack">
        <div className="row between baseline">
          <h2 className="h2">{label}'s sessions</h2>
          <Link to="/schedule" className="small semibold">Full schedule</Link>
        </div>
        {!list.length && <Empty title="No sessions today or tomorrow">Open Schedule to plan the next few days.</Empty>}
        {list.map((b) => {
          const c = s.clients.find((x) => x.id === b.clientId)!;
          const d = dayToRun(s, c.id, new Date(b.start));
          const isNext = nextUp?.id === b.id;
          const bal = sessionBalance(s, c.id);
          return (
            <div key={b.id} className={`card tight${isNext ? ' focus' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Link to={`/clients/${c.id}`} className="row grow" style={{ color: 'inherit', gap: 12 }}>
                <span className="time-col">
                  <b>{fmtTimeShort(b.start)}</b>
                  <span>{ampm(b.start)} · {b.durationMin}m</span>
                </span>
                <span className="grow stack" style={{ gap: 2 }}>
                  <span className="semibold">{c.name}</span>
                  <span className="small muted">{b.status === 'done' ? 'Logged' : d ? `Day ${d.label} · ${d.name}` : 'No program yet'} · <span className={bal.low || bal.owes ? 'warn-text semibold' : ''}>{leftLabel(bal)}</span></span>
                </span>
              </Link>
              {b.status === 'done' ? (
                <span className="chip good">Done</span>
              ) : b.status === 'awaiting' ? (
                <span className="chip accent">Awaiting</span>
              ) : b.status === 'needs-you' ? (
                <span className="chip warn">Needs you</span>
              ) : (
                <button type="button" className={`btn sm${isNext ? ' primary' : ''}`} onClick={() => start(b)} aria-label={`Start session with ${c.name}`}>
                  <Play size={16} aria-hidden="true" /> Start
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="card inverse" aria-labelledby="ins-h">
        <div className="row">
          <Sparkles size={18} aria-hidden="true" color="var(--spark)" />
          <h2 id="ins-h" className="h2">Coach insights</h2>
        </div>
        {!ins.length && <span className="small">Nothing needs you right now.</span>}
        <div className="stack">
          {ins.slice(0, 5).map((i, k) => (
            <Link key={k} to={i.to} className="row" style={{ color: 'inherit', alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: i.tone === 'warn' ? 'var(--spark)' : 'var(--bar-soft)' }} />
              <span className="grow">{i.text}</span>
            </Link>
          ))}
        </div>
        <Link to="/programs" className="btn light block">Review next-week plans</Link>
      </section>
    </Page>
  );
}

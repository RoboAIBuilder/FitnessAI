import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { apiMode } from '../api';
import { DOW_SHORT, fmtHHMM, minutesOf } from '../lib/dates';
import { Back, Page, Switch } from '../ui';
import type { Automation } from '../types';

const RULES: { key: keyof Automation; title: string; sub: string }[] = [
  { key: 'inviteAhead', title: 'Invite clients ahead', sub: "Uses each client's usual slot, stated preferences and last week" },
  { key: 'autoConfirmStanding', title: 'Auto-confirm standing slots', sub: 'Regulars keep their time unless they say otherwise' },
  { key: 'reminder', title: 'Reminder before each session', sub: 'Includes a one-tap reschedule link' },
  { key: 'offerAlternatives', title: 'If a client declines, offer the next 2 open times', sub: 'Books it as soon as they tap one' },
  { key: 'waitlist', title: 'Offer freed slots to the waitlist', sub: 'First to tap gets it' },
  { key: 'askFirst', title: 'Ask me before confirming any change', sub: 'Off: the app books changes inside your availability' }
];

export default function Availability() {
  const s = useStore();
  const [adding, setAdding] = useState<number | null>(null);
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('09:00');
  const [confirmReset, setConfirmReset] = useState(false);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const push = s.clients.filter((c) => c.pushEnabled).length;

  return (
    <Page>
      <div className="topbar"><Back to="/schedule" label="Schedule" /></div>
      <h1 className="title sm">Availability &amp; automation</h1>

      <section className="card">
        <h2 className="h2">When I can train</h2>
        <span className="small muted">Clients only ever see open times inside these windows.</span>
        {order.map((d) => (
          <div key={d} className="list-row" style={{ alignItems: 'center' }}>
            <span className="semibold small" style={{ width: 40 }}>{DOW_SHORT[d]}</span>
            <div className="row wrap grow" style={{ gap: 6 }}>
              {(s.availability[d] ?? []).map((w, i) => (
                <span key={i} className="chip accent" style={{ fontSize: 12, padding: '4px 4px 4px 9px' }}>
                  {fmtHHMM(w.start).replace(':00', '')}–{fmtHHMM(w.end).replace(':00', '')}
                  <button type="button" aria-label={`Remove ${DOW_SHORT[d]} ${w.start} to ${w.end}`} style={{ border: 0, background: 'none', color: 'inherit', padding: 2, cursor: 'pointer', display: 'flex' }} onClick={() => s.setAvailability({ ...s.availability, [d]: s.availability[d].filter((_, k) => k !== i) })}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {!(s.availability[d] ?? []).length && <span className="small muted">Off</span>}
            </div>
            <button type="button" className="icon-btn" aria-label={`Add hours on ${DOW_SHORT[d]}`} onClick={() => setAdding(adding === d ? null : d)} style={{ width: 36, height: 36 }}>
              <Plus size={16} aria-hidden="true" />
            </button>
            {adding === d && (
              <form
                className="row"
                style={{ width: '100%', flexWrap: 'wrap' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (minutesOf(end) <= minutesOf(start)) return;
                  const wins = [...(s.availability[d] ?? []), { start, end }].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
                  s.setAvailability({ ...s.availability, [d]: wins });
                  setAdding(null);
                }}
              >
                <label htmlFor="av-s" className="xs muted">From</label>
                <input id="av-s" type="time" step={900} className="input" style={{ width: 120 }} value={start} onChange={(e) => setStart(e.target.value)} />
                <label htmlFor="av-e" className="xs muted">to</label>
                <input id="av-e" type="time" step={900} className="input" style={{ width: 120 }} value={end} onChange={(e) => setEnd(e.target.value)} />
                <button type="submit" className="btn sm primary">Add</button>
              </form>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="h2">Other jobs (blocked automatically)</h2>
        {s.settings.calendars.map((cal) => (
          <Switch
            key={cal.name}
            on={cal.synced}
            onToggle={() => s.setSettings({ calendars: s.settings.calendars.map((x) => (x.name === cal.name ? { ...x, synced: !x.synced } : x)) })}
            title={cal.name}
            sub={cal.synced ? 'Synced · busy times hidden from clients' : 'Not synced'}
          />
        ))}
        <span className="xs muted">Demo uses sample busy blocks. Live sync connects Google Calendar and imports the YMCA shift schedule.</span>
      </section>

      <section className="card">
        <h2 className="h2">Booking rules</h2>
        <div className="grid2">
          <div className="field">
            <label htmlFor="r-len">Session length</label>
            <select id="r-len" className="input" value={s.settings.sessionMin} onChange={(e) => s.setSettings({ sessionMin: Number(e.target.value) })}>
              {[30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-buf">Buffer between</label>
            <select id="r-buf" className="input" value={s.settings.bufferMin} onChange={(e) => s.setSettings({ bufferMin: Number(e.target.value) })}>
              {[0, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-ahead">Plan and invite</label>
            <select id="r-ahead" className="input" value={s.settings.inviteDaysAhead} onChange={(e) => s.setSettings({ inviteDaysAhead: Number(e.target.value) })}>
              {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''} ahead</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-notice">Minimum notice</label>
            <select id="r-notice" className="input" value={s.settings.minNoticeH} onChange={(e) => s.setSettings({ minNoticeH: Number(e.target.value) })}>
              {[2, 6, 12, 24].map((n) => <option key={n} value={n}>{n} hours</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-rem">Reminder</label>
            <select id="r-rem" className="input" value={s.settings.reminderHours} onChange={(e) => s.setSettings({ reminderHours: Number(e.target.value) })}>
              {[2, 12, 24].map((n) => <option key={n} value={n}>{n} h before</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-name">Your name on messages</label>
            <input id="r-name" className="input" value={s.settings.trainerName} onChange={(e) => s.setSettings({ trainerName: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="card" style={{ gap: 0 }}>
        <h2 className="h2" style={{ marginBottom: 8 }}>Automatic messages</h2>
        {RULES.map((r) => (
          <Switch key={r.key} on={s.settings.automation[r.key]} onToggle={() => s.setAutomation({ [r.key]: !s.settings.automation[r.key] })} title={r.title} sub={r.sub} />
        ))}
      </section>

      <section className="card">
        <h2 className="h2">How clients hear from you</h2>
        <span className="small">{push} clients installed the app and get <b>app notifications</b>. The other {s.clients.length - push} see invites and reminders when they open the app, until they turn notifications on.</span>
      </section>

      {apiMode && (
        <button type="button" className="btn ghost" onClick={() => s.signOut()}>Sign out</button>
      )}

      <section className="card ghost">
        <h2 className="h2">Demo data</h2>
        <span className="small muted">Everything you change is kept on this device. Reset brings back the sample clients and schedule.</span>
        {confirmReset ? (
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Keep my changes</button>
            <button type="button" className="btn danger" onClick={() => { s.reset(); setConfirmReset(false); s.toast('Demo data reset'); }}>Reset now</button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Reset demo data</button>
        )}
      </section>
    </Page>
  );
}

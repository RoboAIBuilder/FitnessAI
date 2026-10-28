import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { clientFlags } from '../insights';
import { Avatar, Page } from '../ui';
import { DOW_SHORT, fmtHHMM } from '../lib/dates';
import { leftLabel, sessionBalance } from '../lib/balance';
import type { Client } from '../types';

export const slotsSummary = (c: Client) => {
  if (!c.usualSlots.length) return c.flexibleWindow || 'No usual slot';
  const times = [...new Set(c.usualSlots.map((u) => u.time))];
  const days = [...c.usualSlots].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7)).map((u) => DOW_SHORT[u.dow]);
  return times.length === 1 ? `${[...new Set(days)].join(' / ')} · ${fmtHHMM(times[0])}` : c.usualSlots.map((u) => `${DOW_SHORT[u.dow]} ${fmtHHMM(u.time)}`).join(', ');
};

export default function Clients() {
  const s = useStore();
  const [q, setQ] = useState('');
  const match = (c: Client) => c.name.toLowerCase().includes(q.toLowerCase());
  const active = s.clients.filter((c) => !c.waitlist && match(c));
  const waitlist = s.clients.filter((c) => c.waitlist && match(c));

  const row = (c: Client) => {
    const flags = clientFlags(s, c.id);
    const bal = sessionBalance(s, c.id);
    return (
      <Link key={c.id} to={`/clients/${c.id}`} className="card tight" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar client={c} />
        <span className="grow stack" style={{ gap: 2 }}>
          <span className="semibold">{c.name}</span>
          <span className="small muted">{slotsSummary(c)}</span>
          {flags.length > 0 && (
            <span className="row wrap" style={{ gap: 4, marginTop: 2 }}>
              {[...flags.filter((f) => f.kind === 'low' || f.kind === 'owes'), ...flags.filter((f) => f.kind !== 'low' && f.kind !== 'owes')].slice(0, 2).map((f, i) => (
                <span key={i} className={`chip ${f.kind === 'away' ? 'accent' : 'warn'}`}>{f.kind === 'stall' ? 'Stalled lift' : f.kind === 'missed' ? 'Missed sessions' : f.kind === 'behind' ? 'Behind on goal' : f.kind === 'low' || f.kind === 'owes' ? f.text : 'Away soon'}</span>
              ))}
            </span>
          )}
        </span>
        <span className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
          <span className={`small semibold num${bal.low || bal.owes ? ' warn-text' : ''}`}>{leftLabel(bal)}</span>
          <span className="xs muted" title={c.pushEnabled ? 'Gets app notifications' : 'Notifications off'}>{c.pushEnabled ? 'Alerts on' : 'Alerts off'}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" className="muted" />
      </Link>
    );
  };

  return (
    <Page>
      <header className="topbar" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{active.length} active · {waitlist.length} on waitlist</span>
          <h1 className="title">Clients</h1>
        </div>
        <Link to="/clients/new" className="btn sm primary">
          <Plus size={16} aria-hidden="true" /> Add
        </Link>
      </header>
      <div className="row" style={{ position: 'relative' }}>
        <Search size={18} aria-hidden="true" className="muted" style={{ position: 'absolute', left: 12 }} />
        <label htmlFor="client-q" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search clients</label>
        <input id="client-q" className="input" style={{ paddingLeft: 38 }} placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section className="stack">{active.map(row)}</section>
      {waitlist.length > 0 && (
        <section className="stack">
          <h2 className="h2">Waitlist</h2>
          <span className="small muted">Freed slots are offered here first.</span>
          {waitlist.map(row)}
        </section>
      )}
    </Page>
  );
}

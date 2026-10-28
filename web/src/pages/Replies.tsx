import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageSquare, Wand2 } from 'lucide-react';
import { suggestionsFor, useStore } from '../store';
import { atTime, fmtAgo, fmtDay, fmtTime } from '../lib/dates';
import { Back, Empty, Page } from '../ui';
import type { Booking, Client } from '../types';

type Filter = 'all' | 'needs' | 'waiting' | 'handled';

export default function Replies() {
  const s = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const future = (b: Booking) => new Date(b.start) > new Date();

  const threads = s.clients
    .map((c) => {
      const msgs = s.messages.filter((m) => m.clientId === c.id).sort((a, b) => a.at.localeCompare(b.at));
      const bk = s.bookings.filter((b) => b.clientId === c.id && future(b));
      const needs = bk.find((b) => b.status === 'needs-you');
      const waiting = bk.find((b) => b.status === 'awaiting');
      const status: Exclude<Filter, 'all'> = needs ? 'needs' : waiting ? 'waiting' : 'handled';
      return { c, msgs, needs, waiting, status, last: msgs[msgs.length - 1]?.at ?? '' };
    })
    .filter((t) => t.msgs.length || t.needs || t.waiting)
    .sort((a, b) => {
      const rank = { needs: 0, waiting: 1, handled: 2 };
      return rank[a.status] - rank[b.status] || b.last.localeCompare(a.last);
    });

  const counts = { needs: threads.filter((t) => t.status === 'needs').length, waiting: threads.filter((t) => t.status === 'waiting').length, handled: threads.filter((t) => t.status === 'handled').length };
  const shown = threads.filter((t) => filter === 'all' || t.status === filter);

  return (
    <Page>
      <div className="topbar"><Back to="/schedule" label="Schedule" /></div>
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="title sm">Client replies</h1>
        <span className="small muted">The app messages clients and books them. You only step in when it can't decide.</span>
      </div>
      <div className="pills" role="group" aria-label="Filter">
        {(
          [
            ['all', `All ${threads.length}`],
            ['needs', `Needs you ${counts.needs}`],
            ['waiting', `Waiting ${counts.waiting}`],
            ['handled', `Handled ${counts.handled}`]
          ] as [Filter, string][]
        ).map(([v, l]) => (
          <button key={v} type="button" className="pill" style={{ minHeight: 38 }} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {counts.waiting > 0 && (
        <button type="button" className="card dashed tight" style={{ flexDirection: 'row', alignItems: 'center' }} onClick={async () => { const n = await s.simulateReplies(); s.toast(`${n} client replies simulated`); }}>
          <Wand2 size={18} aria-hidden="true" color="var(--accent)" />
          <span className="grow stack" style={{ gap: 0 }}>
            <span className="semibold small">Demo: simulate client replies</span>
            <span className="xs muted">Waiting clients tap a time (one in three says no) so you can watch the app handle it.</span>
          </span>
        </button>
      )}
      {!shown.length && <Empty title="Nothing here">No conversations in this view.</Empty>}
      {shown.map((t) => (
        <Thread key={t.c.id} client={t.c} needs={t.needs} waiting={t.waiting} status={t.status} />
      ))}
    </Page>
  );
}

function Thread({ client, needs, waiting, status }: { client: Client; needs?: Booking; waiting?: Booking; status: 'needs' | 'waiting' | 'handled' }) {
  const s = useStore();
  const msgs = s.messages.filter((m) => m.clientId === client.id).sort((a, b) => a.at.localeCompare(b.at)).slice(-4);
  const suggestions = needs ? suggestionsFor(s, needs, client) : [];
  const [custom, setCustom] = useState(false);
  return (
    <section className={`card${status === 'needs' ? ' alert' : ''}`}>
      <div className="row between">
        <span className="semibold">{client.name}</span>
        {status === 'needs' ? <span className="chip warn">Needs you</span> : status === 'waiting' ? <span className="chip accent">Waiting</span> : <span className="chip good">Handled</span>}
      </div>
      <div className="stack tight">
        {msgs.map((m) => (
          <div key={m.id} className="stack" style={{ gap: 2 }}>
            <div className={`bubble ${m.dir === 'in' ? 'in' : 'out'}`}>{m.body}</div>
            <span className={`bubble-meta${m.dir === 'out' ? ' out' : ''}`}>
              {m.dir === 'out' ? (
                <>{m.channel === 'push' ? <Bell size={11} aria-hidden="true" /> : <MessageSquare size={11} aria-hidden="true" />} Sent by app {m.channel === 'push' ? 'as notification' : 'in-app'} · {fmtAgo(m.at)}</>
              ) : (
                <>{client.name.split(' ')[0]} · {fmtAgo(m.at)}</>
              )}
            </span>
          </div>
        ))}
      </div>
      {needs && (
        <>
          <span className="small muted">
            {needs.note ?? 'Needs your choice'} · {fmtDay(needs.start)} {fmtTime(needs.start)}
          </span>
          <div className="stack tight">
            {suggestions.map((t) => (
              <button key={t.toISOString()} type="button" className="btn sm" style={{ color: 'var(--accent-ink)', borderColor: 'var(--accent)' }} onClick={() => s.trainerOffer(needs.id, t.toISOString())}>
                Offer {fmtDay(t)} · {fmtTime(t)}
              </button>
            ))}
            {!suggestions.length && !custom && <span className="small muted">No open time in their window this week.</span>}
            {custom ? (
              <CustomOffer onSend={(iso) => s.trainerOffer(needs.id, iso)} onCancel={() => setCustom(false)} />
            ) : (
              <button type="button" className="btn sm" onClick={() => setCustom(true)}>Offer another time…</button>
            )}
            <button type="button" className="btn sm" onClick={() => s.trainerSkip(needs.id)}>Skip that session</button>
          </div>
        </>
      )}
      {waiting && !needs && (
        <div className="row between small">
          <span className="muted">
            Offered {(waiting.offered ?? [waiting.start]).map((o) => `${fmtDay(o)} ${fmtTime(o)}`).join(' or ')}. Reminder goes out if there's no reply.
          </span>
        </div>
      )}
      {(waiting || needs) && (
        <Link to={`/book/${client.id}`} className="small semibold">Open {client.name.split(' ')[0]}'s view →</Link>
      )}
    </section>
  );
}

function CustomOffer({ onSend, onCancel }: { onSend: (iso: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState('07:30');
  return (
    <form className="stack tight" onSubmit={(e) => { e.preventDefault(); onSend(atTime(new Date(date + 'T12:00'), time).toISOString()); }}>
      <div className="grid2">
        <div className="field"><label htmlFor="co-d">Date</label><input id="co-d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="co-t">Time</label><input id="co-t" type="time" step={900} className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <div className="btn-row">
        <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn sm primary">Send offer</button>
      </div>
    </form>
  );
}

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { CalendarCheck, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { dayToRun, useStore } from '../store';
import { EX, exName } from '../data/exercises';
import { describePrescription, roundSeconds } from '../engine/generator';
import { exerciseStatus, fmtObjectiveValue, objectiveProgress } from '../engine/planner';
import { addDays, DOW_SHORT, fmtClock, fmtDay, fmtMonthDay, fmtMonthYear, sameDay, startOfDay, startOfWeek } from '../lib/dates';
import { Avatar, Back, Bars, Empty, Page, Progress, Sheet } from '../ui';
import { sessionBalance } from '../lib/balance';
import { slotsSummary } from './Clients';
import type { Client, SessionLog } from '../types';

type Ctx = { client: Client };
const useClient = () => useOutletContext<Ctx>().client;

export default function ClientLayout() {
  const { id } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const client = s.clients.find((c) => c.id === id);
  if (!client) {
    return (
      <Page>
        <Back to="/clients" label="Clients" />
        <Empty title="Client not found" />
      </Page>
    );
  }
  const months = Math.max(0, Math.round((Date.now() - new Date(client.since).getTime()) / (30 * 86400000)));
  return (
    <Page>
      <div className="topbar">
        <Back to="/clients" label="Clients" />
        <Link to={`/clients/${client.id}/edit`} className="btn sm">
          <Pencil size={16} aria-hidden="true" /> Edit
        </Link>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <Avatar client={client} lg />
        <div className="stack grow" style={{ gap: 2 }}>
          <h1 className="title sm">{client.name}</h1>
          <span className="small muted">
            {client.age ? `Age ${client.age} · ` : ''}
            Client since {fmtMonthYear(client.since)}
            {months ? ` (${months} mo)` : ''} · {client.frequency}×/week
          </span>
        </div>
      </div>
      {!client.waitlist && (
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const b = s.bookings.find((x) => x.clientId === client.id && sameDay(new Date(x.start), new Date()) && x.status === 'confirmed');
              s.startSession(client.id, b?.id);
              nav('/session');
            }}
          >
            <Play size={16} aria-hidden="true" /> Start session
          </button>
          <Link to={`/book/${client.id}`} className="btn">
            <CalendarCheck size={16} aria-hidden="true" /> Client's booking view
          </Link>
        </div>
      )}
      <nav className="subtabs" aria-label="Client sections">
        <NavLink end to={`/clients/${client.id}`} className={({ isActive }) => (isActive ? 'on' : '')}>Overview</NavLink>
        <NavLink to={`/clients/${client.id}/history`} className={({ isActive }) => (isActive ? 'on' : '')}>History</NavLink>
        <NavLink to={`/clients/${client.id}/progress`} className={({ isActive }) => (isActive ? 'on' : '')}>Progress</NavLink>
        <NavLink to={`/clients/${client.id}/plan`} className={({ isActive }) => (isActive ? 'on' : '')}>Next week</NavLink>
      </nav>
      <Outlet context={{ client } satisfies Ctx} />
    </Page>
  );
}

const ftIn = (inches: number) => `${Math.floor(inches / 12)}′ ${inches % 12}″`;

export function ClientOverview() {
  const client = useClient();
  const s = useStore();
  const program = s.programs.find((p) => p.clientId === client.id);
  const next = dayToRun(s, client.id);
  const delta = client.weightLb - client.startWeightLb;
  return (
    <>
      <section className="grid2">
        <div className="stat"><span className="lbl">Height</span><span className="display-num" style={{ fontSize: 26 }}>{ftIn(client.heightIn)}</span></div>
        <div className="stat">
          <span className="lbl">Weight</span>
          <span className="display-num" style={{ fontSize: 26 }}>{client.weightLb} lb</span>
          {delta !== 0 && <span className={`xs semibold ${delta < 0 ? 'good-text' : 'muted'}`}>{delta > 0 ? '+' : '−'}{Math.abs(delta)} lb since start</span>}
        </div>
        <div className="stat"><span className="lbl">Body fat (est.)</span><span className="display-num" style={{ fontSize: 26 }}>{client.bodyFatPct ? `${client.bodyFatPct}%` : '—'}</span></div>
        <div className="stat">
          <span className="lbl">Frequency</span>
          <span className="display-num" style={{ fontSize: 26 }}>{client.frequency}× / wk</span>
          <span className="xs muted">{client.usualSlots.map((u) => DOW_SHORT[u.dow]).join(' · ') || 'Flexible'}</span>
        </div>
      </section>

      <SessionsCard client={client} />

      <section className="card">
        <div className="row between baseline">
          <h2 className="h2">Objectives</h2>
          <Link to={`/clients/${client.id}/progress`} className="small semibold">See progress</Link>
        </div>
        {!client.objectives.length && <span className="small muted">No objectives yet. Add them from Edit.</span>}
        {client.objectives.map((o) => {
          const p = objectiveProgress(o);
          return (
            <div key={o.id} className="stack tight">
              <div className="row between small">
                <span className="semibold">{o.title}</span>
                <span className={p.status === 'stalled' || p.status === 'behind' ? 'warn-text semibold' : 'muted'}>
                  {fmtObjectiveValue(o, p.current)}
                  {p.status === 'stalled' ? ' · stalled' : p.status === 'behind' ? ' · behind' : ''}
                </span>
              </div>
              <Progress frac={p.frac} warn={p.status === 'stalled' || p.status === 'behind'} />
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="row between baseline">
          <h2 className="h2">Current program</h2>
          <Link to={`/builder/${client.id}`} className="small semibold">{program ? 'Edit program' : 'Design program'}</Link>
        </div>
        {program ? (
          <>
            <span className="semibold">{program.name} · Block {program.block}</span>
            <span className="small muted">
              Week {Math.min(program.weeks, Math.floor((Date.now() - new Date(program.start).getTime()) / (7 * 86400000)) + 1)} of {program.weeks} · {program.sessionMin} min · {program.days[0]?.circuits.length} circuits × {program.days[0]?.circuits[0]?.rounds} sets
            </span>
            <div className="row wrap" style={{ gap: 6 }}>
              {program.days.map((d) => (
                <span key={d.id} className="tag">{d.label} · {d.name}</span>
              ))}
            </div>
            {next && <span className="small muted">Next up: Day {next.label} ({next.name})</span>}
          </>
        ) : (
          <span className="small muted">No program yet.</span>
        )}
      </section>

      <SavedMods client={client} />

      <section className="card">
        <div className="row between baseline">
          <h2 className="h2">Scheduling preferences</h2>
          <Link to="/schedule" className="small semibold">Schedule</Link>
        </div>
        <div className="row between small"><span>Usual slot</span><span className="muted right">{slotsSummary(client)}</span></div>
        <div className="row between small"><span>Sign-in code</span><span className="semibold num">{client.accessCode ?? client.name.split(' ')[0].toLowerCase()}</span></div>
        <div className="row between small"><span>Flexible window</span><span className="muted right">{client.flexibleWindow || '—'}</span></div>
        <div className="row between small"><span>Contact by</span><span className="muted">{client.pushEnabled ? 'App notification' : 'In the app (notifications off)'}</span></div>
        <div className="row between small"><span>Usual slot handling</span><span className="muted">{client.standing ? 'Standing · auto-confirm' : 'Invite each week'}</span></div>
        {client.away && new Date(client.away.to) >= startOfDay(new Date()) && (
          <div className="row between small"><span>Told you</span><span className="warn-text semibold">Away {fmtMonthDay(client.away.from)}–{fmtMonthDay(client.away.to)}</span></div>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Notes &amp; constraints</h2>
        {client.constraints.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {client.constraints.map((c) => <span key={c} className="tag warn">Avoid: {c} stress</span>)}
          </div>
        )}
        <span className="small" style={{ whiteSpace: 'pre-line' }}>{client.notes || 'No notes yet.'}</span>
      </section>
    </>
  );
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function SessionsCard({ client }: { client: Client }) {
  const s = useStore();
  const b = sessionBalance(s, client.id);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const packages = [...(client.packages ?? [])].sort((x, y) => y.date.localeCompare(x.date));
  const chip = b.owes ? <span className="chip warn">Owes {b.owes}</span> : b.low ? <span className="chip warn">Renew soon</span> : b.hasPackages ? <span className="chip good">Paid up</span> : <span className="chip">No package</span>;
  return (
    <section className={`card${b.low || b.owes ? ' warn' : ''}`} aria-labelledby="sess-h">
      <div className="row between baseline">
        <h2 id="sess-h" className="h2">Sessions</h2>
        {chip}
      </div>
      <div className="grid3">
        <div className="stack" style={{ gap: 0 }}>
          <span className="display-num">{b.purchased}</span>
          <span className="xs muted">Purchased</span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <span className="display-num">{b.done}</span>
          <span className="xs muted">Done</span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <span className={`display-num${b.low || b.owes ? ' warn-text' : ''}`}>{b.owes ? `−${b.owes}` : b.pending}</span>
          <span className="xs muted">Pending</span>
        </div>
      </div>
      {b.purchased > 0 && <Progress frac={b.done / b.purchased} warn={b.low || b.owes > 0} />}
      <span className="small muted">
        {b.owes
          ? `${b.owes} session${b.owes > 1 ? 's' : ''} done beyond what was purchased.`
          : b.pending > 0
            ? `${b.booked} of ${b.pending} pending ${b.booked === 1 ? 'is' : 'are'} on the calendar${b.unbooked ? `, ${b.unbooked} still to book` : ''}.`
            : b.hasPackages ? 'All purchased sessions used.' : 'Add a package to start tracking.'}
        {client.priorDone ? ` Done includes ${client.priorDone} before FitnessAI.` : ''} Missed sessions don't count as done.
      </span>
      <button type="button" className="btn sm" onClick={() => setAdding(true)}>
        <Plus size={16} aria-hidden="true" /> Add sessions
      </button>
      {packages.length > 0 && (
        <div className="stack tight">
          <span className="label">Purchases</span>
          {packages.map((p) => (
            <div key={p.id} className="list-row small">
              <span className="grow">
                {fmtMonthDay(p.date)} {new Date(p.date).getFullYear() !== new Date().getFullYear() ? new Date(p.date).getFullYear() : ''} · <b>{p.sessions} sessions</b>
                {p.note && p.note !== `${p.sessions}-session pack` ? <span className="muted"> · {p.note}</span> : null}
              </span>
              {p.price ? <span className="muted num">{money(p.price)}</span> : null}
              {confirm === p.id ? (
                <button type="button" className="btn sm danger" onClick={() => { s.removePackage(client.id, p.id); setConfirm(null); }}>Remove</button>
              ) : (
                <button type="button" className="icon-btn" aria-label={`Remove purchase of ${p.sessions} sessions on ${fmtMonthDay(p.date)}`} onClick={() => setConfirm(p.id)} style={{ border: 0, background: 'transparent', width: 36, height: 36 }}>
                  <Trash2 size={16} aria-hidden="true" className="muted" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {adding && <AddSessionsSheet client={client} onClose={() => setAdding(false)} />}
    </section>
  );
}

function AddSessionsSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const s = useStore();
  const last = [...(client.packages ?? [])].sort((x, y) => y.date.localeCompare(x.date))[0];
  const perSession = last?.price && last.sessions ? Math.round(last.price / last.sessions) : 60;
  const [count, setCount] = useState('10');
  const [price, setPrice] = useState(String(10 * perSession));
  const [note, setNote] = useState('');
  const n = parseInt(count, 10);
  const pick = (v: number) => {
    setCount(String(v));
    setPrice(String(v * perSession));
  };
  return (
    <Sheet title={`Add sessions for ${client.name.split(' ')[0]}`} eyebrow="NEW PURCHASE" onClose={onClose}>
      <div className="stack tight">
        <span className="label">Package</span>
        <div className="grid4">
          {[5, 10, 12, 20].map((v) => (
            <button key={v} type="button" className="pill" aria-pressed={n === v} onClick={() => pick(v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="pk-count">Sessions</label>
          <input id="pk-count" className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="pk-price">Amount paid ($, optional)</label>
          <input id="pk-price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pk-note">Note (optional)</label>
        <input id="pk-note" className="input" value={note} placeholder="e.g. Paid by Venmo" onChange={(e) => setNote(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn primary block"
        disabled={!(n > 0)}
        onClick={() => {
          s.addPackage(client.id, n, price ? Number(price) : undefined, note.trim() || undefined);
          onClose();
        }}
      >
        {n > 0 ? `Add ${n} sessions` : 'Enter a number of sessions'}
      </button>
    </Sheet>
  );
}

function SavedMods({ client }: { client: Client }) {
  const s = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="row between baseline">
        <h2 className="h2">Saved modifications</h2>
        <span className="xs muted">Auto-applied next time</span>
      </div>
      {!client.mods.length && <span className="small muted">None yet. Use "Modify" during a session and keep "Remember for next time" on.</span>}
      {client.mods.map((m) => (
        <div key={m.exerciseId} className="list-row" style={{ alignItems: 'flex-start' }}>
          <div className="grow stack" style={{ gap: 2 }}>
            <div className="row between">
              <span className="semibold small">{exName(m.exerciseId)}</span>
              <span className="chip warn">{m.reason}</span>
            </div>
            <span className="small muted">
              {m.kind === 'swap' && m.swapToId ? `Swap to ${exName(m.swapToId).toLowerCase()}` : m.detail}
              {m.kind === 'swap' && m.detail && m.swapToId && !exName(m.swapToId).toLowerCase().includes(m.detail.toLowerCase()) ? ` (${m.detail})` : ''} · saved {fmtMonthDay(m.savedAt)}
            </span>
          </div>
          {confirm === m.exerciseId ? (
            <button type="button" className="btn sm danger" onClick={() => { s.removeMod(client.id, m.exerciseId); setConfirm(null); }}>Remove</button>
          ) : (
            <button type="button" className="icon-btn" aria-label={`Remove saved modification for ${exName(m.exerciseId)}`} onClick={() => setConfirm(m.exerciseId)} style={{ border: 0, background: 'transparent' }}>
              <Trash2 size={18} aria-hidden="true" className="muted" />
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------------- History ----------------
export function ClientHistory() {
  const client = useClient();
  const s = useStore();
  const logs = s.logs.filter((l) => l.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  const weekStart = startOfWeek(new Date());
  const weeks = [3, 2, 1, 0].map((w) => addDays(weekStart, -7 * w));
  const dows = [...new Set(client.usualSlots.map((u) => u.dow))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const recent = logs.filter((l) => new Date(l.date) >= weeks[0]);
  const done = recent.filter((l) => l.status === 'done').length;

  return (
    <>
      {dows.length > 0 && (
        <section className="card">
          <div className="row between baseline">
            <h2 className="h2">Last 4 weeks</h2>
            <span className="small muted"><b style={{ color: 'var(--ink)' }}>{done} of {recent.length}</b> done{recent.length ? ` · ${Math.round((done / recent.length) * 100)}%` : ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${dows.length}, minmax(0, 1fr))`, gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span />
            {dows.map((d) => <span key={d} className="muted" style={{ textAlign: 'center' }}>{DOW_SHORT[d]}</span>)}
            {weeks.map((w) => (
              <WeekRow key={w.toISOString()} week={w} dows={dows} logs={logs} />
            ))}
          </div>
          <div className="row xs muted" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent)' }} />Completed</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, border: '2px dashed var(--warn)' }} />Missed</span>
          </div>
        </section>
      )}
      {!logs.length && <Empty title="No sessions logged yet">Start a session to build history.</Empty>}
      {logs.slice(0, 12).map((l, i) => (
        <LogCard key={l.id} log={l} prev={logs.slice(i + 1)} />
      ))}
    </>
  );
}

function WeekRow({ week, dows, logs }: { week: Date; dows: number[]; logs: SessionLog[] }) {
  return (
    <>
      <span className="muted">{fmtMonthDay(week)}</span>
      {dows.map((d) => {
        const day = addDays(week, (d + 6) % 7);
        const l = logs.find((x) => sameDay(new Date(x.date), day));
        const future = startOfDay(day) > startOfDay(new Date());
        const today = sameDay(day, new Date());
        if (l?.status === 'done') return <span key={d} title="Completed" style={{ height: 28, borderRadius: 8, background: 'var(--accent)' }} />;
        if (l?.status === 'missed') return <span key={d} title="Missed" style={{ height: 24, borderRadius: 8, border: '2px dashed var(--warn)', background: 'var(--warn-soft)' }} />;
        if (today) return <span key={d} className="xs semibold" style={{ height: 24, borderRadius: 8, border: '2px solid var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Today</span>;
        return <span key={d} title={future ? 'Upcoming' : 'No session'} style={{ height: 24, borderRadius: 8, background: 'var(--surface-2)' }} />;
      })}
    </>
  );
}

function LogCard({ log, prev }: { log: SessionLog; prev: SessionLog[] }) {
  if (log.status === 'missed') {
    return (
      <div className="card tight dashed" style={{ flexDirection: 'row', alignItems: 'center', borderColor: 'var(--warn-line)' }}>
        <div className="grow stack" style={{ gap: 2 }}>
          <span className="semibold">{fmtDay(log.date)} · Day {log.dayLabel}</span>
          <span className="xs muted">Missed — {log.missedReason ?? 'no reason given'}</span>
        </div>
        <span className="chip warn">Missed</span>
      </div>
    );
  }
  const firstRound = log.entries.filter((e) => e.round === 1);
  const prevLoad = (id: string) => {
    for (const p of prev) {
      const e = p.entries.find((x) => x.exerciseId === id && x.round === 1);
      if (e?.loadLb !== undefined) return e.loadLb;
    }
    return undefined;
  };
  const pr = firstRound.some((e) => e.loadLb && prevLoad(e.exerciseId) !== undefined && e.loadLb > (prevLoad(e.exerciseId) ?? 0));
  const stall = firstRound.some((e) => {
    const st = exerciseStatus([...prev].reverse().concat(log), e.exerciseId);
    return st.kind === 'stall';
  });
  const circuits = ['A', 'B'].map((c) => firstRound.filter((e) => e.circuit === c));
  const setLabels = ['A', 'A', 'B', 'B'];
  return (
    <div className="card tight">
      <div className="row between">
        <div className="stack" style={{ gap: 0 }}>
          <span className="semibold">{fmtDay(log.date)} · Day {log.dayLabel}</span>
          <span className="xs muted">{log.dayName} · {log.durationMin} min{log.rpe ? ` · RPE ${log.rpe}` : ''}</span>
        </div>
        {pr ? <span className="chip good">Load up</span> : stall ? <span className="chip warn">Stall</span> : null}
      </div>
      {log.setTimesSec.length > 0 && (
        <div className="grid4 xs" style={{ textAlign: 'center' }}>
          {log.setTimesSec.map((t, i) => (
            <div key={i} className="num" style={{ borderRadius: 8, padding: '6px 2px', background: setLabels[i] === 'A' ? 'var(--accent-soft)' : 'var(--warn-soft)', color: setLabels[i] === 'A' ? 'var(--accent-ink)' : 'var(--warn-ink)', display: 'flex', flexDirection: 'column' }}>
              <span className="semibold">Set {i + 1} · {setLabels[i] ?? ''}</span>
              <span>{fmtClock(t)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="stack small" style={{ gap: 4, lineHeight: 1.5 }}>
        {circuits.map((list, ci) =>
          list.length ? (
            <span key={ci}>
              <b>{ci === 0 ? 'A' : 'B'}</b>{' '}
              {list.map((e, i) => {
                const p = prevLoad(e.exerciseId);
                const up = e.loadLb && p !== undefined && e.loadLb > p;
                return (
                  <span key={i}>
                    · {exName(e.exerciseId)}
                    {e.loadLb ? ` ${e.loadLb} lb` : ''}
                    {up ? <b className="good-text"> ▲{(e.loadLb ?? 0) - (p ?? 0)}</b> : null}
                    {e.mod ? <span className="warn-text"> (modified)</span> : null}{' '}
                  </span>
                );
              })}
            </span>
          ) : null
        )}
      </div>
      {log.note && <span className="small muted" style={{ fontStyle: 'italic' }}>“{log.note}”</span>}
    </div>
  );
}

// ---------------- Progress ----------------
export function ClientProgress() {
  const client = useClient();
  const s = useStore();
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!client.objectives.length) return <Empty title="No objectives yet">Add objectives from Edit to track progress.</Empty>;
  return (
    <>
      {client.objectives.map((o) => {
        const p = objectiveProgress(o);
        const values = o.history.slice(-8).map((h) => h.value);
        const lift = o.kind === 'lift';
        const stalledIdx = p.status === 'stalled' ? values.length - 3 : undefined;
        const chip =
          p.status === 'done' ? <span className="chip good">Reached</span> : p.status === 'on-track' ? <span className="chip accent">On track</span> : p.status === 'stalled' ? <span className="chip warn">Stalled</span> : <span className="chip">Behind</span>;
        return (
          <section key={o.id} className={`card${p.status === 'stalled' ? ' warn' : ''}`}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 2 }}>
                <h2 className="h2">{o.title}</h2>
                <span className="small muted">
                  {fmtObjectiveValue(o, o.start)} → {fmtObjectiveValue(o, p.current)} · goal {fmtObjectiveValue(o, o.target)} by {fmtMonthDay(o.deadline)}
                </span>
              </div>
              {chip}
            </div>
            {values.length >= 2 ? (
              <>
                <Bars values={o.lowerIsBetter ? values.map((v) => -v) : values} label={`${o.title} history: ${values.join(', ')}`} highlightLast warnFrom={stalledIdx} />
                <div className="row between xs muted"><span>{fmtMonthDay(o.history[Math.max(0, o.history.length - 8)].date)}</span><span>{values.length} entries</span><span>{fmtMonthDay(o.history[o.history.length - 1].date)}</span></div>
              </>
            ) : (
              <Progress frac={p.frac} />
            )}
            <span className="small" style={{ lineHeight: 1.4 }}>
              {p.status === 'stalled'
                ? <>Same {lift ? 'load' : 'result'} three times running. <Link to={`/clients/${client.id}/plan`}>Next week's plan</Link> changes the stimulus.</>
                : p.projected && p.status !== 'done'
                  ? <>Averaging <b>{p.ratePerWeek > 0 ? '+' : '−'}{Math.abs(p.ratePerWeek).toFixed(1)} {o.unit === 'sec' ? 's' : o.unit}/week</b>. At this pace: <b>{fmtMonthDay(p.projected)}</b>{new Date(p.projected) <= new Date(o.deadline) ? ' — ahead of the deadline.' : ' — after the deadline.'}</>
                  : p.status === 'done' ? 'Goal reached. Set a new one from Edit.' : `${Math.round(p.frac * 100)}% of the way there.`}
            </span>
            {!lift && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = parseFloat(vals[o.id] ?? '');
                  if (!isNaN(v)) {
                    s.addMeasurement(client.id, o.id, v);
                    setVals({ ...vals, [o.id]: '' });
                    s.toast('Measurement saved');
                  }
                }}
              >
                <label htmlFor={`m-${o.id}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>New measurement for {o.title}</label>
                <input id={`m-${o.id}`} className="input grow" inputMode="decimal" placeholder={`New measurement (${o.unit})`} value={vals[o.id] ?? ''} onChange={(e) => setVals({ ...vals, [o.id]: e.target.value })} />
                <button type="submit" className="btn sm">Log</button>
              </form>
            )}
            {lift && <span className="xs muted">Updates automatically from logged sessions.</span>}
          </section>
        );
      })}
    </>
  );
}

// ---------------- Next week ----------------
export function ClientPlan() {
  const client = useClient();
  const s = useStore();
  const program = s.programs.find((p) => p.clientId === client.id);
  const plan = s.plans[client.id];
  useEffect(() => {
    if (program) s.buildPlan(client.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, program?.id]);
  if (!program) return <Empty title="No program yet"><Link to={`/builder/${client.id}`}>Design a program</Link> first.</Empty>;
  if (!plan) return null;
  const end = addDays(new Date(plan.weekStart), 6);
  return (
    <>
      <div className="row between baseline">
        <h2 className="h2">Week of {fmtMonthDay(plan.weekStart)} – {fmtMonthDay(end)}</h2>
        {plan.approved ? <span className="chip good">Approved</span> : <span className="chip accent">Draft</span>}
      </div>
      <section className="card inverse">
        <div className="row">
          <Sparkles size={18} aria-hidden="true" color="var(--spark)" />
          <h2 className="h2">Why this plan</h2>
        </div>
        <div className="stack" style={{ fontSize: 14, lineHeight: 1.4 }}>
          {plan.changes.map((c, i) => (
            <span key={i}><b>{c.title}</b> → {c.detail}</span>
          ))}
        </div>
      </section>
      {!plan.days.length && <Empty title="No sessions next week">The client is away or has no usual slot.</Empty>}
      {plan.days.map((d) => (
        <section key={d.date} className="card tight">
          <div className="row between">
            <div className="stack" style={{ gap: 0 }}>
              <span className="semibold">{DOW_SHORT[new Date(d.date).getDay()]} · Day {d.label}</span>
              <span className="xs muted">{d.name} · {program.sessionMin} min</span>
            </div>
            {d.changedCount ? <span className="chip warn">{d.changedCount} change{d.changedCount > 1 ? 's' : ''}</span> : <span className="chip">Same</span>}
          </div>
          {d.circuits.map((c, ci) => (
            <div key={c.label} className="row small" style={{ alignItems: 'flex-start', gap: 10, lineHeight: 1.5, ...(ci === 0 ? { borderTop: '1px solid var(--line)', paddingTop: 10 } : {}) }}>
              <span className="chip" style={{ width: 44, justifyContent: 'center', background: c.label === 'A' ? 'var(--accent-soft)' : 'var(--warn-soft)', color: c.label === 'A' ? 'var(--accent-ink)' : 'var(--warn-ink)' }}>
                {c.label} ×{c.rounds}
              </span>
              <span className="grow">
                {c.items.map((p, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    {p.changed ? <b className="warn-text">{exName(p.exerciseId)} {describePrescription(p)}</b> : <>{exName(p.exerciseId)} {describePrescription(p)}</>}
                  </span>
                ))}
              </span>
            </div>
          ))}
          <span className="xs muted">~{fmtClock(roundSeconds(d.circuits[0]))} per round</span>
        </section>
      ))}
      {client.objectives.some((o) => o.kind === 'time' && o.lowerIsBetter && objectiveProgress(o).status === 'behind') && (
        <div className="card dashed tight" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div className="grow stack" style={{ gap: 0 }}>
            <span className="semibold">Sat · Tempo run (on their own)</span>
            <span className="xs muted">25 min at a comfortably hard pace</span>
          </div>
          <span className="chip accent">New</span>
        </div>
      )}
      <div className="btn-row">
        <Link to={`/builder/${client.id}`} className="btn">Adjust program</Link>
        <button type="button" className="btn primary" disabled={plan.approved} onClick={() => s.approvePlan(client.id)}>
          {plan.approved ? 'Sent to client' : 'Approve & send'}
        </button>
      </div>
      <span className="xs muted">Approved plans are what the live session runs next week. Exercise library: {Object.keys(EX).length} moves.</span>
    </>
  );
}



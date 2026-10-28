import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { fmtObjectiveValue, objectiveProgress } from '../engine/planner';
import { clientFlags } from '../insights';
import { Avatar, Page, Progress } from '../ui';

const ORDER = { stalled: 0, behind: 1, 'on-track': 2, done: 3 } as const;

export default function ProgressAll() {
  const s = useStore();
  const rows = s.clients
    .filter((c) => !c.waitlist)
    .flatMap((c) => c.objectives.map((o) => ({ c, o, p: objectiveProgress(o) })))
    .sort((a, b) => ORDER[a.p.status] - ORDER[b.p.status]);
  const counts = { attention: rows.filter((r) => r.p.status === 'stalled' || r.p.status === 'behind').length, ok: rows.filter((r) => r.p.status === 'on-track' || r.p.status === 'done').length };
  const attendance = s.clients.filter((c) => clientFlags(s, c.id).some((f) => f.kind === 'missed'));

  return (
    <Page>
      <header className="topbar" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{counts.attention} need attention · {counts.ok} on track</span>
          <h1 className="title">Progress</h1>
        </div>
      </header>
      {attendance.length > 0 && (
        <section className="card warn">
          <h2 className="h2">Attendance</h2>
          {attendance.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}/history`} className="row" style={{ color: 'inherit' }}>
              <Avatar client={c} />
              <span className="grow small"><b>{c.name}</b> · {clientFlags(s, c.id).find((f) => f.kind === 'missed')?.text.toLowerCase()} sessions</span>
              <ChevronRight size={18} aria-hidden="true" className="muted" />
            </Link>
          ))}
        </section>
      )}
      <section className="stack">
        {rows.map(({ c, o, p }) => (
          <Link key={o.id} to={`/clients/${c.id}/progress`} className={`card tight${p.status === 'stalled' ? ' warn' : ''}`}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 0 }}>
                <span className="semibold">{o.title}</span>
                <span className="xs muted">{c.name} · {fmtObjectiveValue(o, o.start)} → {fmtObjectiveValue(o, p.current)}</span>
              </div>
              {p.status === 'done' ? <span className="chip good">Reached</span> : p.status === 'on-track' ? <span className="chip accent">On track</span> : p.status === 'stalled' ? <span className="chip warn">Stalled</span> : <span className="chip">Behind</span>}
            </div>
            <Progress frac={p.frac} warn={p.status === 'stalled' || p.status === 'behind'} />
          </Link>
        ))}
      </section>
    </Page>
  );
}

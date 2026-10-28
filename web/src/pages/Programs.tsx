import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { EXERCISES, EQUIPMENT_LABELS } from '../data/exercises';
import { Avatar, Page, Pills, TypeChip } from '../ui';
import type { ExType } from '../types';

export default function Programs() {
  const s = useStore();
  const [lib, setLib] = useState<ExType | 'all'>('all');
  const clients = s.clients.filter((c) => !c.waitlist);
  return (
    <Page>
      <header className="topbar" style={{ paddingTop: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">Programs and next-week plans</span>
          <h1 className="title">Programs</h1>
        </div>
      </header>
      <section className="stack">
        {clients.map((c) => {
          const p = s.programs.find((x) => x.clientId === c.id);
          const plan = s.plans[c.id];
          return (
            <div key={c.id} className="card tight">
              <div className="row" style={{ gap: 12 }}>
                <Avatar client={c} />
                <div className="grow stack" style={{ gap: 0 }}>
                  <span className="semibold">{c.name}</span>
                  <span className="xs muted">{p ? `${p.name} · Block ${p.block} · ${p.days.map((d) => d.label).join('/')} · ${p.sessionMin} min` : 'No program yet'}</span>
                </div>
                {plan?.approved ? <span className="chip good">Week approved</span> : <span className="chip accent">Plan to review</span>}
              </div>
              <div className="btn-row">
                <Link to={`/builder/${c.id}`} className="btn sm">{p ? 'Edit program' : 'Design program'}</Link>
                <Link to={`/clients/${c.id}/plan`} className="btn sm primary">Next week <ChevronRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          );
        })}
      </section>
      <section className="card">
        <div className="row between baseline">
          <h2 className="h2">Exercise library</h2>
          <span className="xs muted">{EXERCISES.length} moves · no machines needed</span>
        </div>
        <Pills
          label="Filter library"
          options={[{ value: 'all', label: 'All' }, { value: 'cardio', label: 'Cardio' }, { value: 'strength', label: 'Strength' }, { value: 'core', label: 'Core' }]}
          value={lib}
          onChange={(v) => setLib(v as ExType | 'all')}
        />
        {EXERCISES.filter((e) => lib === 'all' || e.type === lib).map((e) => (
          <div key={e.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="grow stack" style={{ gap: 0 }}>
              <span className="small semibold">{e.name}</span>
              <span className="xs muted">
                {e.equipment.map((q) => EQUIPMENT_LABELS[q]).join(', ')}
                {e.avoidFor.length ? ` · avoid with ${e.avoidFor.join(', ')} issues` : ''}
              </span>
            </div>
            <TypeChip type={e.type} />
          </div>
        ))}
      </section>
    </Page>
  );
}

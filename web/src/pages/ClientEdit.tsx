import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { EXERCISES } from '../data/exercises';
import { FOCUS_ROTATION, generateDay } from '../engine/generator';
import { addDays, DOW_SHORT, uid } from '../lib/dates';
import { Back, Page, Pills, Switch } from '../ui';
import type { Client, Constraint, Equip, Objective, Program } from '../types';

const COLORS = ['#2747D6', '#1E6B3A', '#8A3608', '#7A2E8C', '#0E6E70', '#5B6470', '#A0275A'];
const CONSTRAINTS: Constraint[] = ['knee', 'shoulder', 'back', 'wrist'];
const KIT: Equip[] = ['ropes', 'dumbbells', 'kettlebell', 'stability-ball', 'med-ball', 'bodyweight', 'box'];

function blankClient(n: number): Client {
  return {
    id: uid('c'), name: '', heightIn: 66, weightLb: 160, startWeightLb: 160, since: new Date().toISOString(), frequency: 2,
    usualSlots: [], standing: false, flexibleWindow: '', contact: 'app', pushEnabled: false, objectives: [], constraints: [], notes: '', mods: [], color: COLORS[n % COLORS.length], packages: []
  };
}

export default function ClientEdit() {
  const { id } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const existing = s.clients.find((c) => c.id === id);
  const [c, setC] = useState<Client>(() => (existing ? structuredClone(existing) : blankClient(s.clients.length)));
  const [err, setErr] = useState('');
  const [firstPack, setFirstPack] = useState('10');
  const [firstPrice, setFirstPrice] = useState('');
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setC((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const save = () => {
    if (!c.name.trim()) {
      setErr('Add a name before saving.');
      return;
    }
    const packN = parseInt(firstPack, 10);
    const client: Client = {
      ...c,
      name: c.name.trim(),
      startWeightLb: existing ? c.startWeightLb : c.weightLb,
      packages: existing || !(packN > 0) ? c.packages ?? [] : [{ id: uid('pk'), date: new Date().toISOString(), sessions: packN, price: firstPrice ? Number(firstPrice) : undefined, note: `${packN}-session pack` }]
    };
    s.upsertClient(client);
    if (!s.programs.some((p) => p.clientId === client.id) && !client.waitlist) {
      const days = Math.max(2, Math.min(3, client.frequency));
      const program: Program = {
        id: uid('p'), clientId: client.id, name: 'Starter block', goal: 'Fat loss', format: 'circuit', daysPerWeek: client.frequency, sessionMin: 30, cardioMix: 40,
        equipment: KIT, block: 1, weeks: 6, start: new Date().toISOString(),
        days: Array.from({ length: days }, (_, i) =>
          generateDay({ goal: 'Fat loss', cardioMix: 40, equipment: KIT, constraints: client.constraints, mods: client.mods, focus: FOCUS_ROTATION[i], seed: Date.now() % 9973 + i, include: client.objectives.map((o) => o.exerciseId).filter(Boolean) as string[] }, String.fromCharCode(65 + i), uid('d'))
        )
      };
      s.saveProgram(program);
    }
    s.toast(existing ? 'Client updated' : 'Client added with a starter program');
    nav(`/clients/${client.id}`);
  };

  const setObj = (i: number, patch: Partial<Objective>) => set('objectives', c.objectives.map((o, k) => (k === i ? { ...o, ...patch } : o)));

  return (
    <Page tabs={false}>
      <div className="topbar">
        <Back label="Cancel" />
        <button type="button" className="btn sm primary" onClick={save}>Save</button>
      </div>
      <h1 className="title sm">{existing ? `Edit ${existing.name.split(' ')[0]}` : 'New client'}</h1>
      {err && <div className="banner warn" role="alert">{err}</div>}

      <section className="card">
        <h2 className="h2">Profile</h2>
        <div className="field"><label htmlFor="f-name">Name</label><input id="f-name" className="input" value={c.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="f-age">Age</label><input id="f-age" className="input" inputMode="numeric" value={c.age ?? ''} onChange={(e) => set('age', e.target.value ? num(e.target.value) : undefined)} /></div>
          <div className="field"><label htmlFor="f-freq">Sessions / week</label>
            <select id="f-freq" className="input" value={c.frequency} onChange={(e) => set('frequency', num(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="f-ft">Height (ft)</label><input id="f-ft" className="input" inputMode="numeric" value={Math.floor(c.heightIn / 12)} onChange={(e) => set('heightIn', num(e.target.value) * 12 + (c.heightIn % 12))} /></div>
          <div className="field"><label htmlFor="f-in">Height (in)</label><input id="f-in" className="input" inputMode="numeric" value={c.heightIn % 12} onChange={(e) => set('heightIn', Math.floor(c.heightIn / 12) * 12 + Math.min(11, num(e.target.value)))} /></div>
          <div className="field"><label htmlFor="f-w">Weight (lb)</label><input id="f-w" className="input" inputMode="decimal" value={c.weightLb} onChange={(e) => set('weightLb', num(e.target.value))} /></div>
          <div className="field"><label htmlFor="f-bf">Body fat % (optional)</label><input id="f-bf" className="input" inputMode="decimal" value={c.bodyFatPct ?? ''} onChange={(e) => set('bodyFatPct', e.target.value ? num(e.target.value) : undefined)} /></div>
        </div>
        <Switch on={!!c.waitlist} onToggle={() => set('waitlist', !c.waitlist)} title="On the waitlist" sub="Gets offered freed-up slots first" />
      </section>

      <section className="card">
        <h2 className="h2">Sessions</h2>
        {existing ? (
          <span className="small muted">Add new purchases from the Sessions card on the profile.</span>
        ) : (
          <div className="grid2">
            <div className="field"><label htmlFor="f-pack">Sessions purchased</label><input id="f-pack" className="input" inputMode="numeric" value={firstPack} onChange={(e) => setFirstPack(e.target.value.replace(/\D/g, ''))} /></div>
            <div className="field"><label htmlFor="f-price">Amount paid ($, optional)</label><input id="f-price" className="input" inputMode="decimal" value={firstPrice} onChange={(e) => setFirstPrice(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-prior">Sessions already done before FitnessAI</label>
          <input id="f-prior" className="input" inputMode="numeric" value={c.priorDone ?? 0} onChange={(e) => set('priorDone', num(e.target.value.replace(/\D/g, '')) || undefined)} />
          <span className="xs muted">Counts toward "Done", so pending stays correct for clients you trained before using the app.</span>
        </div>
      </section>

      <section className="card">
        <h2 className="h2">Limits</h2>
        <span className="small muted">The program builder avoids exercises that stress these.</span>
        <Pills
          label="Constraints"
          options={CONSTRAINTS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))}
          value={c.constraints}
          onChange={(k) => set('constraints', c.constraints.includes(k) ? c.constraints.filter((x) => x !== k) : [...c.constraints, k])}
        />
        <div className="field"><label htmlFor="f-notes">Notes</label><textarea id="f-notes" className="input" value={c.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </section>

      <section className="card">
        <div className="row between"><h2 className="h2">Objectives</h2>
          <button type="button" className="link-btn" onClick={() => set('objectives', [...c.objectives, { id: uid('o'), title: '', kind: 'bodyweight', unit: 'lb', start: c.weightLb, target: c.weightLb - 10, lowerIsBetter: true, deadline: addDays(new Date(), 90).toISOString(), history: [{ date: new Date().toISOString(), value: c.weightLb }] }])}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        </div>
        {!c.objectives.length && <span className="small muted">E.g. lose 15 lb, goblet squat 55 lb × 12, 5K under 32:00.</span>}
        {c.objectives.map((o, i) => (
          <div key={o.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="row">
              <div className="field grow"><label htmlFor={`o-t-${i}`}>Objective</label><input id={`o-t-${i}`} className="input" value={o.title} placeholder="e.g. Lose 15 lb" onChange={(e) => setObj(i, { title: e.target.value })} /></div>
              <button type="button" className="icon-btn" aria-label="Remove objective" style={{ alignSelf: 'flex-end' }} onClick={() => set('objectives', c.objectives.filter((_, k) => k !== i))}><Trash2 size={18} aria-hidden="true" /></button>
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor={`o-k-${i}`}>Type</label>
                <select id={`o-k-${i}`} className="input" value={o.kind} onChange={(e) => {
                  const kind = e.target.value as Objective['kind'];
                  setObj(i, { kind, unit: kind === 'bodyweight' || kind === 'lift' ? 'lb' : 'sec', lowerIsBetter: kind === 'bodyweight' || kind === 'time' });
                }}>
                  <option value="bodyweight">Body weight</option><option value="lift">Lift (load)</option><option value="time">Timed (lower is better)</option><option value="custom">Hold / reps (higher is better)</option>
                </select>
              </div>
              {o.kind === 'lift' ? (
                <div className="field"><label htmlFor={`o-e-${i}`}>Exercise</label>
                  <select id={`o-e-${i}`} className="input" value={o.exerciseId ?? ''} onChange={(e) => setObj(i, { exerciseId: e.target.value })}>
                    <option value="">Choose…</option>
                    {EXERCISES.filter((x) => x.loadLb !== undefined).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="field"><label htmlFor={`o-d-${i}`}>Deadline</label><input id={`o-d-${i}`} type="date" className="input" value={o.deadline.slice(0, 10)} onChange={(e) => setObj(i, { deadline: new Date(e.target.value + 'T12:00').toISOString() })} /></div>
              )}
              <div className="field"><label htmlFor={`o-s-${i}`}>Start ({o.unit})</label><input id={`o-s-${i}`} className="input" inputMode="decimal" value={o.start} onChange={(e) => setObj(i, { start: num(e.target.value) })} /></div>
              <div className="field"><label htmlFor={`o-g-${i}`}>Target ({o.unit})</label><input id={`o-g-${i}`} className="input" inputMode="decimal" value={o.target} onChange={(e) => setObj(i, { target: num(e.target.value) })} /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="row between"><h2 className="h2">Usual slots</h2>
          <button type="button" className="link-btn" onClick={() => set('usualSlots', [...c.usualSlots, { dow: 1, time: '07:30' }])}><Plus size={14} aria-hidden="true" /> Add</button>
        </div>
        {c.usualSlots.map((u, i) => (
          <div key={i} className="row">
            <label htmlFor={`u-d-${i}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Day</label>
            <select id={`u-d-${i}`} className="input" value={u.dow} onChange={(e) => set('usualSlots', c.usualSlots.map((x, k) => (k === i ? { ...x, dow: num(e.target.value) } : x)))}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DOW_SHORT[d]}</option>)}
            </select>
            <label htmlFor={`u-t-${i}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Time</label>
            <input id={`u-t-${i}`} type="time" step={900} className="input" value={u.time} onChange={(e) => set('usualSlots', c.usualSlots.map((x, k) => (k === i ? { ...x, time: e.target.value } : x)))} />
            <button type="button" className="icon-btn" aria-label="Remove slot" onClick={() => set('usualSlots', c.usualSlots.filter((_, k) => k !== i))}><Trash2 size={18} aria-hidden="true" /></button>
          </div>
        ))}
        <Switch on={c.standing} onToggle={() => set('standing', !c.standing)} title="Standing slot" sub="Auto-confirm every week unless the client changes it" />
        <div className="field"><label htmlFor="f-flex">Flexible window</label><input id="f-flex" className="input" value={c.flexibleWindow} placeholder="e.g. Weekdays 6–9 AM" onChange={(e) => set('flexibleWindow', e.target.value)} /></div>
        <div className="field"><label htmlFor="f-email">Email (client signs in to the app with it)</label><input id="f-email" className="input" type="email" inputMode="email" autoComplete="off" value={c.email ?? ''} onChange={(e) => set('email', e.target.value.trim().toLowerCase() || undefined)} /></div>
      </section>
      <button type="button" className="btn primary block" onClick={save}>Save client</button>
    </Page>
  );
}

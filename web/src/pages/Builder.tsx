import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { api, apiMode } from '../api';
import { EX, EQUIPMENT_LABELS, alternativesFor } from '../data/exercises';
import { FOCUS_ROTATION, applyMods, basePrescription, describePrescription, generateDay, roundSeconds } from '../engine/generator';
import { lastLoads } from '../engine/planner';
import { fmtClock, uid } from '../lib/dates';
import { Back, Empty, Page, Pills, Sheet, TypeChip } from '../ui';
import type { Equip, Goal, Program, ProgramDay } from '../types';

const GOALS: Goal[] = ['Fat loss', 'Strength', 'Muscle', 'Endurance', 'Mobility'];
const ALL_EQUIP: Equip[] = ['ropes', 'dumbbells', 'kettlebell', 'stability-ball', 'med-ball', 'bodyweight', 'box', 'machines'];
const FORMATS = [
  { value: '2', label: 'Circuit 4 × 2' },
  { value: '3', label: 'Circuit 4 × 3' }
];

export default function Builder() {
  const { clientId } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const client = s.clients.find((c) => c.id === clientId);
  const existing = s.programs.find((p) => p.clientId === clientId);
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? 'Fat loss');
  const [rounds, setRounds] = useState(String(existing?.days[0]?.circuits[0]?.rounds ?? 2));
  const [days, setDays] = useState(existing?.daysPerWeek ?? client?.frequency ?? 3);
  const [mix, setMix] = useState(existing?.cardioMix ?? 40);
  const [equip, setEquip] = useState<Equip[]>(existing?.equipment ?? ALL_EQUIP.filter((e) => e !== 'machines'));
  const [seed, setSeed] = useState(1);
  const [draft, setDraft] = useState<ProgramDay[] | null>(existing ? existing.days : null);
  const [dirty, setDirty] = useState(!existing);
  const [swap, setSwap] = useState<{ d: number; c: number; i: number } | null>(null);
  const [activeDay, setActiveDay] = useState(0);

  const loads = useMemo(() => lastLoads(s.logs.filter((l) => l.clientId === clientId)), [s.logs, clientId]);

  if (!client) return <Page><Back to="/clients" label="Clients" /><Empty title="Client not found" /></Page>;

  const generate = async (nextSeed = seed) => {
    if (apiMode) {
      try {
        const r = await api<{ days: ProgramDay[] }>('POST', '/api/programs/generate', { clientId: client.id, goal, cardioMix: mix, equipment: equip, days, rounds: Number(rounds), seed: nextSeed });
        setDraft(r.days);
        setDirty(true);
        setActiveDay(0);
      } catch (e) {
        s.toast(e instanceof Error ? e.message : 'Could not generate. Try again.');
      }
      return;
    }
    const n = Math.max(1, Math.min(3, days));
    const include = client.objectives.map((o) => o.exerciseId).filter(Boolean) as string[];
    const out = Array.from({ length: n }, (_, i) =>
      generateDay(
        { goal, cardioMix: goal === 'Endurance' ? Math.max(mix, 60) : mix, equipment: equip, constraints: client.constraints, mods: client.mods, focus: FOCUS_ROTATION[i], seed: nextSeed * 31 + i * 7, rounds: Number(rounds), include: i === 0 ? include : [], lastLoads: loads },
        String.fromCharCode(65 + i),
        uid('d')
      )
    );
    setDraft(out);
    setDirty(true);
    setActiveDay(0);
  };

  const save = () => {
    if (!draft) return;
    const program: Program = {
      id: uid('p'), clientId: client.id, name: `${goal} block`, goal, format: 'circuit', daysPerWeek: days, sessionMin: Number(rounds) === 3 ? 45 : 30,
      cardioMix: mix, equipment: equip, block: (existing?.block ?? 0) + (dirty ? 1 : 0) || 1, weeks: 6, start: new Date().toISOString(), days: draft
    };
    s.saveProgram(program);
    s.toast('Program saved');
    nav(`/clients/${client.id}`);
  };

  const doSwap = (toId: string) => {
    if (!draft || !swap) return;
    const to = EX[toId];
    const next = draft.map((d, di) =>
      di !== swap.d ? d : { ...d, circuits: d.circuits.map((c, ci) => (ci !== swap.c ? c : { ...c, items: c.items.map((p, ii) => (ii !== swap.i ? p : applyMods(basePrescription(to, goal, loads), client.mods, client.constraints))) })) }
    );
    setDraft(next);
    setDirty(true);
    setSwap(null);
  };

  const day = draft?.[activeDay];
  const modCount = client.mods.length;

  return (
    <Page>
      <div className="topbar"><Back to={`/clients/${client.id}`} label={client.name} /></div>
      <div className="stack" style={{ gap: 2 }}>
        <h1 className="title sm">Design session</h1>
        <span className="small muted">{existing ? `Current: ${existing.name} · Block ${existing.block}` : 'No program yet'}</span>
      </div>

      <section className="card loose">
        <div className="stack tight">
          <span className="label">Session format</span>
          <Pills options={FORMATS} value={rounds} onChange={setRounds} label="Session format" />
          <div className="grid4" style={{ gridTemplateColumns: `repeat(${Number(rounds) * 2}, minmax(0, 1fr))`, marginTop: 4 }}>
            {Array.from({ length: Number(rounds) * 2 }, (_, i) => {
              const a = i < Number(rounds);
              return (
                <div key={i} style={{ background: a ? 'var(--accent-soft)' : 'var(--warn-soft)', color: a ? 'var(--accent-ink)' : 'var(--warn-ink)', borderRadius: 10, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="xs semibold">Set {i + 1}</span>
                  <span className="display-num" style={{ fontSize: 20 }}>{a ? 'A' : 'B'}</span>
                  <span className="xs">{i % Number(rounds) === 0 ? (a ? 'Ex 1–4' : 'Ex 5–8') : 'repeat'}</span>
                </div>
              );
            })}
          </div>
          <span className="xs muted">{Number(rounds) * 2} sets × 7–8 min ≈ {Number(rounds) * 15} min</span>
        </div>
        <div className="stack tight">
          <span className="label">Primary goal</span>
          <Pills options={GOALS.map((g) => ({ value: g, label: g }))} value={goal} onChange={setGoal} label="Primary goal" />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="b-days">Days per week</label>
            <select id="b-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="b-mix">Cardio / strength: {mix} / {100 - mix}</label>
            <input id="b-mix" type="range" min={20} max={70} step={5} value={mix} onChange={(e) => setMix(Number(e.target.value))} style={{ accentColor: 'var(--accent)', minHeight: 44 }} />
          </div>
        </div>
        <div className="stack tight">
          <span className="label">Equipment</span>
          <Pills
            label="Equipment"
            options={ALL_EQUIP.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))}
            value={equip}
            onChange={(e) => setEquip(equip.includes(e) ? equip.filter((x) => x !== e) : [...equip, e])}
          />
        </div>
        <div className="stack tight">
          <span className="label">Pulled from profile</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {client.constraints.map((c) => <span key={c} className="tag warn">Avoid {c} stress</span>)}
            {modCount > 0 && <span className="tag warn">{modCount} saved modification{modCount > 1 ? 's' : ''}</span>}
            {client.objectives.filter((o) => o.exerciseId).map((o) => <span key={o.id} className="tag">Goal: {o.title}</span>)}
            {!client.constraints.length && !modCount && !client.objectives.some((o) => o.exerciseId) && <span className="small muted">Nothing yet.</span>}
          </div>
        </div>
        <button type="button" className="btn primary block" onClick={() => { const n = seed + 1; setSeed(n); generate(n); }}>
          <Sparkles size={18} aria-hidden="true" /> {draft ? 'Generate new draft' : 'Generate with AI'}
        </button>
      </section>

      {draft && day && (
        <section className="stack">
          <div className="row between baseline">
            <h2 className="h2">{dirty ? 'Draft' : 'Current program'} · {draft.length} day{draft.length > 1 ? 's' : ''}</h2>
            <span className="xs muted">Tap a row to swap</span>
          </div>
          {draft.length > 1 && (
            <div className="pills" role="tablist" aria-label="Program days">
              {draft.map((d, i) => (
                <button key={d.id} type="button" role="tab" aria-selected={i === activeDay} className="pill" aria-pressed={i === activeDay} onClick={() => setActiveDay(i)}>
                  Day {d.label} · {d.name}
                </button>
              ))}
            </div>
          )}
          {day.circuits.map((c, ci) => (
            <div key={c.label} className="card tight">
              <div className="row between">
                <span className="semibold">Circuit {c.label} · Sets {ci * c.rounds + 1}–{ci * c.rounds + c.rounds}</span>
                <span className="xs muted">~{fmtClock(roundSeconds(c))} / round</span>
              </div>
              {c.items.map((p, i) => {
                const e = EX[p.exerciseId];
                return (
                  <button key={i} type="button" className="list-row" onClick={() => setSwap({ d: activeDay, c: ci, i })} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', width: '100%', padding: '10px 0 0', cursor: 'pointer', alignItems: 'center' }}>
                    <span className="grow stack small" style={{ gap: 0 }}>
                      <span>{ci * 4 + i + 1} · {e?.name}</span>
                      {p.note && <span className="xs warn-text">{p.note}</span>}
                    </span>
                    <span className="small muted">{describePrescription(p)}</span>
                    {e && <TypeChip type={e.type} />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => { const n = seed + 1; setSeed(n); generate(n); }}>
              <RefreshCw size={16} aria-hidden="true" /> Regenerate
            </button>
            <button type="button" className="btn dark" onClick={save} disabled={!dirty}>
              {dirty ? 'Save program' : 'Saved'}
            </button>
          </div>
        </section>
      )}

      {swap && draft && (
        <SwapSheet
          exerciseId={draft[swap.d].circuits[swap.c].items[swap.i].exerciseId}
          constraints={client.constraints}
          equipment={equip}
          onPick={doSwap}
          onClose={() => setSwap(null)}
        />
      )}
    </Page>
  );
}

function SwapSheet({ exerciseId, constraints, equipment, onPick, onClose }: { exerciseId: string; constraints: string[]; equipment: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const alts = alternativesFor(exerciseId, constraints, equipment);
  return (
    <Sheet title={`Swap ${EX[exerciseId]?.name ?? ''}`} eyebrow="SAME MOVEMENT, SAFE FOR THIS CLIENT" onClose={onClose}>
      {!alts.length && <span className="small muted">No alternatives with this equipment.</span>}
      <div className="stack">
        {alts.slice(0, 8).map((e) => (
          <button key={e.id} type="button" className="card tight" style={{ flexDirection: 'row', alignItems: 'center' }} onClick={() => onPick(e.id)}>
            <span className="grow stack" style={{ gap: 0 }}>
              <span className="semibold">{e.name}</span>
              <span className="xs muted">{e.measure === 'time' ? `${e.sec} s` : `${e.reps}${e.perSide ? ' / side' : ''} reps`}{e.loadLb ? ` · from ${e.loadLb} lb` : ''}</span>
            </span>
            <TypeChip type={e.type} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

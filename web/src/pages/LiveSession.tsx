import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Pencil, RotateCcw } from 'lucide-react';
import { stepInfo, useStore } from '../store';
import { EX, alternativesFor } from '../data/exercises';
import { describePrescription } from '../engine/generator';
import { fmtClock } from '../lib/dates';
import { Pills, Sheet, Switch, TypeChip } from '../ui';
import type { ModKind } from '../types';

const KINDS: { value: ModKind; label: string }[] = [
  { value: 'swap', label: 'Swap exercise' },
  { value: 'easier', label: 'Easier variation' },
  { value: 'lighter', label: 'Lighter load' },
  { value: 'shorter', label: 'Shorter time / fewer reps' },
  { value: 'skip', label: 'Skip today' }
];
const REASONS = ['Knee', 'Shoulder', 'Back', 'Wrist', 'Low energy', 'Not comfortable'];

export default function LiveSession() {
  const s = useStore();
  const nav = useNavigate();
  const a = s.active;
  const [, tick] = useState(0);
  const [modOpen, setModOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!a) {
    return (
      <div className="live">
        <div className="live-body" style={{ paddingTop: 24 }}>
          <Link to="/" className="back"><ChevronLeft size={20} aria-hidden="true" />Today</Link>
          <h1 className="title">No session running</h1>
          <p className="muted">Start a session from Today or from a client's profile.</p>
        </div>
      </div>
    );
  }

  const client = s.clients.find((c) => c.id === a.clientId)!;
  const info = stepInfo(a);
  const totalSets = a.circuits.reduce((n, c) => n + c.rounds, 0);
  const total = a.circuits.reduce((n, c) => n + c.rounds * c.items.length, 0);
  const isLast = a.step === total - 1;
  const cur = info.circuit.items[info.item];
  const curEx = EX[cur.exerciseId];
  const elapsed = (Date.now() - a.startedAt) / 1000;
  const setElapsed = (Date.now() - a.setStartedAt) / 1000;

  let nextText = '';
  if (info.item < info.circuit.items.length - 1) nextText = `Up next: ${EX[info.circuit.items[info.item + 1].exerciseId]?.name}`;
  else if (info.round < info.circuit.rounds) nextText = `Up next: repeat Circuit ${info.circuit.label} (set ${info.setIndex + 2})`;
  else if (info.ci < a.circuits.length - 1) nextText = `Up next: Circuit ${a.circuits[info.ci + 1].label} starts with ${EX[a.circuits[info.ci + 1].items[0].exerciseId]?.name}`;
  else nextText = 'Last exercise of the session.';

  const sets: { label: string; state: 'done' | 'cur' | 'todo' }[] = [];
  let k = 0;
  a.circuits.forEach((c) => {
    for (let r = 0; r < c.rounds; r++) {
      sets.push({ label: `Set ${k + 1} · ${c.label}`, state: k < info.setIndex ? 'done' : k === info.setIndex ? 'cur' : 'todo' });
      k++;
    }
  });

  const loadField = cur.loadLb !== undefined && cur.loadLb > 0 ? 'loadLb' : cur.sec ? 'sec' : 'reps';
  const loadValue = loadField === 'loadLb' ? `${cur.loadLb} lb` : loadField === 'sec' ? `${cur.sec} s` : `${cur.reps}`;
  const loadSub = loadField === 'loadLb' ? `${cur.reps ?? ''}${cur.sec ? `${cur.sec} s` : ''}${curEx?.perSide ? ' / side' : cur.reps ? ' reps' : ''}` : loadField === 'sec' ? 'work time' : curEx?.perSide ? 'reps / side' : 'reps';
  const loadStep = loadField === 'loadLb' ? curEx?.loadStep ?? 5 : loadField === 'sec' ? 5 : 1;

  return (
    <div className="live">
      <header className="live-head">
        <div className="row between">
          <Link to="/" className="back"><ChevronLeft size={20} aria-hidden="true" />Exit</Link>
          <div className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
            <span className="display-num" style={{ fontSize: 26 }}>{fmtClock(elapsed)}</span>
            <span className="xs muted">of {s.settings.sessionMin}:00</span>
          </div>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="title sm">{client.name}</h1>
          <span className="small muted">
            {a.circuits.length} circuits × {a.circuits[0]?.rounds} sets · {a.circuits[0]?.items.length} exercises each
          </span>
        </div>
        <div className="grid4" style={{ gridTemplateColumns: `repeat(${totalSets}, minmax(0, 1fr))` }}>
          {sets.map((x) => (
            <div key={x.label} className="stack" style={{ gap: 6 }}>
              <div className={`seg ${x.state}`} />
              <span className="xs semibold" style={{ color: x.state === 'todo' ? '#8b94a3' : '#fff' }}>{x.label}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="live-body">
        <div className="row between baseline">
          <span className="small bold" style={{ letterSpacing: 0.6, color: 'var(--l-spark)' }}>
            SET {info.setIndex + 1} OF {totalSets} · CIRCUIT {info.circuit.label}
            {info.round > 1 ? ' · REPEAT' : ''}
          </span>
          <span className="small muted">
            Set time <b className="num" style={{ color: '#fff' }}>{fmtClock(setElapsed)}</b> / 7:30
          </span>
        </div>

        {info.circuit.items.map((p, i) => {
          const e = EX[p.exerciseId];
          const state = i < info.item ? 'done' : i === info.item ? 'cur' : '';
          const modText = a.todayMods[p.exerciseId] ?? (p.note?.includes('mod') || p.note?.includes('replaces') ? p.note : undefined);
          return (
            <div key={`${p.exerciseId}-${i}`} className={`ex-row ${state}`}>
              <div className="row" style={{ gap: 12 }}>
                <span className="ex-num">{state === 'done' ? '✓' : i + 1}</span>
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="semibold">{e?.name}</span>
                  <span className="small muted">{describePrescription(p)}</span>
                  {modText && (
                    <span className="mod-line">
                      <RotateCcw size={12} aria-hidden="true" />
                      {modText}
                    </span>
                  )}
                </div>
                {e && <TypeChip type={e.type} />}
              </div>
              {state === 'cur' && (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="stepper" aria-label="Decrease" onClick={() => s.adjustCurrent(loadField, -loadStep)}>−</button>
                    <div className="grow stack" style={{ alignItems: 'center', gap: 0 }}>
                      <span className="display-num">{loadValue}</span>
                      <span className="xs muted">{loadSub}</span>
                    </div>
                    <button type="button" className="stepper" aria-label="Increase" onClick={() => s.adjustCurrent(loadField, loadStep)}>+</button>
                  </div>
                  <button type="button" className="mod-btn" onClick={() => setModOpen(true)}>
                    <Pencil size={16} aria-hidden="true" />
                    Client not comfortable? Modify
                  </button>
                </>
              )}
            </div>
          );
        })}
        <span className="small muted" style={{ padding: '4px 2px' }}>{nextText}</span>
      </main>

      <footer className="live-foot">
        <button type="button" className="btn" onClick={() => s.stepSession(-1)} disabled={a.step === 0}>Back</button>
        {isLast ? (
          <button type="button" className="btn light" onClick={() => setFinishOpen(true)}>Finish &amp; log session</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => s.stepSession(1)}>Done · next exercise</button>
        )}
      </footer>

      {modOpen && <ModifySheet onClose={() => setModOpen(false)} />}
      {finishOpen && (
        <FinishSheet
          onClose={() => setFinishOpen(false)}
          onSave={(rpe, note) => {
            s.finishSession(rpe, note);
            nav(`/clients/${client.id}/history`);
          }}
          onDiscard={() => {
            s.discardSession();
            nav('/');
          }}
        />
      )}
    </div>
  );
}

function ModifySheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const a = s.active!;
  const client = s.clients.find((c) => c.id === a.clientId)!;
  const info = stepInfo(a);
  const cur = info.circuit.items[info.item];
  const program = s.programs.find((p) => p.clientId === client.id);
  const alts = useMemo(() => alternativesFor(cur.exerciseId, client.constraints, program?.equipment).slice(0, 6), [cur.exerciseId, client.constraints, program?.equipment]);
  const [kind, setKind] = useState<ModKind>('swap');
  const [swapTo, setSwapTo] = useState(alts[0]?.id ?? '');
  const [reason, setReason] = useState('Not comfortable');
  const [detail, setDetail] = useState('');
  const [remember, setRemember] = useState(true);

  const suggested =
    kind === 'swap' ? (EX[swapTo]?.name ?? '') : kind === 'shorter' ? (cur.sec ? `${Math.round((cur.sec * 0.75) / 5) * 5} s instead of ${cur.sec}` : 'fewer reps') : kind === 'lighter' ? 'lighter load' : kind === 'easier' ? 'easier variation' : 'skip this one';

  return (
    <Sheet title={EX[cur.exerciseId]?.name ?? 'Exercise'} eyebrow="MODIFY ON THE GO" onClose={onClose}>
      <div className="stack tight">
        <span className="label">What changed</span>
        <Pills options={KINDS} value={kind} onChange={setKind} label="What changed" />
      </div>
      {kind === 'swap' && (
        <div className="stack tight">
          <span className="label">Replace with</span>
          {alts.length ? (
            <Pills options={alts.map((e) => ({ value: e.id, label: e.name }))} value={swapTo} onChange={setSwapTo} label="Replacement" />
          ) : (
            <span className="small muted">No alternative in the library for this movement. Use "Easier variation" and describe it below.</span>
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor="mod-detail">Details</label>
        <input id="mod-detail" className="input" value={detail} placeholder={suggested ? `e.g. ${suggested}` : 'e.g. hands on bench'} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="stack tight">
        <span className="label">Why</span>
        <Pills options={REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} label="Reason" />
      </div>
      <Switch boxed on={remember} onToggle={() => setRemember(!remember)} title="Remember for next time" sub={`Applies automatically whenever this exercise comes up for ${client.name.split(' ')[0]}`} />
      <button
        type="button"
        className="btn primary block"
        onClick={() => {
          s.modifyCurrent({ kind, reason, detail: detail || suggested, swapToId: kind === 'swap' ? swapTo : undefined, remember });
          onClose();
        }}
      >
        Save modification
      </button>
    </Sheet>
  );
}

function FinishSheet({ onClose, onSave, onDiscard }: { onClose: () => void; onSave: (rpe: number, note: string) => void; onDiscard: () => void }) {
  const [rpe, setRpe] = useState(7);
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <Sheet title="Log this session" eyebrow="FINISH" onClose={onClose}>
      <div className="stack tight">
        <span className="label">How hard was it? (RPE 1–10)</span>
        <div className="grid5">
          {[5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" className="pill" aria-pressed={rpe === n} onClick={() => setRpe(n)}>
              {n}
            </button>
          ))}
        </div>
        <span className="xs muted">7 = challenging but with reps left. 9 = nearly maxed out. Used to decide next week's loads.</span>
      </div>
      <div className="field">
        <label htmlFor="sess-note">Note (optional)</label>
        <input id="sess-note" className="input" value={note} placeholder="e.g. Felt strong, slept well" onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="button" className="btn primary block" onClick={() => onSave(rpe, note)}>Save session</button>
      {confirmDiscard ? (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>Keep it</button>
          <button type="button" className="btn danger" onClick={onDiscard}>Discard session</button>
        </div>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setConfirmDiscard(true)}>Discard without logging</button>
      )}
    </Sheet>
  );
}

import type { AppState } from './store';
import { exName } from './data/exercises';
import { exerciseStatus, objectiveProgress } from './engine/planner';
import { addDays } from './lib/dates';
import { sessionBalance } from './lib/balance';

export interface Insight {
  tone: 'warn' | 'info';
  text: string;
  to: string;
}

type S = Pick<AppState, 'clients' | 'programs' | 'logs' | 'bookings' | 'plans'>;

export function clientFlags(s: S, clientId: string) {
  const c = s.clients.find((x) => x.id === clientId);
  const prog = s.programs.find((p) => p.clientId === clientId);
  const logs = s.logs.filter((l) => l.clientId === clientId);
  const flags: { kind: 'stall' | 'missed' | 'behind' | 'away' | 'low' | 'owes'; text: string }[] = [];
  if (!c) return flags;
  if (prog) {
    const ids = new Set(prog.days.flatMap((d) => d.circuits.flatMap((ci) => ci.items.map((p) => p.exerciseId))));
    for (const id of ids) {
      const st = exerciseStatus(logs, id);
      if (st.kind === 'stall') flags.push({ kind: 'stall', text: `${exName(id)} stuck at ${st.load} lb` });
    }
  }
  const since = addDays(new Date(), -14).toISOString();
  const recent = logs.filter((l) => l.date >= since);
  const missed = recent.filter((l) => l.status === 'missed').length;
  if (missed >= 2) flags.push({ kind: 'missed', text: `Missed ${missed} of last ${recent.length}` });
  for (const o of c.objectives) {
    const p = objectiveProgress(o);
    if (p.status === 'behind') flags.push({ kind: 'behind', text: `${o.title}: behind` });
  }
  if (c.away && new Date(c.away.to) >= new Date()) flags.push({ kind: 'away', text: 'Away soon' });
  const bal = sessionBalance(s, clientId);
  if (bal.owes) flags.push({ kind: 'owes', text: `Owes ${bal.owes} session${bal.owes > 1 ? 's' : ''}` });
  else if (bal.low) flags.push({ kind: 'low', text: `${bal.pending} session${bal.pending === 1 ? '' : 's'} left` });
  return flags;
}

export function insights(s: S): Insight[] {
  const out: Insight[] = [];
  for (const c of s.clients.filter((x) => !x.waitlist)) {
    const first = c.name.split(' ')[0];
    for (const f of clientFlags(s, c.id)) {
      if (f.kind === 'stall') out.push({ tone: 'warn', text: `${first}'s ${f.text.charAt(0).toLowerCase() + f.text.slice(1)} for 3+ sessions. A tempo variation is in next week's plan.`, to: `/clients/${c.id}/plan` });
      if (f.kind === 'missed') out.push({ tone: 'warn', text: `${first} ${f.text.toLowerCase()} sessions. Consider a check-in.`, to: `/clients/${c.id}/history` });
      if (f.kind === 'low') out.push({ tone: 'warn', text: `${first} has ${f.text}. Time to renew the package.`, to: `/clients/${c.id}` });
      if (f.kind === 'owes') out.push({ tone: 'warn', text: `${first} has done more sessions than purchased (${f.text.toLowerCase()}).`, to: `/clients/${c.id}` });
      if (f.kind === 'behind') out.push({ tone: 'warn', text: `${first}: ${f.text.toLowerCase()} schedule.`, to: `/clients/${c.id}/progress` });
    }
  }
  const needs = s.bookings.filter((b) => b.status === 'needs-you' && new Date(b.start) > new Date()).length;
  if (needs) out.push({ tone: 'warn', text: `${needs} scheduling ${needs === 1 ? 'request needs' : 'requests need'} your choice.`, to: '/schedule/replies' });
  const toReview = s.clients.filter((c) => !c.waitlist && !s.plans[c.id]?.approved).length;
  if (toReview) out.push({ tone: 'info', text: `${toReview} clients have next-week plans ready to review.`, to: '/programs' });
  return out;
}

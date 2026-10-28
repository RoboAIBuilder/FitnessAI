import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronLeft, MessageSquare, Share, Smartphone } from 'lucide-react';
import { slotsFor, useStore } from '../store';
import { apiMode, subscribePush } from '../api';
import { addDays, DOW_SHORT, fmtDay, fmtTime, hhmm, sameDay, startOfDay } from '../lib/dates';
import { isIOS, isStandalone, notificationPermission, requestNotifications, showLocalNotification } from '../lib/notify';
import { Page, Switch } from '../ui';
import { sessionBalance } from '../lib/balance';

export default function Booking() {
  const { clientId } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const client = s.clients.find((c) => c.id === clientId) ?? s.clients[0];
  const isClient = s.role === 'client';
  const today = startOfDay(new Date());
  const days = Array.from({ length: s.settings.bookAheadDays }, (_, i) => addDays(today, i + 1)).filter((d) => (s.availability[d.getDay()] ?? []).length);
  const pending = s.bookings.find((b) => b.clientId === client.id && (b.status === 'awaiting' || b.status === 'needs-you') && new Date(b.start) > new Date());
  const lastOut = [...s.messages].filter((m) => m.clientId === client.id && m.dir === 'out').sort((a, b) => b.at.localeCompare(a.at))[0];
  const mine = s.bookings
    .filter((b) => b.clientId === client.id && b.status === 'confirmed' && new Date(b.start) > new Date())
    .sort((a, b) => a.start.localeCompare(b.start));

  const bal = sessionBalance(s, client.id);
  const [dayIdx, setDayIdx] = useState(() => {
    const i = pending ? days.findIndex((d) => sameDay(d, new Date(pending.start))) : -1;
    return i >= 0 ? i : 0;
  });
  const day = days[dayIdx] ?? days[0];
  const slots = useMemo(() => (day ? slotsFor(s, day, pending?.id) : []), [s, day, pending?.id]);
  const usual = client.usualSlots.find((u) => day && u.dow === day.getDay());
  const offered = new Set(pending?.offered ?? []);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick && slots.some((t) => t.toISOString() === pick) ? pick : (slots.find((t) => offered.has(t.toISOString())) ?? slots.find((t) => usual && hhmm(t) === usual.time) ?? slots[0])?.toISOString() ?? null;
  const [makeUsual, setMakeUsual] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState(false);
  const [notifyState, setNotifyState] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    const r = await s.clientAccept(client.id, chosen, pending && sameDay(new Date(pending.start), new Date(chosen)) ? pending.id : undefined);
    setBusy(false);
    if (!r.ok) {
      setError(r.reason ?? 'That time is no longer available.');
      return;
    }
    if (note.trim()) s.addClientMessage(client.id, note.trim());
    if (makeUsual) {
      const t = new Date(chosen);
      s.upsertClient({ ...client, usualSlots: [...client.usualSlots.filter((u) => u.dow !== t.getDay()), { dow: t.getDay(), time: hhmm(t) }] });
    }
    setDone(chosen);
    setError('');
    setNote('');
  };

  const enablePush = async () => {
    const before = notificationPermission();
    const p = before === 'granted' ? 'granted' : await requestNotifications();
    if (p === 'granted') {
      s.setPush(client.id, true, apiMode ? await subscribePush() : undefined);
      const shown = await showLocalNotification('FitnessAI', `Reminders are on, ${client.name.split(' ')[0]}. You'll get one ${s.settings.reminderHours} h before each session.`);
      setNotifyState(shown ? 'on' : 'on-silent');
    } else if (p === 'unsupported') {
      s.setPush(client.id, true);
      setNotifyState('preview');
    } else {
      setNotifyState('denied');
    }
  };

  return (
    <Page tabs={false}>
      {!isClient && (<>
      <div className="banner" role="note">
        <Smartphone size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span className="grow">
          Client's view: what this client sees on their phone.{' '}
          <label htmlFor="as-client">Viewing as </label>
          <select id="as-client" value={client.id} onChange={(e) => nav(`/book/${e.target.value}`)} style={{ border: 0, background: 'transparent', color: 'inherit', fontWeight: 700, textDecoration: 'underline', padding: 0, fontSize: 13 }}>
            {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </span>
      </div>
      <Link to="/schedule" className="back"><ChevronLeft size={20} aria-hidden="true" />Back to trainer view</Link>
      </>)}

      {lastOut && (
        <div className="card tight" style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <span className="avatar" style={{ background: 'var(--accent)', borderRadius: 10, width: 36, height: 36 }}>
            {lastOut.channel === 'push' ? <Bell size={18} aria-hidden="true" /> : <MessageSquare size={18} aria-hidden="true" />}
          </span>
          <span className="grow stack" style={{ gap: 2 }}>
            <span className="xs muted">{lastOut.channel === 'push' ? 'Notification' : 'Message'} from FitnessAI · {fmtDay(lastOut.at)} {fmtTime(lastOut.at)}</span>
            <span className="small">{lastOut.body}</span>
          </span>
        </div>
      )}

      {done ? (
        <section className="card" style={{ alignItems: 'flex-start' }}>
          <CheckCircle2 size={28} aria-hidden="true" color="var(--good-ink)" />
          <h1 className="title sm">You're booked</h1>
          <span>{fmtDay(done)} at {fmtTime(done)} · {s.settings.sessionMin} min · YMCA</span>
          <span className="small muted">Your coach's schedule updated instantly. Reminder {s.settings.reminderHours} h before.</span>
          <button type="button" className="btn sm" onClick={() => setDone(null)}>Book another</button>
        </section>
      ) : (
        <>
          <div className="stack" style={{ gap: 2 }}>
            <h1 className="title sm">Book your next session</h1>
            <span className="small muted">{s.settings.sessionMin} min · YMCA · only open times are shown</span>
          </div>
          {bal.hasPackages && (
            <div className={`banner${bal.low || bal.owes ? ' warn' : ''}`}>
              <span className="grow">
                {bal.owes
                  ? <>You've used <b>{bal.owes}</b> more session{bal.owes > 1 ? 's' : ''} than purchased. Please renew with your coach.</>
                  : <>You have <b>{bal.pending}</b> of {bal.purchased} sessions left{bal.booked ? ` (${bal.booked} booked)` : ''}.{bal.low ? ' Time to renew soon.' : ''}</>}
              </span>
            </div>
          )}

          {pending?.offered && pending.offered.length > 0 && (
            <section className="card focus">
              <span className="semibold">Your coach offered:</span>
              <div className="stack tight">
                {pending.offered.map((o) => (
                  <button key={o} type="button" className="btn" onClick={() => { const i = days.findIndex((d) => sameDay(d, new Date(o))); if (i >= 0) setDayIdx(i); setPick(o); }}>
                    {fmtDay(o)} · {fmtTime(o)}
                  </button>
                ))}
              </div>
              {declining ? (
                <form className="stack tight" onSubmit={(e) => { e.preventDefault(); s.clientDecline(pending.id, note.trim() || "These times don't work for me."); setDeclining(false); setNote(''); }}>
                  <label htmlFor="dec-note" className="label">Tell your coach what works</label>
                  <input id="dec-note" className="input" value={note} placeholder="e.g. Any evening after 6" onChange={(e) => setNote(e.target.value)} />
                  <button type="submit" className="btn sm primary">Send</button>
                </form>
              ) : (
                <button type="button" className="link-btn" onClick={() => setDeclining(true)}>None of these work</button>
              )}
            </section>
          )}

          <div className="cal-strip" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 6)}, minmax(0, 1fr))` }}>
            {days.slice(0, 6).map((d, i) => (
              <button key={i} type="button" className="day-btn" aria-pressed={i === dayIdx} onClick={() => { setDayIdx(i); setPick(null); }}>
                <span className="w">{DOW_SHORT[d.getDay()]}</span>
                <span className="d">{d.getDate()}</span>
              </button>
            ))}
          </div>

          <section className="stack tight">
            <span className="label">Open times</span>
            {!slots.length && <span className="small muted">Fully booked this day. Try another.</span>}
            <div className="grid3">
              {slots.map((t) => {
                const iso = t.toISOString();
                const star = usual && hhmm(t) === usual.time;
                return (
                  <button key={iso} type="button" className="slot-btn" aria-pressed={chosen === iso} onClick={() => setPick(iso)}>
                    <span className="semibold num">{fmtTime(t)}</span>
                    <span className="xs">{offered.has(iso) ? 'offered' : star ? '★ your usual' : ' '}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <Switch boxed on={makeUsual} onToggle={() => setMakeUsual(!makeUsual)} title="Make this my usual time" sub="Your coach's app will hold it for you each week" />
          {!declining && (
            <div className="field">
              <label htmlFor="b-note">Note for your coach (optional)</label>
              <input id="b-note" className="input" value={note} placeholder="e.g. Away Nov 4–6" onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          {error && <div className="banner warn" role="alert">{error}</div>}
          <button type="button" className="btn primary block" disabled={!chosen} onClick={confirm}>
            {chosen ? `Confirm ${fmtDay(chosen)} · ${fmtTime(chosen)}` : 'Pick a time'}
          </button>
        </>
      )}

      <section className="card">
        <h2 className="h2">Get reminders as app notifications</h2>
        {client.pushEnabled ? (
          <span className="small">Notifications are on. Invites and reminders from your coach arrive as notifications.</span>
        ) : (
          <>
            {!isStandalone() && (
              <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {isIOS() ? (
                  <>
                    <li>Tap <Share size={14} aria-label="Share" style={{ verticalAlign: '-2px' }} /> in Safari, then <b>Add to Home Screen</b>.</li>
                    <li>Open FitnessAI from your Home Screen.</li>
                    <li>Tap <b>Turn on reminders</b> below.</li>
                  </>
                ) : (
                  <>
                    <li>Tap <b>Install app</b> in your browser menu (or Add to Home screen).</li>
                    <li>Open FitnessAI from your Home Screen.</li>
                    <li>Tap <b>Turn on reminders</b> below.</li>
                  </>
                )}
              </ol>
            )}
            <button type="button" className="btn block" onClick={enablePush}>
              <Bell size={16} aria-hidden="true" /> Turn on reminders
            </button>
          </>
        )}
        {notifyState === 'on' && <span className="small good-text">Reminders on. A test notification was sent to this device.</span>}
        {notifyState === 'on-silent' && <span className="small good-text">Reminders on.</span>}
        {notifyState === 'preview' && <span className="small muted">This preview can't show device notifications. In the installed app, your phone asks for permission here. Switched this client to app notifications for the demo.</span>}
        {notifyState === 'denied' && <span className="small warn-text">Notifications are blocked. You'll still see updates when you open the app. You can allow notifications later in your phone's settings.</span>}
        {client.pushEnabled && (
          <button type="button" className="link-btn" onClick={() => { s.setPush(client.id, false); setNotifyState(''); }}>Turn off notifications</button>
        )}
      </section>

      {mine.length > 0 && (
        <section className="card">
          <h2 className="h2">Your upcoming sessions</h2>
          {mine.map((b) => (
            <div key={b.id} className="list-row small"><span className="grow">{fmtDay(b.start)}</span><span className="semibold num">{fmtTime(b.start)}</span></div>
          ))}
        </section>
      )}
    </Page>
  );
}

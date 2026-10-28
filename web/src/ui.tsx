import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, Dumbbell, Home, TrendingUp, Users, X } from 'lucide-react';
import { useStore } from './store';
import type { Client, ExType } from './types';

export function Page({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return <main className={`page${tabs ? '' : ' no-tabs'}`}>{children}</main>;
}

export function Back({ to, label }: { to?: string; label: string }) {
  const nav = useNavigate();
  return to ? (
    <Link to={to} className="back">
      <ChevronLeft size={20} aria-hidden="true" />
      {label}
    </Link>
  ) : (
    <button type="button" className="back" onClick={() => nav(-1)}>
      <ChevronLeft size={20} aria-hidden="true" />
      {label}
    </button>
  );
}

export function TabBar() {
  const needsYou = useStore((s) => s.bookings.filter((b) => b.status === 'needs-you' && new Date(b.start) > new Date()).length);
  const tabs = [
    { to: '/', label: 'Today', icon: Home, end: true },
    { to: '/schedule', label: 'Schedule', icon: CalendarDays, badge: needsYou },
    { to: '/clients', label: 'Clients', icon: Users },
    { to: '/programs', label: 'Programs', icon: Dumbbell },
    { to: '/progress', label: 'Progress', icon: TrendingUp }
  ];
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <t.icon size={22} strokeWidth={2} aria-hidden="true" />
            {t.label}
            {t.badge ? <span className="badge" aria-label={`${t.badge} need you`}>{t.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Sheet({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <div className="stack tight" style={{ gap: 2 }}>
            {eyebrow && <span className="xs semibold muted" style={{ letterSpacing: 0.6 }}>{eyebrow}</span>}
            <h2 style={{ fontSize: 19, fontWeight: 700 }}>{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose} style={{ borderRadius: 22, border: 0, background: 'var(--surface-2)' }}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ on, onToggle, title, sub, boxed }: { on: boolean; onToggle: () => void; title: string; sub?: string; boxed?: boolean }) {
  return (
    <button type="button" className={`switch-row${boxed ? ' boxed' : ''}`} aria-pressed={on} onClick={onToggle}>
      <span className="grow stack" style={{ gap: 2 }}>
        <span className="semibold" style={{ fontSize: 14 }}>{title}</span>
        {sub && <span className="xs muted">{sub}</span>}
      </span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

export function Pills<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | T[]; onChange: (v: T) => void; label?: string }) {
  const sel = Array.isArray(value) ? value : [value];
  return (
    <div className="pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="pill" aria-pressed={sel.includes(o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Avatar({ client, lg }: { client: Pick<Client, 'name' | 'color'>; lg?: boolean }) {
  return (
    <span className={`avatar${lg ? ' lg' : ''}`} style={{ background: client.color }} aria-hidden="true">
      {initials(client.name)}
    </span>
  );
}

export function TypeChip({ type }: { type: ExType }) {
  const label = type === 'cardio' ? 'Cardio' : type === 'strength' ? 'Strength' : 'Core';
  return <span className={`chip ${type}`}>{label}</span>;
}

export function Progress({ frac, warn }: { frac: number; warn?: boolean }) {
  return (
    <div className={`progress${warn ? ' warn' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <div style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%` }} />
    </div>
  );
}

export function Bars({ values, label, highlightLast, warnFrom, min, max }: { values: number[]; label: string; highlightLast?: boolean; warnFrom?: number; min?: number; max?: number }) {
  if (!values.length) return <p className="small muted">No data yet.</p>;
  const lo = min ?? Math.min(...values) - (Math.max(...values) - Math.min(...values) || 10) * 0.6;
  const hi = max ?? Math.max(...values);
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = hi === lo ? 60 : 8 + ((v - lo) / (hi - lo)) * 92;
        const cls = warnFrom !== undefined && i >= warnFrom ? 'warn' : highlightLast && i === values.length - 1 ? 'hi' : '';
        return <div key={i} className={cls} style={{ height: `${h}%` }} title={String(v)} />;
      })}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card ghost" style={{ alignItems: 'flex-start' }}>
      <span className="semibold">{title}</span>
      {children && <span className="small muted">{children}</span>}
    </div>
  );
}

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60000);
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Monday of the week containing d */
export const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  const diff = (s.getDay() + 6) % 7;
  return addDays(s, -diff);
};

export const atTime = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = startOfDay(day);
  d.setHours(h, m, 0, 0);
  return d;
};

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const minutesOf = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const fmtTime = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  let h = x.getHours();
  const m = x.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};
export const fmtTimeShort = (d: Date | string) => fmtTime(d).replace(' AM', '').replace(' PM', '');
export const ampm = (d: Date | string) => ((typeof d === 'string' ? new Date(d) : d).getHours() >= 12 ? 'PM' : 'AM');

export const fmtHHMM = (s: string) => fmtTime(atTime(new Date(), s));

export const fmtDay = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${DOW_SHORT[x.getDay()]}, ${MONTHS[x.getMonth()]} ${x.getDate()}`;
};
export const fmtMonthDay = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
};
export const fmtMonthYear = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

export const relDay = (d: Date | string, now = new Date()) => {
  const x = startOfDay(typeof d === 'string' ? new Date(d) : d);
  const diff = Math.round((x.getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return fmtDay(x);
};

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtAgo = (iso: string, now = new Date()) => {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDay(iso);
};

let counter = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

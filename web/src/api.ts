// Connection to the Python API (FastAPI). Without VITE_API_URL the app runs as the offline demo.
declare const __DEMO__: boolean;

const env = import.meta.env as Record<string, string | undefined>;
export const API_URL = (env.VITE_API_URL ?? '').replace(/\/$/, '');
export const apiMode = !__DEMO__ && !!API_URL;

// Supabase Auth (email code sign-in). Leave unset for local development (AUTH_MODE=dev on the API).
const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';
export const authEnabled = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const TOKEN_KEY = 'fitnessai.session';
interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
function writeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function supabase(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.msg || data.error_description || 'Sign-in failed. Try again.');
  return data;
}

/** Email a 6-digit sign-in code. */
export async function sendCode(email: string) {
  await supabase('otp', { email, create_user: true });
}

/** Exchange the code for a session. */
export async function verifyCode(email: string, token: string) {
  const d = await supabase('verify', { type: 'email', email, token });
  writeSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600) });
}

export function signOut() {
  writeSession(null);
}

async function accessToken(): Promise<string | null> {
  if (!authEnabled) return null;
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try {
    const d = await supabase('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    const next = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + 3600 };
    writeSession(next);
    return next.access_token;
  } catch {
    writeSession(null);
    return null;
  }
}

/** Local development only: act as a client, e.g. localStorage 'fitnessai.devClient' = 'c-priya'. */
function devClient(): string | null {
  try {
    return localStorage.getItem('fitnessai.devClient') || env.VITE_DEV_CLIENT || null;
  } catch {
    return env.VITE_DEV_CLIENT || null;
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const dc = !authEnabled ? devClient() : null;
  if (dc) headers['X-Dev-Client'] = dc;
  const r = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, typeof data.detail === 'string' ? data.detail : 'Something went wrong. Try again.');
  return normalize(data) as T;
}

// The server writes "2026-10-26T11:30:00Z"; the app compares ISO strings, so give every
// timestamp the same shape as Date.toISOString() ("…T11:30:00.000Z").
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
export function normalize(v: unknown): unknown {
  if (typeof v === 'string') return ISO.test(v) ? new Date(v).toISOString() : v;
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  return v;
}

/** Subscribe this device to Web Push and return the subscription to store on the server. */
export async function subscribePush(): Promise<PushSubscriptionJSON | null> {
  try {
    const { publicKey } = await api<{ publicKey: string | null }>('GET', '/api/push/key');
    if (!publicKey || !('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.ready;
    const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    return sub.toJSON();
  } catch {
    return null;
  }
}

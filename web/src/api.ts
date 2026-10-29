// Connection to the Python API (FastAPI). Without VITE_API_URL the app runs as the offline demo.
declare const __DEMO__: boolean;

const env = import.meta.env as Record<string, string | undefined>;
export const API_URL = (env.VITE_API_URL ?? '').replace(/\/$/, '');
export const apiMode = !__DEMO__ && !!API_URL;

// Sign-in: the trainer and each client have a code. The server returns a session token kept on this device.
const TOKEN_KEY = 'fitnessai.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}
let memoryToken: string | null = null;
function writeToken(t: string | null) {
  memoryToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: token lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Sign in with a code (trainer code, or the client's own code). */
export async function signIn(code: string) {
  const r = await api<{ token: string; role: 'trainer' | 'client'; clientId: string | null }>('POST', '/api/auth/login', { code });
  writeToken(r.token);
  return r;
}

export function signOut() {
  writeToken(null);
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
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const dc = devClient();
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

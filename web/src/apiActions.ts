// When connected to the Python API, these replace the store's on-device actions.
// Each call returns the caller's fresh state from the server, which replaces local data.
import { api, ApiError, apiMode } from './api';
import { buildLog, useStore, type AppState } from './store';
import { sessionBalance } from './lib/balance';

type Snapshot = Partial<AppState> & { role?: 'trainer' | 'client'; me?: string | null };

function apply(snap: Snapshot) {
  useStore.setState({ ...snap, loaded: true, authNeeded: false, apiError: undefined });
}

function fail(e: unknown) {
  const st = useStore.getState();
  if (e instanceof ApiError && e.status === 401) {
    useStore.setState({ authNeeded: true, loaded: true });
    return;
  }
  const text = e instanceof Error ? e.message : 'Something went wrong. Try again.';
  if (!st.loaded) useStore.setState({ apiError: text, loaded: true });
  else st.toast(text);
}

async function call(method: string, path: string, body?: unknown, done?: (s: AppState) => string | void) {
  try {
    apply(await api<Snapshot>(method, path, body));
    const t = done?.(useStore.getState());
    if (t) useStore.getState().toast(t);
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

const first = (s: AppState, id: string) => s.clients.find((c) => c.id === id)?.name.split(' ')[0] ?? 'Client';

export function installApiActions() {
  if (!apiMode) return;
  const get = useStore.getState;
  useStore.setState({
    load: async () => {
      await call('GET', '/api/state');
    },
    reset: () => void call('POST', '/api/demo/reset', undefined, () => 'Demo data reset'),
    upsertClient: (c) => void call('PUT', `/api/clients/${c.id}`, c),
    saveMod: (clientId, mod) => void call('POST', `/api/clients/${clientId}/mods`, mod),
    removeMod: (clientId, exerciseId) => void call('DELETE', `/api/clients/${clientId}/mods/${encodeURIComponent(exerciseId)}`),
    addMeasurement: (clientId, objectiveId, value) => void call('POST', `/api/clients/${clientId}/measurements`, { objectiveId, value }),
    addPackage: (clientId, sessions, price, note) =>
      void call('POST', `/api/clients/${clientId}/packages`, { sessions, price, note }, (s) => {
        const b = sessionBalance(s, clientId);
        return `Added ${sessions} sessions · ${b.owes ? `still owes ${b.owes}` : `${b.pending} pending`}`;
      }),
    removePackage: (clientId, packageId) => void call('DELETE', `/api/clients/${clientId}/packages/${packageId}`),
    saveProgram: (p) => void call('PUT', `/api/programs/${p.clientId}`, p),
    finishSession: (rpe, note) => {
      const s = get();
      const a = s.active;
      if (!a) return null;
      const log = buildLog(s, a, rpe, note);
      useStore.setState({ active: null, logs: [...s.logs, log] });
      void call('POST', '/api/sessions', { log, bookingId: a.bookingId }, (st) => {
        const b = sessionBalance(st, a.clientId);
        return !b.hasPackages ? 'Session logged' : b.owes ? `Session logged · owes ${b.owes}` : `Session logged · ${b.pending} left`;
      });
      return log.id;
    },
    markMissed: (bookingId, reason) => void call('POST', `/api/bookings/${bookingId}/missed`, { reason }),
    buildPlan: (clientId) => {
      void call('POST', `/api/clients/${clientId}/plan`);
      return get().plans[clientId] ?? null;
    },
    approvePlan: (clientId) => void call('POST', `/api/clients/${clientId}/plan/approve`, undefined, (s) => `Plan approved and sent to ${first(s, clientId)}`),
    planAndRemind: async () => {
      try {
        const r = await api<{ result: { invites: number; reminders: number }; state: Snapshot }>('POST', '/api/schedule/run');
        apply(r.state);
        return r.result;
      } catch (e) {
        fail(e);
        return { invites: 0, reminders: 0 };
      }
    },
    clientAccept: async (clientId, startISO, bookingId) => {
      try {
        apply(await api<Snapshot>('POST', `/api/clients/${clientId}/book`, { start: startISO, bookingId }));
        return { ok: true };
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) return { ok: false, reason: e.message };
        fail(e);
        return { ok: false, reason: e instanceof Error ? e.message : undefined };
      }
    },
    clientDecline: (bookingId, text) => void call('POST', `/api/bookings/${bookingId}/decline`, { text }),
    trainerOffer: (bookingId, startISO) => {
      const cid = get().bookings.find((b) => b.id === bookingId)?.clientId ?? '';
      void call('POST', `/api/bookings/${bookingId}/offer`, { start: startISO }, (s) => `Offer sent to ${first(s, cid)}`);
    },
    trainerSkip: (bookingId) => void call('POST', `/api/bookings/${bookingId}/skip`, undefined, () => 'Session skipped and client told'),
    offerOpenSlot: (clientId, startISO) => void call('POST', '/api/slots/offer', { clientId, start: startISO }, (s) => `Offered to ${first(s, clientId)}`),
    cancelBooking: (bookingId) => void call('POST', `/api/bookings/${bookingId}/cancel`, undefined, () => 'Cancelled'),
    simulateReplies: async () => {
      try {
        const r = await api<{ count: number; state: Snapshot }>('POST', '/api/demo/simulate-replies');
        apply(r.state);
        return r.count;
      } catch (e) {
        fail(e);
        return 0;
      }
    },
    setAvailability: (a) => {
      useStore.setState({ availability: a });
      void call('PUT', '/api/availability', a);
    },
    setAutomation: (patch) => {
      const settings = { ...get().settings, automation: { ...get().settings.automation, ...patch } };
      useStore.setState({ settings });
      void call('PUT', '/api/settings', settings);
    },
    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      useStore.setState({ settings });
      void call('PUT', '/api/settings', settings);
    },
    setPush: (clientId, enabled, subscription) => void call('POST', `/api/clients/${clientId}/push`, { enabled, subscription }),
    addClientMessage: (clientId, body) => void call('POST', `/api/clients/${clientId}/messages`, { body })
  });
}

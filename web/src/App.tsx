import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar, Toasts } from './ui';
import { useStore } from './store';
import { apiMode } from './api';
import Today from './pages/Today';
import LiveSession from './pages/LiveSession';
import Clients from './pages/Clients';
import ClientLayout, { ClientHistory, ClientOverview, ClientPlan, ClientProgress } from './pages/ClientDetail';
import ClientEdit from './pages/ClientEdit';
import Builder from './pages/Builder';
import Programs from './pages/Programs';
import ProgressAll from './pages/ProgressAll';
import Schedule from './pages/Schedule';
import Replies from './pages/Replies';
import Availability from './pages/Availability';
import Booking from './pages/Booking';
import Login from './pages/Login';

function TrainerShell() {
  const loc = useLocation();
  const hideTabs = loc.pathname.startsWith('/session') || loc.pathname.startsWith('/book') || loc.pathname === '/clients/new' || loc.pathname.endsWith('/edit');
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/session" element={<LiveSession />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<ClientEdit />} />
        <Route path="/clients/:id/edit" element={<ClientEdit />} />
        <Route path="/clients/:id" element={<ClientLayout />}>
          <Route index element={<ClientOverview />} />
          <Route path="history" element={<ClientHistory />} />
          <Route path="progress" element={<ClientProgress />} />
          <Route path="plan" element={<ClientPlan />} />
        </Route>
        <Route path="/builder/:clientId" element={<Builder />} />
        <Route path="/programs" element={<Programs />} />
        <Route path="/progress" element={<ProgressAll />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/schedule/replies" element={<Replies />} />
        <Route path="/schedule/settings" element={<Availability />} />
        <Route path="/book/:clientId" element={<Booking />} />
        <Route path="*" element={<Today />} />
      </Routes>
      {!hideTabs && <TabBar />}
      <Toasts />
    </div>
  );
}

/** A signed-in client only ever sees their own booking page. */
function ClientShell({ me }: { me: string }) {
  return (
    <div className="app">
      <Routes>
        <Route path="/book/:clientId" element={<Booking />} />
        <Route path="*" element={<Navigate to={`/book/${me}`} replace />} />
      </Routes>
      <Toasts />
    </div>
  );
}

function Gate() {
  const loaded = useStore((s) => s.loaded);
  const authNeeded = useStore((s) => s.authNeeded);
  const apiError = useStore((s) => s.apiError);
  const role = useStore((s) => s.role);
  const me = useStore((s) => s.me);
  const load = useStore((s) => s.load);
  useEffect(() => {
    if (apiMode && !loaded) void load();
  }, [loaded, load]);
  if (apiMode && authNeeded) return <Login />;
  if (apiMode && !loaded) {
    return (
      <main className="page no-tabs" style={{ justifyContent: 'center', minHeight: '100vh' }}>
        <span className="muted">Loading…</span>
      </main>
    );
  }
  if (apiMode && apiError) {
    return (
      <main className="page no-tabs" style={{ justifyContent: 'center', minHeight: '100vh' }}>
        <h1 className="title sm">Can't reach FitnessAI</h1>
        <span className="muted">{apiError}</span>
        <button type="button" className="btn primary" onClick={() => { useStore.setState({ loaded: false, apiError: undefined }); }}>Try again</button>
      </main>
    );
  }
  if (role === 'client' && me) return <ClientShell me={me} />;
  return <TrainerShell />;
}

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}

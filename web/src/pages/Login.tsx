import { useState } from 'react';
import { signIn } from '../api';
import { useStore } from '../store';

export default function Login() {
  const load = useStore((s) => s.load);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(code.trim().toLowerCase());
      useStore.setState({ authNeeded: false, loaded: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page no-tabs" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      <div className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">FitnessAI</span>
        <h1 className="title">Sign in</h1>
        <span className="small muted">Enter the code your coach gave you. Coaches use their trainer code.</span>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="login-code">Your code</label>
          <input id="login-code" className="input" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. priya" />
        </div>
        {error && <div className="banner warn" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy || !code.trim()}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

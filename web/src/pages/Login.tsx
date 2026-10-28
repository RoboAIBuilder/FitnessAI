import { useState } from 'react';
import { sendCode, verifyCode } from '../api';
import { useStore } from '../store';

export default function Login() {
  const load = useStore((s) => s.load);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'email') {
        await sendCode(email.trim().toLowerCase());
        setStep('code');
      } else {
        await verifyCode(email.trim().toLowerCase(), code.trim());
        await load();
      }
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
        <span className="small muted">Trainers and clients use the same sign-in. Your coach links your email to your profile.</span>
      </div>
      <form className="card" onSubmit={submit}>
        {step === 'email' ? (
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="login-code">6-digit code sent to {email}</label>
            <input id="login-code" className="input num" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
        )}
        {error && <div className="banner warn" role="alert">{error}</div>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : step === 'email' ? 'Email me a code' : 'Sign in'}
        </button>
        {step === 'code' && (
          <button type="button" className="btn ghost" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
        )}
      </form>
    </main>
  );
}

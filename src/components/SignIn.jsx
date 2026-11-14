import { useState } from 'react';
import { looksLikeEmail, sendCode, verifyCode } from '../lib/account.js';

export default function SignIn() {
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitEmail(e) {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendCode(email);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifyCode(email, code);
      // App hears the new session and moves on.
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen signin">
      <header className="hero">
        <h1>Golf App</h1>
        <p>Score the round. Settle the bets.</p>
      </header>

      {step === 'email' ? (
        <form className="card" onSubmit={submitEmail} noValidate>
          <h2>Sign in</h2>
          <p className="muted">We&apos;ll email you a code. No password needed.</p>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {error && <p className="search-error">{error}</p>}
          <button className="btn btn-primary btn-xl" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form className="card" onSubmit={submitCode}>
          <h2>Check your email</h2>
          <p className="muted">
            We sent a code to <strong>{email.trim()}</strong>. It can take a minute; check spam too.
          </p>
          <label className="field">
            <span>Code</span>
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
            />
          </label>
          {error && <p className="search-error">{error}</p>}
          <button className="btn btn-primary btn-xl" disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="row2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
              }}
            >
              Change email
            </button>
            <button type="button" className="btn btn-ghost" onClick={submitEmail} disabled={busy}>
              Send a new code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

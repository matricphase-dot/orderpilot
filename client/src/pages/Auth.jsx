// OrderPilot — login / register with one-click demo accounts
import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../store.jsx';
import { Field, Spinner } from '../components/ui.jsx';

export default function Auth() {
  const { login, register, toast, user } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});

  useEffect(() => { if (user) toast('You are already signed in.', 'info', 2000); }, [user]); // eslint-disable-line
  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErr({ ...err, [k]: null }); };

  const go = async (e) => {
    e?.preventDefault(); setBusy(true); setErr({});
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      nav('/');
    } catch (ex) {
      if (ex.field) setErr({ [ex.field]: ex.message }); else toast(ex.message, 'error', 6000);
    } finally { setBusy(false); }
  };

  const quick = (email, password) => { setForm({ ...form, email, password }); setMode('login'); goLogin(email, password); };
  async function goLogin(email, password) {
    setBusy(true);
    try { await login(email, password); nav('/'); } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 430, margin: '6vh auto 0' }}>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span className="logo-mark" style={{ width: 52, height: 52, fontSize: 26, borderRadius: 16 }}>🛒</span>
          <h1 className="h1" style={{ marginTop: 12, fontSize: 26 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="sub">{mode === 'login' ? 'Sign in to place orders and track shipments.' : 'Join OrderPilot — takes less than a minute.'}</p>
        </div>

        <div className="steps" style={{ marginBottom: 22 }}>
          <div className={mode === 'login' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setMode('login')}>Sign in</div>
          <div className={mode === 'register' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setMode('register')}>Register</div>
        </div>

        <form onSubmit={go} noValidate>
          {mode === 'register' && (
            <>
              <Field label="Full name" error={err.name}><input className={`input ${err.name ? 'err' : ''}`} value={form.name} onChange={set('name')} placeholder="Aarav Sharma" /></Field>
              <Field label="Mobile (optional)" error={err.phone}><input className={`input ${err.phone ? 'err' : ''}`} value={form.phone} onChange={set('phone')} placeholder="98xxxxxxxx" maxLength={10} /></Field>
            </>
          )}
          <Field label="Email" error={err.email}><input className={`input ${err.email ? 'err' : ''}`} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoFocus /></Field>
          <Field label="Password" error={err.password} hint={mode === 'register' ? 'min 6 characters' : undefined}><input className={`input ${err.password ? 'err' : ''}`} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" /></Field>
          <button className="btn primary block" disabled={busy} type="submit">{busy ? <><Spinner small /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</> : mode === 'login' ? 'Sign in →' : 'Create account →'}</button>
        </form>

        <div style={{ margin: '22px 0 12px', textAlign: 'center', position: 'relative' }}>
          <span className="small faint" style={{ background: 'var(--panel-solid)', padding: '2px 10px', position: 'relative', zIndex: 1 }}>or try a demo account</span>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)' }} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn block sm" onClick={() => quick('aarav@example.com', 'demo@123')} disabled={busy}>👤 Customer</button>
          <button className="btn block sm" onClick={() => quick('admin@orderpilot.dev', 'admin@123')} disabled={busy}>🛠️ Admin</button>
        </div>
        <p className="hint mt10" style={{ textAlign: 'center' }}>Passwords: <span className="kbd">demo@123</span> for customers · <span className="kbd">admin@123</span> for the admin console.</p>
      </div>
    </div>
  );
}

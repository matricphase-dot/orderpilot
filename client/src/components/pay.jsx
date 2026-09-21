// OrderPilot — demo payment instruments: fake QR, card form, bank picker, gateway simulator
import { useEffect, useMemo, useState } from 'react';
import { INR } from '../api.js';

/* ── pseudo-QR: deterministic SVG from the payload (visual only, not scannable) ── */
export function DemoQR({ text = 'OP', size = 148 }) {
  const cells = useMemo(() => {
    const N = 25, grid = Array.from({ length: N }, () => Array(N).fill(0));
    let h = 2166136261;
    for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967295; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grid[y][x] = rnd() > 0.52 ? 1 : 0;
    const finder = (ox, oy) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) grid[oy + y][ox + x] = (x === 0 || x === 6 || y === 0 || y === 6) ? 1 : (x > 1 && x < 5 && y > 1 && y < 5) ? 1 : 0; if (grid[oy][ox] === undefined) return; for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const gy = oy + y, gx = ox + x; if (gy >= 0 && gx >= 0 && gy < N && gx < N && (x === -1 || y === -1 || x === 7 || y === 7)) grid[gy][gx] = 0; } };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    return grid;
  }, [text]);
  const N = 25, u = size / N;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: '#fff', borderRadius: 12, padding: 6 }}>
      {cells.map((row, y) => row.map((v, x) => v ? <rect key={`${x}-${y}`} x={x * u} y={y * u} width={u} height={u} fill="#0b1020" /> : null))}
    </svg>
  );
}

/* ── card input helpers ── */
const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const fmtExp = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
const luhn = (num) => {
  let s = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt && (d *= 2) > 9) d -= 9; s += d; alt = !alt; }
  return num.length === 16 && s % 10 === 0;
};
const BRAND = (n) => n.startsWith('4') ? 'VISA' : /^5[1-5]/.test(n) ? 'MASTERCARD' : /^6/.test(n) ? 'RUPAY' : 'CARD';

export function CardForm({ onValid }) {
  const [f, setF] = useState({ num: '', name: '', exp: '', cvv: '' });
  const digits = f.num.replace(/\s/g, '');
  const ok = luhn(digits) && /^[A-Za-z .'-]{3,}$/.test(f.name) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp) && /^\d{3,4}$/.test(f.cvv)
    && new Date(2000 + +f.exp.slice(3), f.exp.slice(0, 2) - 1, 28) >= new Date();
  useEffect(() => { onValid?.(ok); }, [ok]); // eslint-disable-line
  const I = (k, label, props) => (
    <div className="field" style={{ flex: props.flex }}>
      <label>{label}</label>
      <input className="input mono" value={f[k]} placeholder={props.ph}
        onChange={(e) => setF({ ...f, [k]: k === 'num' ? fmtCard(e.target.value) : k === 'exp' ? fmtExp(e.target.value) : k === 'cvv' ? e.target.value.replace(/\D/g, '').slice(0, 3) : e.target.value.slice(0, 24) })} />
    </div>
  );
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#0e7490)', borderRadius: 16, padding: 16, color: '#fff', fontFamily: 'var(--mono)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ fontSize: 11, opacity: .75, display: 'flex', justifyContent: 'space-between' }}><span>DEMO CARD</span><span style={{ fontWeight: 800 }}>{BRAND(digits)}</span></div>
        <div style={{ fontSize: 17, letterSpacing: 2, margin: '18px 0 10px' }}>{(digits + '•'.repeat(16 - digits.length)).replace(/(.{4})/g, '$1 ').trim()}</div>
        <div style={{ display: 'flex', gap: 24, fontSize: 11 }}>
          <span>{(f.name || 'CARDHOLDER NAME').toUpperCase()}</span><span>{f.exp || 'MM/YY'}</span>
        </div>
      </div>
      <div className="row mt16" style={{ gap: 10 }}>
        <div style={{ flex: 2 }}>{I('num', 'Card number', { ph: '4111 1111 1111 1111', flex: 2 })}</div>
        <div style={{ flex: 1 }}>{I('name', 'Name', { ph: 'A. SHARMA' })}</div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>{I('exp', 'Expiry', { ph: 'MM/YY' })}</div>
        <div style={{ flex: 1 }}>{I('cvv', 'CVV', { ph: '•••' })}</div>
        <div style={{ alignSelf: 'flex-end', marginBottom: 14 }}><button type="button" className="btn xs" onClick={() => setF({ num: '4111 1111 1111 1111', name: 'Aarav Sharma', exp: '12/28', cvv: '123' })}>✨ use test card</button></div>
      </div>
      {digits.length === 16 && !luhn(digits) && <span className="err-text">Fails Luhn check — click “use test card” or type a valid number.</span>}
    </div>
  );
}

export const BANKS = ['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Paytm'];

export function BankPicker({ bank, setBank }) {
  return (
    <div className="row wrapline" style={{ gap: 8 }}>
      {BANKS.map((b) => (
        <button type="button" key={b} className={`chip chip-btn ${bank === b ? 'on' : ''}`} style={{ padding: '10px 14px', fontSize: 13 }} onClick={() => setBank(b)}>
          🏦 {b}
        </button>
      ))}
    </div>
  );
}

/* ── gateway simulator: staged "processing" then resolve ── */
export function useGateway() {
  const [phase, setPhase] = useState(null); // {step, total, label}
  const run = (steps, done) => {
    let i = 0;
    const tick = () => {
      if (i < steps.length) { setPhase({ step: i, total: steps.length, label: steps[i] }); i++; setTimeout(tick, 750); }
      else { setPhase({ done: true }); setTimeout(() => { setPhase(null); done(); }, 650); }
    };
    tick();
  };
  const ui = phase && (
    <div className="panel" style={{ padding: 18, textAlign: 'center', animation: 'pageIn .25s both' }}>
      {!phase.done ? (
        <>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}><span className="spin" /><b style={{ fontSize: 14.5 }}>{phase.label}</b></div>
          <div className="progress mt10" style={{ maxWidth: 'none', marginInline: 'auto', width: '70%' }}>
            {Array.from({ length: phase.total }, (_, i) => <i key={i} className={i <= phase.step ? 'on' : ''} />)}
          </div>
        </>
      ) : (
        <div style={{ animation: 'pop .35s cubic-bezier(.5,1.8,.4,1) both' }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <b>Payment approved — demo gateway</b>
        </div>
      )}
    </div>
  );
  return { busy: !!phase, ui, run };
}

export const PaySummary = ({ total, method, txRef }) => (
  <div className="row between" style={{ padding: '10px 12px', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 12, fontSize: 13 }}>
    <span>💳 {INR(total)} paid via <b>{method}</b></span>
    <span className="mono small faint">{txRef}</span>
  </div>
);

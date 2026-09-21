// OrderPilot — public tracking: order number + light verification, animated status ring
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, dt, INR, STATUS_META, STAGES } from '../api.js';
import { StatusChip, Progress, Empty, Spinner } from '../components/ui.jsx';

export default function Track() {
  const [params, setParams] = useSearchParams();
  const [num, setNum] = useState(params.get('n') || '');
  const [verify, setVerify] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const lookup = async (n = num, v = verify) => {
    if (!n.trim()) return;
    setLoading(true); setError('');
    try { setData(await api.trackPublic(n.trim(), v || undefined)); setParams(v ? { n: n.trim(), v } : { n: n.trim() }); }
    catch (e) { setData(null); setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (params.get('n')) lookup(params.get('n'), params.get('v') || ''); inputRef.current?.focus(); }, []); // eslint-disable-line

  const o = data?.order;
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '14px 0 26px' }}>
        <div style={{ fontSize: 44 }}>📮</div>
        <h1 className="h1">Track your order</h1>
        <p className="sub">Public &amp; privacy-safe — enter any order number. Add your email, phone or pincode to unlock the full view.</p>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="row wrapline" style={{ gap: 10 }}>
          <input ref={inputRef} className="input mono" style={{ flex: 2, minWidth: 200, textTransform: 'uppercase' }} placeholder="OP-2026-001" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          <input className="input" style={{ flex: 1, minWidth: 170 }} placeholder="email / phone / pincode (optional)" value={verify} onChange={(e) => setVerify(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          <button className="btn primary" onClick={() => lookup()} disabled={loading || !num.trim()}>{loading ? <Spinner small /> : 'Track →'}</button>
        </div>
        {error && <p className="err-text" style={{ marginTop: 10 }}>⛔ {error}</p>}
        {data && !data.verified && !data.order && (
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <span className="small faint">Demo hints:</span>
            {[['OP-2026-001', 'aarav@example.com'], ['OP-2026-006', '9867712345']].map(([n, v]) => (
              <button key={n} className="chip chip-btn mono" onClick={() => { setNum(n); setVerify(v); lookup(n, v); }}>{n} · {v}</button>
            ))}
          </div>
        )}
      </div>

      {data && !data.verified && !data.order && (
        <div className="card mt16" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
            <div className="big-status" style={{ '--c': STATUS_META[data.status].color }}>
              <span style={{ fontSize: 44 }}>{STATUS_META[data.status].icon}</span>
              <div className="row mt10" style={{ gap: 8 }}><StatusChip status={data.status} live={!['DELIVERED','CANCELLED'].includes(data.status)} /></div>
              <p className="sub mt10" style={{ maxWidth: 380, textAlign: 'center' }}>{data.current_message}</p>
              <p className="small faint">ETA <b className="mono" style={{ color: 'var(--text)' }}>{data.eta}</b> · last update {dt(data.updated_at)}</p>
              <p className="small" style={{ marginTop: 14, padding: '8px 14px', background: 'rgba(245,158,11,.1)', color: '#fcd34d', borderRadius: 10, border: '1px solid rgba(245,158,11,.3)' }}>🔒 {data.hint}</p>
            </div>
          </div>
        </div>
      )}

      {o && (
        <div className="card mt16" style={{ padding: 22 }}>
          <div className="row between wrapline">
            <div>
              <b className="mono" style={{ fontSize: 18 }}>{o.order_number}</b>
              <div className="small faint">to {o.ship_name}, {o.ship_city} · placed {dt(o.created_at)}</div>
            </div>
            <StatusChip status={o.status} live={!['DELIVERED','CANCELLED'].includes(o.status)} />
          </div>
          <div className="mt16"><Progress status={o.status} height={6} /></div>
          <div className="row between mt16 small mut"><span>🛬 ETA: <b style={{ color: '#22d3ee' }}>{data.eta}</b></span><span>{o.awb ? `📦 ${o.carrier} · AWB ${o.awb}` : '📦 carrier assigned on dispatch'}</span><span className="mono">{o.items?.reduce((s, i) => s + i.qty, 0)} units · {INR(o.total)}</span></div>

          <h3 className="h3 mt24">Tracking history</h3>
          <div className="tl" style={{ marginTop: 12 }}>
            {[...(o.events || [])].reverse().map((e, i) => (
              <div key={e.id} className={`tl-item ${i === 0 ? 'now' : 'done'}`}>
                <div className="tl-node" style={{ background: i === 0 ? STATUS_META[e.status]?.color : 'transparent', color: '#fff', borderColor: STATUS_META[e.status]?.color }}>{STATUS_META[e.status]?.icon}</div>
                <div className="row between"><b style={{ fontSize: 13.5 }}>{STATUS_META[e.status]?.label}</b><span className="tl-when">{dt(e.created_at)}</span></div>
                <div className="tl-msg">{e.message}</div>
              </div>
            ))}
          </div>
          {!['DELIVERED', 'CANCELLED'].includes(o.status) && <p className="hint" style={{ textAlign: 'center' }}>⏱ This view refreshes automatically — advance it from the admin console for the full demo.</p>}
        </div>
      )}
      <p className="hint mt24" style={{ textAlign: 'center' }}>Signed in as a customer? See richer controls on <Link to="/orders" style={{ color: 'var(--accent)' }}>My Orders</Link>.</p>
    </div>
  );
}

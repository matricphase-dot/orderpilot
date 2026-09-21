// OrderPilot — customer's order list: filter chips, live search, animated cards
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, INR, dt, rel, STAGES, STATUS_META } from '../api.js';
import { useApp } from '../store.jsx';
import { StatusChip, Progress, Empty, Skeleton, Copyable } from '../components/ui.jsx';

export default function MyOrders() {
  const { token, toast, user } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    if (!token) return;
    api.listOrders({ status: status || undefined, q: q || undefined, page, limit: 8 }, token)
      .then(setData).catch((e) => toast(e.message, 'error'));
  }, [token, status, q, page]); // eslint-disable-line
  useEffect(() => { if (!user) { toast('Sign in to view your orders.', 'warn'); nav('/auth'); } }, [user]); // eslint-disable-line
  useEffect(load, [load]);

  if (!user) return null;

  return (
    <>
      <div className="row between wrapline">
        <div><h1 className="h1">My orders</h1><p className="sub">Every order you've placed — tap a card for full lifecycle tracking, address edits and cancellation.</p></div>
        <button className="btn" onClick={load}>⟳ Refresh</button>
      </div>
      <div className="row between wrapline mt16" style={{ gap: 10 }}>
        <div className="row wrapline" style={{ gap: 7 }}>
          <button className={`chip chip-btn ${!status ? 'on' : ''}`} onClick={() => { setStatus(''); setPage(1); }}>All</button>
          {[...STAGES, 'CANCELLED'].map((s) => (
            <button key={s} className={`chip chip-btn ${status === s ? 'on' : ''}`} onClick={() => { setStatus(status === s ? '' : s); setPage(1); }}>
              <span style={{ color: STATUS_META[s].color }}>●</span> {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <input className="input" style={{ width: 210 }} placeholder="🔍 search #" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      {!data ? <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>{[1, 2, 3].map((i) => <Skeleton key={i} h={92} style={{ borderRadius: 18 }} />)}</div>
        : data.items.length === 0 ? (
          <div className="panel" style={{ marginTop: 18 }}>
            <Empty icon={q || status ? '🔍' : '🧾'} title={q || status ? 'Nothing matches those filters' : 'No orders yet'}
              sub={q || status ? 'Try a different status or search term.' : 'Place your first order from the shop — it will appear here instantly.'}
              action={!q && !status && <button className="btn primary" onClick={() => nav('/')}>Start shopping →</button>} />
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              {data.items.map((o, i) => <OrderRow key={o.id} o={o} delay={i} onOpen={() => nav(`/orders/${o.id}`)} />)}
            </div>
            {data.pages > 1 && (
              <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span className="small mut">page {data.page} / {data.pages} · {data.total} orders</span>
                <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
    </>
  );
}

export function OrderRow({ o, onOpen, delay = 0, showCustomer = false }) {
  const live = !['DELIVERED', 'CANCELLED'].includes(o.status);
  return (
    <div className="card orow" onClick={onOpen} style={{ animation: `pageIn .4s ${delay * 50}ms both` }}>
      <div className="row" style={{ gap: 10 }}>
        {(o.items || []).slice(0, 3).map((it, i) => (
          <span key={i} className="mini">{pickEmoji(it.name)}</span>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row wrapline" style={{ gap: 9 }}>
          <Copyable text={o.order_number} />
          <StatusChip status={o.status} live={live} />
          {showCustomer && <span className="small faint">👤 {o.customer_name}</span>}
          <span className="small faint">{o.item_count ?? o.items?.length} item{(o.item_count ?? o.items?.length) > 1 ? 's' : ''} · {rel(o.updated_at)}</span>
        </div>
        <Progress status={o.status} />
      </div>
      <div style={{ textAlign: 'right' }}>
        <b style={{ fontSize: 16.5 }}>{INR(o.total)}</b>
        <div className="small faint">{o.payment_method}{o.payment_status === 'REFUNDED' ? ' · refunded' : ''}</div>
        <div className="small" style={{ color: live ? '#22d3ee' : 'var(--faint)' }}>{onOpen ? (live ? 'Track →' : 'View →') : ''}</div>
      </div>
    </div>
  );
}
const EMOJI = { earbud: '🎧', watch: '⌚', mic: '🎙️', keyboard: '⌨️', mouse: '🖱️', charger: '🔌', bank: '🪫', lamp: '💡', webcam: '📷', speaker: '🔊', stand: '📐', hub: '🧩' };
const pickEmoji = (n) => Object.entries(EMOJI).find(([k]) => n.toLowerCase().includes(k))?.[1] || '📦';

// OrderPilot — admin ops table: search/filter/paginate + one-click lifecycle controls inline
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, INR, dt, NEXT, STAGES, STATUS_META } from '../../api.js';
import { useApp } from '../../store.jsx';
import { StatusChip, Progress, Spinner, Modal, Empty } from '../../components/ui.jsx';

export default function AdminOrders() {
  const { token, toast } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(params.get('status') || '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.listOrders({ status: status || undefined, q: q || undefined, page, limit: 10 }, token)
      .then(setData).catch((e) => toast(e.message, 'error'));
  }, [status, q, page]); // eslint-disable-line
  useEffect(load, [load]);
  useEffect(() => { const h = setInterval(load, 20000); return () => clearInterval(h); }, [load]);

  const advance = async (o, to) => {
    setBusyId(o.id);
    try {
      const r = await api.setStatus(o.id, { status: to }, token);
      toast(r.message, 'success');
      load();
    } catch (e) { toast(e.message, 'error'); } finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="row between wrapline" style={{ gap: 10 }}>
        <div className="row wrapline" style={{ gap: 6 }}>
          <button className={`chip chip-btn ${!status ? 'on' : ''}`} onClick={() => { setStatus(''); setParams({}); }}>All</button>
          {[...STAGES, 'CANCELLED'].map((s) => (
            <button key={s} className={`chip chip-btn ${status === s ? 'on' : ''}`} onClick={() => { setStatus(status === s ? '' : s); setParams(status === s ? {} : { status: s }); }}>
              <span style={{ color: STATUS_META[s].color }}>●</span> {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ width: 220 }} placeholder="🔍 order # / customer / city" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm" onClick={load}>⟳</button>
        </div>
      </div>

      {!data ? <div className="mt16"><Spinner /></div> : data.items.length === 0 ? (
        <div className="panel mt16"><Empty icon="📭" title="No orders match" sub="Adjust the filters or search." /></div>
      ) : (
        <div className="card mt16" style={{ padding: '4px 0 8px', overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Order</th><th>Customer</th><th>Status / progress</th><th className="num">Total</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>
              {data.items.map((o) => {
                const next = NEXT[o.status] || [];
                return (
                  <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="mono">{o.order_number}</div>
                      <div className="small faint">{o.items?.reduce((s, i) => s + i.qty, 0)} units · {dt(o.created_at)}</div>
                    </td>
                    <td>
                      <div>{o.customer_name}</div>
                      <div className="small faint">{o.ship_city} · {o.ship_pincode}</div>
                    </td>
                    <td>
                      <StatusChip status={o.status} live={!['DELIVERED', 'CANCELLED'].includes(o.status)} />
                      <div style={{ width: 120 }}><Progress status={o.status} /></div>
                    </td>
                    <td className="num">{INR(o.total)}</td>
                    <td className="small">{o.payment_method}<div className="faint" style={{ fontSize: 11 }}>{o.payment_status.replace(/_/g, ' ')}</div></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {busyId === o.id ? <Spinner small /> : (
                        <div className="row" style={{ gap: 5 }}>
                          {next.filter((s) => s !== 'CANCELLED').map((s) => (
                            <button key={s} className="btn ok xs" title={`Move to ${s}`} onClick={() => advance(o, s)}>{STATUS_META[s].icon} {STATUS_META[s].label}</button>
                          ))}
                          {next.includes('CANCELLED') && <button className="btn danger xs" onClick={() => setConfirmCancel(o)}>✖</button>}
                          {next.length === 0 && <span className="small faint">terminal ✓</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span className="small mut">{data.page} / {data.pages} · {data.total} orders</span>
          <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}

      {confirmCancel && (
        <Modal onClose={() => setConfirmCancel(null)}>
          <h2 className="h2">Cancel {confirmCancel.order_number}?</h2>
          <p className="sub mt8">Stock will be returned to inventory and {confirmCancel.payment_status === 'PAID' ? `a refund of ${INR(confirmCancel.total)} marked as initiated` : 'no payment is due (COD)'}.</p>
          <div className="row mt16" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn ghost" onClick={() => setConfirmCancel(null)}>Back off</button>
            <button className="btn danger" onClick={async () => {
              setBusyId(confirmCancel.id);
              try { const r = await api.setStatus(confirmCancel.id, { status: 'CANCELLED', note: 'cancelled from ops console' }, token); toast(r.message, 'success'); load(); }
              catch (e) { toast(e.message, 'error'); } finally { setBusyId(null); setConfirmCancel(null); }
            }}>✖ Confirm cancellation</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

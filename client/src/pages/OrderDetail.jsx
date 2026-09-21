// OrderPilot — order detail: full tracking timeline, cancel flow, address editor, admin ops
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api, INR, dt, NEXT, STATUS_META, STAGES } from '../api.js';
import { useApp } from '../store.jsx';
import Timeline from '../components/Timeline.jsx';
import { StatusChip, Progress, Modal, Field, Spinner, Empty } from '../components/ui.jsx';

const CANCEL_REASONS = ['Ordered by mistake', 'Found a better price', 'Delivery is too slow', 'Wrong address / contact', 'Payment issue'];
const isTerminal = (s) => s === 'DELIVERED' || s === 'CANCELLED';

export default function OrderDetail() {
  const { id } = useParams();
  const { token, toast, user, isAdmin } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null); // 'cancel' | 'edit' | 'status' | 'carrier'
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const autoStarted = useRef(false);

  const runAutopilot = useCallback(async (startOrder) => {
    if (autoRun) return;
    setAutoRun(true);
    let cur = startOrder;
    while (cur && !isTerminal(cur.status)) {
      await new Promise((r) => setTimeout(r, 1400));
      try {
        const r = await api.autopilot(cur.id, 'DELIVERED', token);
        cur = r.order; setOrder(cur);
        toast(r.message, 'success', 1900);
        if (cur.status === 'SHIPPED') toast(`🚚 ${cur.carrier} AWB ${cur.awb} — label attached`, 'info', 2600);
        if (cur.status === 'DELIVERED') toast('🎉 Delivered! Journey complete — payment' + (cur.payment_status === 'PAID' ? ' captured' : ' collected') + '.', 'success', 5200);
      } catch (e) { toast(e.message, 'warn', 3800); break; }
    }
    setAutoRun(false);
  }, [autoRun, token]); // eslint-disable-line

  // autoplay arrival (from checkout "Watch it ship") runs the demo once
  useEffect(() => {
    if (location.state?.autoplay && order && !isTerminal(order.status) && !autoStarted.current) {
      autoStarted.current = true;
      runAutopilot(order);
    }
  }, [location.state?.autoplay, order?.status]); // eslint-disable-line

  const load = useCallback(() => {
    api.getOrder(id, token).then((r) => { setOrder(r.order); setErr(null); })
      .catch((e) => { setErr(e.message); if (e.status === 401) nav('/auth'); });
  }, [id, token]); // eslint-disable-line
  useEffect(load, [load]);

  // gentle auto-refresh while the order is still moving
  useEffect(() => {
    if (!order || ['DELIVERED', 'CANCELLED'].includes(order.status)) return;
    const h = setInterval(load, 12000);
    return () => clearInterval(h);
  }, [order?.status, load]); // eslint-disable-line

  if (err && !order) return <div className="panel" style={{ marginTop: 30 }}><Empty icon="😵" title="Can't open this order" sub={err} action={<button className="btn" onClick={() => nav('/orders')}>Back to orders</button>} /></div>;
  if (!order) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>;

  const o = order;
  const actions = [];
  if (isAdmin) {
    for (const s of o.next_statuses || NEXT[o.status] || []) {
      actions.push(<button key={s} className={`btn sm ${s === 'CANCELLED' ? 'danger' : 'ok'}`} onClick={() => setModal({ kind: 'status', to: s })}>{s === 'CANCELLED' ? '✖ Cancel order' : `Advance → ${STATUS_META[s].label}`}</button>);
    }
    actions.push(<button key="carrier" className="btn sm" onClick={() => setModal({ kind: 'carrier' })}>🚚 Carrier / AWB</button>);
  } else {
    if (o.can_cancel) actions.push(<button key="cx" className="btn danger sm" onClick={() => setModal({ kind: 'cancel' })}>Cancel order</button>);
    if (o.can_edit) actions.push(<button key="ed" className="btn sm" onClick={() => setModal({ kind: 'edit' })}>✏️ Update address</button>);
    actions.push(<button key="tr" className="btn ghost sm" onClick={() => nav(`/track?n=${o.order_number}`)}>📮 Public tracking link</button>);
  }
  if (STAGES.includes(o.status) && !isTerminal(o.status)) {
    actions.push(
      <button key="demo" className="btn sm" style={{ borderColor: 'rgba(34,211,238,.45)', color: '#22d3ee' }} disabled={autoRun} onClick={() => runAutopilot(o)}>
        {autoRun ? <><Spinner small /> Parcels moving…</> : '🤖 Run fulfilment demo'}
      </button>
    );
  }

  const summary = [['Subtotal', INR(o.subtotal)]];
  if (o.discount > 0) summary.push([`Discount ${o.coupon_code ? `(${o.coupon_code})` : ''}`, <span style={{ color: '#86efac' }}>−{INR(o.discount)}</span>]);
  summary.push(['Shipping', o.shipping_fee === 0 ? 'FREE 🎁' : INR(o.shipping_fee)], ['GST (5%)', INR(o.tax)]);
  if (o.cod_fee) summary.push(['COD fee', INR(o.cod_fee)]);

  return (
    <>
      <button className="btn ghost sm" onClick={() => nav(isAdmin ? '/admin/orders' : '/orders')}>← All orders</button>
      <div className="row between wrapline mt10" style={{ gap: 14 }}>
        <div>
          <div className="row wrapline" style={{ gap: 10, alignItems: 'center' }}>
            <h1 className="h1 mb0" style={{ fontSize: 26 }}>Order <span className="mono">{o.order_number}</span></h1>
            <StatusChip status={o.status} live={!['DELIVERED', 'CANCELLED'].includes(o.status)} />
          </div>
          <p className="sub mb0">{STATUS_META[o.status].hint}{o.awb ? ` · ${o.carrier} AWB ${o.awb}` : ''} · placed {dt(o.created_at)}{isAdmin ? ` · by ${o.customer_name}` : ''}</p>
        </div>
        <div className="row wrapline">{actions}</div>
      </div>

      <Progress status={o.status} height={6} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 18, marginTop: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 20 }}>
            <h2 className="h2">📍 Shipment progress</h2>
            <div className="mt16"><Timeline order={o} /></div>
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h2 className="h2">🧾 Items ({o.items.length})</h2>
            <div className="mt10">
              {o.items.map((it) => (
                <div key={it.id} className="cline">
                  <div className="cline-emoji" style={{ background: 'var(--grad-soft)' }}>{'📦'}</div>
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 14 }}>{it.name}</b>
                    <div className="small faint">{INR(it.unit_price)} × {it.qty}</div>
                  </div>
                  <b className="mono">{INR(it.line_total)}</b>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 20 }}>
            <h2 className="h2">💳 Payment</h2>
            <div className="mt10">
              {summary.map(([k, v], i) => <div key={i} className="sumrow"><span>{k}</span><span>{v}</span></div>)}
              <div className="sumrow total"><span>Total</span><span>{INR(o.total)}</span></div>
              <div className="row between mt10">
                <span className="small mut">Method: <b>{o.payment_method}</b></span>
                <span className="chip" style={o.payment_status === 'PAID' ? { color: '#22c55e', background: 'rgba(34,197,94,.12)' } : o.payment_status === 'REFUNDED' ? { color: '#0ea5e9', background: 'rgba(14,165,233,.12)' } : { color: '#f59e0b', background: 'rgba(245,158,11,.12)' }}>{o.payment_status.replace(/_/g, ' ')}</span>
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 20 }}>
            <div className="row between"><h2 className="h2">🏠 Delivery to</h2>{!isAdmin && o.can_edit && <button className="btn xs ghost" onClick={() => setModal({ kind: 'edit' })}>edit</button>}</div>
            <p style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0' }}>
              <b>{o.ship_name}</b> · <span className="mono">{o.ship_phone}</span><br />
              {o.ship_addr}, {o.ship_city}, {o.ship_state} — <span className="mono">{o.ship_pincode}</span>
            </p>
            {o.notes && <p className="small mut" style={{ marginTop: 10, padding: '8px 10px', background: 'var(--panel)', borderRadius: 10 }}>📝 "{o.notes}"</p>}
          </section>

          {o.events?.length > 0 && (
            <section className="card" style={{ padding: 20 }}>
              <h2 className="h2">🗒️ Full event log</h2>
              <div className="mt10" style={{ maxHeight: 190, overflowY: 'auto', paddingRight: 6 }}>
                {[...o.events].reverse().map((e) => (
                  <div key={e.id} className="row" style={{ gap: 9, padding: '7px 0', borderBottom: '1px dashed rgba(255,255,255,.06)', alignItems: 'baseline' }}>
                    <span style={{ color: STATUS_META[e.status]?.color, fontSize: 11 }}>●</span>
                    <span className="small" style={{ flex: 1 }}>{e.message}</span>
                    <span className="small faint mono">{dt(e.created_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {modal?.kind === 'cancel' && <CancelModal order={o} onClose={() => setModal(null)} onDone={(od) => { setOrder(od); setModal(null); }} />}
      {modal?.kind === 'edit' && <AddressModal order={o} onClose={() => setModal(null)} onSaved={(od) => { setOrder(od); setModal(null); toast('Address updated ✓', 'success'); }} />}
      {modal?.kind === 'status' && <StatusModal order={o} to={modal.to} onClose={() => setModal(null)} onSaved={(od) => { setOrder(od); setModal(null); toast(`Order advanced to ${STATUS_META[od.status].label} ✓`, 'success'); }} />}
      {modal?.kind === 'carrier' && <CarrierModal order={o} onClose={() => setModal(null)} onSaved={(od) => { setOrder(od); setModal(null); toast('Carrier details saved ✓', 'success'); }} />}
    </>
  );
}

function CancelModal({ order, onClose, onDone }) {
  const { token, toast } = useApp();
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.cancelOrder(order.id, other || reason, token);
      toast(r.message, 'success');
      onDone(r.order);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="h2">Cancel {order.order_number}?</h2>
      <p className="sub mt8">Stock is released instantly{order.payment_status === 'PAID' ? ` and a refund of ${INR(order.total)} is initiated to your ${order.payment_method}` : ' — no payment is due (COD)'}.</p>
      <div className="panel" style={{ padding: 12, margin: '14px 0', borderLeft: '3px solid #ef4444' }}>
        <span className="small mut">Cancellation is only possible before the order ships (currently <b style={{ color: STATUS_META[order.status].color }}>{order.status}</b>).</span>
      </div>
      <Field label="Quick reason">
        <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      </Field>
      {reason === 'Payment issue' && <Field label="Tell us more"><input className="input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="optional" /></Field>}
      <div className="row mt10" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Keep order</button>
        <button className="btn danger" disabled={busy} onClick={go}>{busy ? <Spinner small /> : 'Yes, cancel order'}</button>
      </div>
    </Modal>
  );
}

function AddressModal({ order, onClose, onSaved }) {
  const { token, toast } = useApp();
  const [s, setS] = useState({ name: order.ship_name, phone: order.ship_phone, address: order.ship_addr, city: order.ship_city, state: order.ship_state, pincode: order.ship_pincode });
  const [notes, setNotes] = useState(order.notes);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.updateOrder(order.id, { shipping: s, notes }, token); onSaved(r.order); }
    catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="h2">Update delivery details</h2>
      <p className="sub mt8">Editable while the order is PENDING or CONFIRMED.</p>
      <div className="mt16">
        <div className="grid-2">
          <Field label="Full name"><input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Mobile (10 digits)"><input className="input" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} maxLength={10} /></Field>
        </div>
        <Field label="Address"><input className="input" value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="City"><input className="input" value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} /></Field>
          <Field label="State"><input className="input" value={s.state} onChange={(e) => setS({ ...s, state: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Pincode"><input className="input" value={s.pincode} onChange={(e) => setS({ ...s, pincode: e.target.value })} maxLength={6} /></Field>
          <Field label="Delivery notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </div>
      <div className="row mt10" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Discard</button>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? <Spinner small /> : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function StatusModal({ order, to, onClose, onSaved }) {
  const { token, toast } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.setStatus(order.id, { status: to, note: note || undefined }, token); onSaved(r.order); }
    catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="h2">Move order → {STATUS_META[to].icon} {STATUS_META[to].label}?</h2>
      <p className="sub mt8">Current: <StatusChip status={order.status} /> This writes a customer-visible tracking event{to === 'SHIPPED' ? ' and generates an AWB' : ''}{to === 'CANCELLED' ? ' plus a restock + refund note' : ''}.</p>
      <Field label="Internal note (optional, shown to customer)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Picked from rack B-12" /></Field>
      <div className="row mt10" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn ${to === 'CANCELLED' ? 'danger' : 'primary'}`} disabled={busy} onClick={go}>{busy ? <Spinner small /> : `Confirm → ${STATUS_META[to].label}`}</button>
      </div>
    </Modal>
  );
}

function CarrierModal({ order, onClose, onSaved }) {
  const { token, toast } = useApp();
  const [carrier, setCarrier] = useState(order.carrier || 'Delhivery');
  const [awb, setAwb] = useState(order.awb || '');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.updateOrder(order.id, { carrier, awb: awb || undefined }, token); onSaved(r.order); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="h2">🚚 Carrier & tracking label</h2>
      <div className="mt16">
        <Field label="Carrier">
          <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {['Delhivery', 'BlueDart', 'DTDC', 'Ecom Express', 'Amazon Shipping'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="AWB number" hint="Leave blank to auto-generate"><input className="input mono" value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="AWB…" /></Field>
      </div>
      <div className="row mt10" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? <Spinner small /> : 'Save'}</button>
      </div>
    </Modal>
  );
}

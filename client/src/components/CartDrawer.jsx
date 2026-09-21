// OrderPilot — cart slide-over: live quote engine, coupons, 2-step checkout
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, INR } from '../api.js';
import { useApp } from '../store.jsx';
import { Field, Spinner } from './ui.jsx';

const PAY = [
  { id: 'UPI', label: 'UPI', icon: '📱', note: 'GPay / PhonePe / Paytm' },
  { id: 'CARD', label: 'Card', icon: '💳', note: 'Visa · Mastercard · RuPay' },
  { id: 'NETBANKING', label: 'Net Banking', icon: '🏦', note: 'All major banks' },
  { id: 'COD', label: 'Cash on Delivery', icon: '💵', note: '+₹25 handling fee' },
];
const blankShip = { name: '', phone: '', address: '', city: '', state: '', pincode: '' };

export default function CartDrawer({ onClose }) {
  const { cart, setQty, clearCart, token, user, toast } = useApp();
  const nav = useNavigate();
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [step, setStep] = useState('cart'); // cart | checkout | done
  const [ship, setShip] = useState({ ...blankShip, ...(user ? { name: user.name, phone: user.phone || '' } : {}) });
  const [pay, setPay] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);

  const items = useMemo(() => cart.map((l) => ({ productId: l.id, qty: l.qty })), [cart]);

  // live server-side quote (debounced) — totals always match the API exactly
  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    setQuoting(true);
    const h = setTimeout(() => {
      api.quote({ items, coupon: applied, paymentMethod: pay })
        .then(setQuote)
        .catch((e) => { toast(e.message, 'error'); if (e.field === 'coupon') setApplied(''); })
        .finally(() => setQuoting(false));
    }, 260);
    return () => clearTimeout(h);
  }, [items, applied, pay]); // eslint-disable-line

  if (!token) {
    return <Backdrop onClose={onClose}><Drawer title="Your cart 🧺"><div style={{ textAlign: 'center', padding: '46px 10px' }}>
      <div style={{ fontSize: 40 }}>🔐</div><p className="sub" style={{ margin: '12px 0 18px' }}>Sign in to start a cart and place orders.</p>
      <button className="btn primary" onClick={() => { onClose(); nav('/auth'); }}>Sign in →</button>
    </div></Drawer></Backdrop>;
  }

  const apply = () => {
    if (!coupon.trim()) return setApplied('');
    if (!items.length) { toast('Add an item before applying a coupon.', 'warn'); return; }
    api.quote({ items, coupon: coupon.trim().toUpperCase(), paymentMethod: pay })
      .then(() => { setApplied(coupon.trim().toUpperCase()); toast(`Coupon ${coupon.trim().toUpperCase()} applied 🎉`, 'success'); })
      .catch((e) => { toast(e.message, 'warn'); setApplied(''); });
  };

  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      const r = await api.placeOrder({ items, coupon: applied || undefined, paymentMethod: pay, shipping: ship, notes }, token);
      setPlaced(r.order); setStep('done'); clearCart();
      toast(r.message, 'success');
    } catch (e) {
      if (e.status === 422 && e.field === 'shipping') {
        const errs = {}; e.message.replace(/— (.*)/, '$1').split(';').forEach((p) => { const [k, v] = p.split(':'); if (k) errs[k.trim()] = (v || '').trim(); });
        setErrors(errs);
      }
      toast(e.message, 'error', 6000);
    } finally { setBusy(false); }
  };

  const F = (k, label, props = {}) => (
    <Field label={label} error={errors[`ship_${k}`] || errors[k]}>
      <input className={`input ${errors[`ship_${k}`] || errors[k] ? 'err' : ''}`} value={ship[k]} onChange={(e) => setShip({ ...ship, [k]: e.target.value })} {...props} />
    </Field>
  );

  return (
    <Backdrop onClose={onClose}>
      <Drawer title={step === 'cart' ? 'Your cart 🧺' : step === 'checkout' ? 'Checkout 🧾' : 'Order placed 🎉'} onBack={step !== 'cart' && step !== 'done' ? () => setStep('cart') : undefined}>
        {step === 'cart' && (
          cart.length === 0 ? <div style={{ textAlign: 'center', padding: '50px 10px' }}><div style={{ fontSize: 40 }}>🛒</div><p className="sub" style={{ margin: '12px 0 18px' }}>Nothing here yet — add some gear!</p><button className="btn" onClick={onClose}>Browse shop</button></div> :
          <>
            <div className="steps" style={{ marginBottom: 6 }}><div className="on done">1 · Cart</div><div>2 · Shipping & pay</div><div>3 · Done</div></div>
            {cart.map((l) => (
              <div className="cline" key={l.id}>
                <div className="cline-emoji" style={{ background: `color-mix(in srgb, ${l.accent} 22%, transparent)` }}>{l.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                  <div className="small faint">{INR(l.price)} each · <b style={{ color: '#8b94ad' }}>{INR(l.price * l.qty)}</b></div>
                </div>
                <div className="stepper">
                  <button onClick={() => setQty(l.id, l.qty - 1)}>−</button><span>{l.qty}</span>
                  <button onClick={() => setQty(l.id, l.qty + 1)} disabled={l.qty >= (l.stock ?? 99)}>+</button>
                </div>
                <button className="btn ghost xs" title="Remove" onClick={() => setQty(l.id, 0)}>🗑</button>
              </div>
            ))}
            <div className="row mt16" style={{ gap: 8 }}>
              <input className="input mono" placeholder="COUPON e.g. FIRST10" value={coupon} onChange={(e) => setCoupon(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} style={{ textTransform: 'uppercase' }} />
              <button className="btn" onClick={apply}>Apply</button>
            </div>
            {applied && <div className="small" style={{ color: '#86efac', marginTop: 6 }}>✓ {applied} applied <button className="btn ghost xs" style={{ marginLeft: 4 }} onClick={() => { setApplied(''); setCoupon(''); }}>remove</button></div>}
            <QuoteBox quote={quote} quoting={quoting} />
            <button className="btn primary block" onClick={() => setStep('checkout')}>Proceed to checkout →</button>
          </>
        )}

        {step === 'checkout' && (
          <>
            <div className="steps" style={{ marginBottom: 6 }}><div className="done">1 · Cart</div><div className="on">2 · Shipping & pay</div><div>3 · Done</div></div>
            <b className="h3">Shipping details</b>
            <div className="grid-2 mt10">
              {F('name', 'Full name', { placeholder: 'Aarav Sharma' })}
              {F('phone', 'Mobile', { placeholder: '98xxxxxxxx', maxLength: 10 })}
            </div>
            {F('address', 'Address (house, street, area)', { placeholder: '402 Sea Breeze Apartments, Bandra West' })}
            <div className="grid-2">{F('city', 'City', { placeholder: 'Mumbai' })}{F('state', 'State', { placeholder: 'Maharashtra' })}</div>
            <div className="grid-2">{F('pincode', 'Pincode', { placeholder: '400050', maxLength: 6, inputMode: 'numeric' })}
              <Field label="Delivery notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ring the bell twice…" maxLength={300} /></Field>
            </div>
            <b className="h3">Payment method</b>
            <div className="row wrapline mt10" style={{ gap: 8, marginBottom: 16 }}>
              {PAY.map((p) => (
                <button key={p.id} className={`chip chip-btn ${pay === p.id ? 'on' : ''}`} style={{ padding: '9px 13px', fontSize: 13 }} onClick={() => setPay(p.id)} title={p.note}>
                  {p.icon} {p.label}{pay === p.id && ' ✓'}
                </button>
              ))}
            </div>
            <QuoteBox quote={quote} quoting={quoting} />
            <button className="btn primary block" disabled={busy || quoting || !quote} onClick={submit}>
              {busy ? <><Spinner small /> Placing order…</> : `Place order · ${quote ? INR(quote.total) : '…'}`}
            </button>
            <p className="hint" style={{ textAlign: 'center' }}>🔒 Demo checkout — payment is simulated, no real money moves.</p>
          </>
        )}

        {step === 'done' && placed && (
          <div style={{ textAlign: 'center', padding: '18px 4px' }}>
            <div style={{ fontSize: 58, animation: 'pop .5s cubic-bezier(.5,1.8,.4,1) both' }}>🎉</div>
            <h3 style={{ margin: '10px 0 4px' }}>Order placed!</h3>
            <p className="sub">Your order number is</p>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, margin: '8px 0', background: 'var(--grad-soft)', padding: '10px 14px', borderRadius: 12, display: 'inline-block' }}>{placed.order_number}</div>
            <p className="small faint">Total paid <b style={{ color: 'var(--text)' }}>{INR(placed.total)}</b> · {placed.payment_method} · tracking is live below.</p>
            <div className="row mt16" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={onClose}>Keep shopping</button>
              <button className="btn primary" onClick={() => { onClose(); nav(`/orders/${placed.id}`); }}>Track this order →</button>
            </div>
          </div>
        )}
      </Drawer>
    </Backdrop>
  );
}

function QuoteBox({ quote, quoting }) {
  if (!quote) return <div className="panel" style={{ padding: 14, margin: '6px 0 12px' }}><span className="small faint">Add items to see the summary</span></div>;
  return (
    <div className="panel" style={{ padding: '12px 14px', margin: '6px 0 12px', position: 'relative' }}>
      {quoting && <span className="spin" style={{ position: 'absolute', top: 12, right: 12 }} />}
      <div className="sumrow"><span>Subtotal ({quote.lines?.length} items)</span><span>{INR(quote.subtotal)}</span></div>
      {quote.discount > 0 && <div className="sumrow"><span className="ok">Coupon {quote.coupon}</span><span className="ok">−{INR(quote.discount)}</span></div>}
      <div className="sumrow"><span>Shipping {quote.shipping_fee === 0 && '🎁'}</span><span>{quote.shipping_fee === 0 ? 'FREE' : INR(quote.shipping_fee)}</span></div>
      <div className="sumrow"><span>GST (5%)</span><span>{INR(quote.tax)}</span></div>
      {quote.cod_fee > 0 && <div className="sumrow"><span>COD fee</span><span>{INR(quote.cod_fee)}</span></div>}
      <div className="sumrow total"><span>Total</span><span>{INR(quote.total)}</span></div>
    </div>
  );
}

const Backdrop = ({ children, onClose }) => <><div className="scrim" onClick={onClose} />{children}</>;
const Drawer = ({ title, children, onBack }) => (
  <aside className="drawer">
    <div className="drawer-head">
      <div className="row">{onBack && <button className="btn ghost xs" onClick={onBack}>←</button>}<b style={{ fontSize: 15.5 }}>{title}</b></div>
      <button className="btn ghost xs" onClick={children && title.includes('🎉') ? undefined : onClose} style={{ visibility: title.includes('🎉') ? 'hidden' : undefined }}>✕</button>
    </div>
    <div className="drawer-body">{children}</div>
  </aside>
);

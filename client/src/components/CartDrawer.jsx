// OrderPilot — cart slide-over: live quote engine, coupons, 2-step checkout
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, INR } from '../api.js';
import { useApp } from '../store.jsx';
import { Field, Spinner } from './ui.jsx';
import { DemoQR, CardForm, BankPicker, useGateway, PaySummary } from './pay.jsx';

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
  const [step, setStep] = useState('cart'); // cart | checkout | pay | done
  const [ship, setShip] = useState({ ...blankShip, ...(user ? { name: user.name, phone: user.phone || '' } : {}) });
  const [pay, setPay] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [upiId, setUpiId] = useState('aarav@okdemo');
  const [bank, setBank] = useState('');
  const [cardOk, setCardOk] = useState(false);
  const [payRef, setPayRef] = useState('');
  const gateway = useGateway();

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
    return <Backdrop onClose={onClose}><Drawer title="Your cart 🧺" onClose={onClose}><div style={{ textAlign: 'center', padding: '46px 10px' }}>
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
        setStep('checkout');
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
      <Drawer title={step === 'cart' ? 'Your cart 🧺' : step === 'checkout' ? 'Shipping details 🧾' : step === 'pay' ? 'Demo payment 💳' : 'Order placed 🎉'} onBack={step === 'checkout' ? () => setStep('cart') : step === 'pay' ? () => setStep('checkout') : undefined} onClose={onClose} hideClose={step === 'done'}>
        {step === 'cart' && (
          cart.length === 0 ? <div style={{ textAlign: 'center', padding: '50px 10px' }}><div style={{ fontSize: 40 }}>🛒</div><p className="sub" style={{ margin: '12px 0 18px' }}>Nothing here yet — add some gear!</p><button className="btn" onClick={onClose}>Browse shop</button></div> :
          <>
            <div className="steps" style={{ marginBottom: 6 }}><div className="on">1 · Cart</div><div>2 · Details</div><div>3 · Payment</div><div>4 · Done</div></div>
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
            <div className="steps" style={{ marginBottom: 6 }}><div className="done">1 · Cart</div><div className="on">2 · Details</div><div>3 · Payment</div><div>4 · Done</div></div>
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
            <button className="btn primary block" disabled={busy || quoting || !quote} onClick={() => (pay === 'COD' ? submit() : setStep('pay'))}>
              {busy ? <Spinner small /> : pay === 'COD' ? `Place order · pay ${quote ? INR(quote.total) : '…'} on delivery` : `Continue to payment · ${quote ? INR(quote.total) : '…'}`}
            </button>
            <p className="hint" style={{ textAlign: 'center' }}>🔒 Demo checkout — the payment gateway below is simulated end-to-end.</p>
          </>
        )}

        {step === 'pay' && quote && (
          <>
            <div className="steps" style={{ marginBottom: 6 }}><div className="done">1 · Cart</div><div className="done">2 · Details</div><div className="on">3 · Payment</div><div>4 · Done</div></div>
            <div className="row between" style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14 }}>
              <span className="small mut">Paying to <b style={{ color: 'var(--text)' }}>OrderPilot Demo Store</b></span>
              <b style={{ fontSize: 15 }}>{INR(quote.total)}</b>
            </div>
            <div className="row" style={{ gap: 6, marginBottom: 12, justifyContent: 'center' }}>
              {PAY.filter((p) => p.id !== 'COD').map((p) => (
                <button key={p.id} type="button" className={`chip chip-btn ${pay === p.id ? 'on' : ''}`} style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setPay(p.id)}>{p.icon} {p.label}</button>
              ))}
            </div>
            {pay === 'UPI' && (
              <div style={{ textAlign: 'center' }}>
                <DemoQR text={`upi://pay?pa=${upiId || 'demo@okhdfcbank'}&am=${quote.total}&tn=OrderPilot`} />
                <p className="small faint" style={{ margin: '10px 0' }}>📱 “Scan” with any UPI app — the QR is simulated</p>
                <Field label="or enter your UPI ID" hint="any value works — demo auto-approves">
                  <input className="input mono" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okbank" />
                </Field>
              </div>
            )}
            {pay === 'CARD' && <CardForm onValid={setCardOk} />}
            {pay === 'NETBANKING' && (
              <>
                <b className="h3">Choose your bank</b>
                <div className="mt10"><BankPicker bank={bank} setBank={setBank} /></div>
              </>
            )}
            <div className="mt10">{gateway.ui}</div>
            {!gateway.busy && !busy && (
              <button className="btn primary block"
                disabled={(pay === 'CARD' && !cardOk) || (pay === 'NETBANKING' && !bank)}
                onClick={() => {
                  const steps = pay === 'UPI' ? ['Opening demo UPI app…', 'Awaiting push approval…']
                    : pay === 'CARD' ? ['Tokenizing card (PCI-safe demo)…', 'Requesting bank authorization…', '3-D Secure verified ✓']
                    : [`Redirecting to ${bank} demo portal…`, 'Debiting savings account…'];
                  gateway.run(steps, async () => { setPayRef(`demo_txn_${Date.now().toString(36).toUpperCase()}`); await submit(); });
                }}>
                Pay {INR(quote.total)} →
              </button>
            )}
            {busy && !gateway.ui && <button className="btn primary block" disabled><Spinner small /> Confirming with merchant…</button>}
            <p className="hint mt10" style={{ textAlign: 'center' }}>Simulated gateway · auto-approves in ~2s · no real money moves.</p>
          </>
        )}

        {step === 'done' && placed && (
          <div style={{ textAlign: 'center', padding: '18px 4px' }}>
            <div style={{ fontSize: 58, animation: 'pop .5s cubic-bezier(.5,1.8,.4,1) both' }}>🎉</div>
            <h3 style={{ margin: '10px 0 4px' }}>Order placed!</h3>
            <p className="sub">Your order number is</p>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, margin: '8px 0', background: 'var(--grad-soft)', padding: '10px 14px', borderRadius: 12, display: 'inline-block' }}>{placed.order_number}</div>
            <div style={{ textAlign: 'left', display: 'grid', gap: 8, margin: '12px 0' }}>
              {placed.payment_method === 'COD'
                ? <div className="small mut" style={{ padding: '10px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.35)', borderRadius: 12 }}>💵 {INR(placed.total)} to pay on delivery — order is live now</div>
                : <PaySummary total={placed.total} method={placed.payment_method} txRef={payRef} />}
              <div className="small faint" style={{ textAlign: 'center' }}>GST {INR(placed.tax)} · shipping {placed.shipping_fee === 0 ? 'FREE' : INR(placed.shipping_fee)}{placed.discount ? ` · coupon −${INR(placed.discount)}` : ''}</div>
            </div>
            <div className="row mt10" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={onClose}>Keep shopping</button>
              <button className="btn" onClick={() => { onClose(); nav(`/orders/${placed.id}`); }}>Track this order</button>
              <button className="btn ok" onClick={() => { onClose(); nav(`/orders/${placed.id}`, { state: { autoplay: true } }); }}>🚀 Watch it ship (demo)</button>
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
const Drawer = ({ title, children, onBack, onClose, hideClose }) => (
  <aside className="drawer">
    <div className="drawer-head">
      <div className="row">{onBack && <button className="btn ghost xs" onClick={onBack}>←</button>}<b style={{ fontSize: 15.5 }}>{title}</b></div>
      {!hideClose && <button className="btn ghost xs" onClick={onClose}>✕</button>}
    </div>
    <div className="drawer-body">{children}</div>
  </aside>
);

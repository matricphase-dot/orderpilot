// OrderPilot — /api/orders  (place, list, view, update, cancel, status-flow, track)
import { Router } from 'express';
import { db, nextOrderNumber, ORDER_STATUSES, NEXT_STATUS, CANCELLABLE, FULFILLABLE } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { asInt, round2, validateShipping, applyCoupon, httpError } from '../util.js';

const r = Router();
const FREE_SHIP_ABOVE = 4999;
const SHIPPING_FEE = 99;
const COD_FEE = 25;
const TAX_RATE = 0.05; // 5% GST demo

const EVT = {
  PENDING: 'Order placed — awaiting confirmation.',
  CONFIRMED: 'Order confirmed by the fulfilment team.',
  PACKED: 'Items picked and packed at the warehouse.',
  SHIPPED: 'Handed over to carrier — in transit.',
  OUT_FOR_DELIVERY: 'Out for delivery with your courier partner.',
  DELIVERED: 'Delivered. We hope you love your order!',
  CANCELLED: 'Order cancelled.',
};

const addEvent = (orderId, status, message, actor = 'system') =>
  db.prepare('INSERT INTO order_events (order_id, status, message, actor) VALUES (?,?,?,?)').run(orderId, status, message, actor);

const orderRow = (id) => {
  const o = db.prepare(`SELECT o.*, u.name AS customer_name, u.email AS customer_email FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=?`).get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  o.events = db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY id').all(id);
  o.next_statuses = NEXT_STATUS[o.status] || [];
  o.can_cancel = CANCELLABLE.has(o.status);
  o.can_edit = o.status === 'PENDING' || o.status === 'CONFIRMED';
  return o;
};

/** Pricing engine shared by /quote and POST / */
function priceCart(items, couponCode, paymentMethod) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(422, 'Cart is empty — add at least one item.', 'items');
  const lines = items.map(({ productId, qty }) => {
    const q = asInt(qty, 0);
    if (q < 1 || q > 99) throw httpError(422, `Invalid quantity for product ${productId}.`, 'items');
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(asInt(productId, 0));
    if (!p) throw httpError(404, `Product ${productId} not found or inactive.`, 'items');
    if (p.stock < q) throw httpError(409, `Only ${p.stock} left of "${p.name}".`, 'stock');
    return { product: p, qty: q, line_total: round2(p.price * q) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const { discount, coupon } = applyCoupon(couponCode, subtotal);
  const taxable = round2(subtotal - discount);
  const shipping_fee = taxable >= FREE_SHIP_ABOVE || taxable === 0 ? 0 : SHIPPING_FEE;
  const cod_fee = paymentMethod === 'COD' ? COD_FEE : 0;
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + shipping_fee + tax + cod_fee);
  return { lines, subtotal, discount, coupon, shipping_fee, cod_fee, tax, total };
}

// ── Quote (no side effects; used live by the cart drawer) ──────────────────
r.post('/quote', (req, res) => {
  const { items, coupon, paymentMethod } = req.body || {};
  const p = priceCart(items, coupon, paymentMethod);
  res.json({
    subtotal: p.subtotal, discount: p.discount, coupon: p.coupon, shipping_fee: p.shipping_fee,
    cod_fee: p.cod_fee, tax: p.tax, total: p.total,
    lines: p.lines.map(l => ({ productId: l.product.id, name: l.product.name, qty: l.qty, unit_price: l.product.price, line_total: l.line_total })),
  });
});

// ── PLACE ORDER ────────────────────────────────────────────────────────────
r.post('/', requireAuth, (req, res) => {
  const { items, coupon, paymentMethod, shipping, notes } = req.body || {};
  const pm = String(paymentMethod || '').toUpperCase();
  if (!['UPI', 'CARD', 'NETBANKING', 'COD'].includes(pm)) throw httpError(422, 'payment_method must be one of UPI, CARD, NETBANKING, COD.', 'payment_method');
  const shipErrs = validateShipping(shipping);
  if (shipErrs.length) throw httpError(422, `Shipping details invalid — ${shipErrs.join('; ')}`, 'shipping');

  const place = db.transaction(() => {
    const p = priceCart(items, coupon, pm);
    const number = nextOrderNumber();
    const payStatus = pm === 'COD' ? 'PENDING_PAYMENT' : 'PAID'; // simulated gateway
    const cols = ['order_number', 'customer_id', 'status', 'payment_method', 'payment_status', 'subtotal', 'shipping_fee', 'tax', 'discount', 'cod_fee', 'total', 'coupon_code',
      'ship_name', 'ship_phone', 'ship_addr', 'ship_city', 'ship_state', 'ship_pincode', 'notes'];
    const vals = [number, req.user.id, 'PENDING', pm, payStatus, p.subtotal, p.shipping_fee, p.tax, p.discount, p.cod_fee, p.total, p.coupon,
      shipping.name.trim(), shipping.phone, shipping.address.trim(), shipping.city.trim(), shipping.state.trim(), shipping.pincode,
      String(notes || '').slice(0, 400)];
    if (cols.length !== vals.length) throw new Error('INSERT arity mismatch');
    const info = db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const orderId = info.lastInsertRowid;
    const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit_price, qty, line_total) VALUES (?,?,?,?,?,?)');
    const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const l of p.lines) {
      const upd = decStock.run(l.qty, l.product.id, l.qty);
      if (upd.changes !== 1) throw httpError(409, `"${l.product.name}" just went out of stock — please adjust your cart.`, 'stock');
      insItem.run(orderId, l.product.id, l.product.name, l.product.price, l.qty, l.line_total);
    }
    addEvent(orderId, 'PENDING', `${EVT.PENDING} Payment: ${pm}${pm === 'COD' ? ' (collect on delivery)' : ' — confirmed'}.`, `#${req.user.id} ${req.user.name}`);
    return orderId;
  });

  const order = orderRow(place());
  res.status(201).json({ order, message: `Order ${order.order_number} placed successfully!` });
});

// ── LIST (with filters + pagination) ───────────────────────────────────────
r.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, asInt(req.query.page, 1));
  const limit = Math.min(50, Math.max(5, asInt(req.query.limit, 10)));
  const conds = [], args = [];
  if (req.user.role !== 'admin' || req.query.scope === 'mine') { conds.push('o.customer_id = ?'); args.push(req.user.id); }
  if (req.query.status) {
    const st = String(req.query.status).toUpperCase();
    if (!ORDER_STATUSES.includes(st)) throw httpError(422, `Unknown status "${st}".`, 'status');
    conds.push('o.status = ?'); args.push(st);
  }
  if (req.query.q) { conds.push('(o.order_number LIKE ? OR u.name LIKE ? OR o.ship_city LIKE ?)'); const l = `%${req.query.q}%`; args.push(l, l, l); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM orders o JOIN users u ON u.id=o.customer_id ${where}`).get(...args).c;
  const items = db.prepare(`
    SELECT o.*, u.name AS customer_name, u.email AS customer_email,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS item_count,
      (SELECT SUM(oi.qty) FROM order_items oi WHERE oi.order_id=o.id) AS unit_count
    FROM orders o JOIN users u ON u.id=o.customer_id ${where}
    ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  for (const o of items) { o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id); }
  res.json({ items, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

// ── PUBLIC TRACKING (no auth, order number + email/pincode verification) ──
r.get('/track/:orderNumber', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(req.params.orderNumber).trim().toUpperCase());
  if (!o) throw httpError(404, 'No order found with that number.');
  const verify = String(req.query.verify || '').trim().toLowerCase();
  const owner = db.prepare('SELECT email, phone FROM users WHERE id=?').get(o.customer_id);
  const ok = verify && (verify === owner.email || verify === owner.phone || verify === o.ship_pincode);
  const events = db.prepare('SELECT status, message, created_at FROM order_events WHERE order_id=? ORDER BY id').all(o.id);
  if (!ok) {
    // unverified lookups only see a masked, minimal view
    return res.json({
      verified: false, order_number: o.order_number, status: o.status,
      current_message: events.at(-1)?.message || '', updated_at: o.updated_at,
      eta: o.delivered_at ? 'Delivered' : deliveryEta(o.created_at),
      hint: 'Verify with registered email / phone / pincode for full tracking.',
    });
  }
  const items = db.prepare('SELECT name, qty, unit_price, line_total FROM order_items WHERE order_id=?').all(o.id);
  res.json({
    verified: true, order: { ...orderRow(o.id), customer_name: undefined, customer_email: undefined,
      ship_phone: maskPhone(o.ship_phone), ship_addr: o.ship_addr }, items, eta: o.delivered_at ? 'Delivered' : deliveryEta(o.created_at),
  });
});
const deliveryEta = (createdAt) => {
  const d = new Date(createdAt.replace(' ', 'T') + 'Z');
  d.setDate(d.getDate() + (d.getDay() === 5 ? 5 : 4));
  return d.toISOString().slice(0, 10);
};
const maskPhone = (p) => p ? `•••••${String(p).slice(-4)}` : p;

// ── SINGLE ORDER ───────────────────────────────────────────────────────────
r.get('/:id(\\d+)', requireAuth, (req, res) => {
  const o = orderRow(asInt(req.params.id, 0));
  if (!o) throw httpError(404, 'Order not found.');
  if (req.user.role !== 'admin' && o.customer_id !== req.user.id) throw httpError(403, 'This order belongs to another account.');
  res.json({ order: o });
});

// ── UPDATE order (shipping / notes) ────────────────────────────────────────
r.patch('/:id(\\d+)', requireAuth, (req, res) => {
  const id = asInt(req.params.id, 0);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw httpError(404, 'Order not found.');
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && o.customer_id !== req.user.id) throw httpError(403, 'Not your order.');
  if (!isAdmin && !FULFILLABLE.has(o.status)) throw httpError(409, `Orders in "${o.status}" can no longer be edited. Contact support once shipped.`, 'status');

  const fields = [], args = [];
  if (req.body.shipping) {
    const errs = validateShipping(req.body.shipping);
    if (errs.length) throw httpError(422, `Shipping details invalid — ${errs.join('; ')}`, 'shipping');
    const s = req.body.shipping;
    fields.push('ship_name=?', 'ship_phone=?', 'ship_addr=?', 'ship_city=?', 'ship_state=?', 'ship_pincode=?');
    args.push(s.name.trim(), s.phone, s.address.trim(), s.city.trim(), s.state.trim(), s.pincode);
    addEvent(id, o.status, 'Shipping address updated.', `#${req.user.id} ${req.user.name}`);
  }
  if (req.body.notes !== undefined) { fields.push('notes=?'); args.push(String(req.body.notes).slice(0, 400)); }
  if (isAdmin && req.body.carrier) {
    fields.push('carrier=?', 'awb=?'); args.push(String(req.body.carrier), String(req.body.awb || `AWB${Date.now().toString(36).toUpperCase()}`));
    addEvent(id, o.status, `Dispatch label created — ${req.body.carrier} AWB ${req.body.awb || ''}`.trim(), `#${req.user.id} ${req.user.name}`);
  }
  if (!fields.length) throw httpError(422, 'Nothing to update — provide shipping, notes or carrier.');
  db.prepare(`UPDATE orders SET ${fields.join(', ')}, updated_at=datetime('now') WHERE id=?`).run(...args, id);
  res.json({ order: orderRow(id), message: 'Order updated.' });
});

// ── CANCEL order (restock + refund) ────────────────────────────────────────
const restockOrder = (orderId) => {
  const upd = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(orderId)) upd.run(it.qty, it.product_id);
};
r.post('/:id(\\d+)/cancel', requireAuth, (req, res) => {
  const id = asInt(req.params.id, 0);
  const cancel = db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!o) throw httpError(404, 'Order not found.');
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && o.customer_id !== req.user.id) throw httpError(403, 'Not your order.');
    if (!CANCELLABLE.has(o.status)) throw httpError(409, `An order that is already "${o.status}" cannot be cancelled. Use returns after delivery.`, 'status');
    const reason = String(req.body?.reason || 'No reason provided').slice(0, 200);
    restockOrder(id);
    const refundNote = o.payment_status === 'PAID' ? 'Refund initiated — ₹' + o.total + ' to original payment method (3–5 business days).' : 'COD order cancelled — no payment due.';
    db.prepare(`UPDATE orders SET status='CANCELLED', payment_status = CASE WHEN payment_status='PAID' THEN 'REFUNDED' ELSE payment_status END,
      cancelled_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(id);
    addEvent(id, 'CANCELLED', `${EVT.CANCELLED} Reason: ${reason}. ${refundNote}`, `#${req.user.id} ${req.user.name}`);
    return orderRow(id);
  });
  res.json({ order: cancel(), message: 'Order cancelled and stock released.' });
});

// ── STATUS FLOW (admin; FSM-validated; generates AWB at SHIPPED) ──────────
/** Shared transition core: validates the FSM, applies stage side-effects, appends a tracking event. */
const applyStatus = (id, next, { note = '', actor = 'system', carrier, awb } = {}) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw httpError(404, 'Order not found.');
  if (!ORDER_STATUSES.includes(next)) throw httpError(422, `Unknown status "${next}".`, 'status');
  if (next === o.status) throw httpError(422, `Order is already "${next}".`, 'status');
  if (!NEXT_STATUS[o.status].includes(next)) {
    throw httpError(409, `Illegal transition ${o.status} → ${next}. Allowed: ${NEXT_STATUS[o.status].join(', ') || '(none — terminal)'}.`, 'status');
  }
  const noteTxt = note ? ` Note: ${String(note).slice(0, 200)}` : '';
  const set = ["status=?", "updated_at=datetime('now')"];
  const args = [next];
  if (next === 'CANCELLED') {
    restockOrder(id);
    set.push(`payment_status = CASE WHEN payment_status='PAID' THEN 'REFUNDED' ELSE payment_status END`, "cancelled_at=datetime('now')");
  }
  if (next === 'DELIVERED') set.push("delivered_at=datetime('now')", `payment_status = CASE WHEN payment_status='PENDING_PAYMENT' THEN 'PAID' ELSE payment_status END`);
  if (next === 'SHIPPED') {
    const awbNo = awb || `AWB${Date.now().toString(36).toUpperCase()}`;
    set.push('awb=?', 'carrier=COALESCE(?, carrier)'); args.push(awbNo, carrier || 'Delhivery');
  }
  db.prepare(`UPDATE orders SET ${set.join(', ')} WHERE id=?`).run(...args, id);
  const msg = next === 'CANCELLED' ? `${EVT.CANCELLED}${noteTxt} Stock returned to inventory; refund handled by finance.` : `${EVT[next]}${noteTxt}`;
  addEvent(id, next, msg, actor);
  return orderRow(id);
};

r.patch('/:id(\\d+)/status', requireAdmin, (req, res) => {
  const id = asInt(req.params.id, 0);
  const next = String(req.body?.status || '').toUpperCase();
  const order = db.transaction(() => applyStatus(id, next, {
    note: req.body?.note, carrier: req.body?.carrier, awb: req.body?.awb,
    actor: `#${req.user.id} ${req.user.name}`,
  }))();
  res.json({ order, message: `Order moved to ${next}.` });
});

// ── DEMO AUTOPILOT ─ advances one fulfilment step per call (owner or admin).
// Enabled unless DEMO_MODE=0 — for showing the full journey in interviews.
r.post('/:id(\\d+)/autopilot', requireAuth, (req, res) => {
  if (String(process.env.DEMO_MODE ?? '1') === '0') throw httpError(403, 'Demo autopilot is disabled on this deployment (DEMO_MODE=0).');
  const id = asInt(req.params.id, 0);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw httpError(404, 'Order not found.');
  if (req.user.role !== 'admin' && o.customer_id !== req.user.id) throw httpError(403, 'Not your order.');
  const path = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const i = path.indexOf(o.status);
  if (i < 0) throw httpError(409, `An order that is "${o.status}" can't run the fulfilment demo.`, 'status');
  const to = String(req.body?.to || 'DELIVERED').toUpperCase();
  const j = path.indexOf(to);
  if (j < 0) throw httpError(422, `Invalid target "${to}" — autopilot walks the happy path only.`, 'to');
  if (j <= i) throw httpError(422, `"${to}" is not ahead of the current stage "${o.status}".`, 'to');
  const next = path[i + 1];
  const order = db.transaction(() => applyStatus(id, next, {
    actor: `demo autopilot · #${req.user.id} ${req.user.name}`,
    note: req.body?.note,
  }))();
  res.json({ order, stage: next, remaining: j - i - 1, message: `🤖 Demo: order advanced to ${next}.` });
});

export default r;

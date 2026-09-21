// OrderPilot — end-to-end API test against the running server (node test client)
const B = 'http://localhost:4000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌ FAIL'} ${name} ${extra}`); };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const SKU = 'TEST-' + Date.now().toString(36).toUpperCase();
const SHIP = { name: 'Aarav Sharma', phone: '9820011223', address: '402 Sea Breeze Apartments, Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' };

// auth
const cust = (await api('/auth/login', { method: 'POST', body: { email: 'aarav@example.com', password: 'demo@123' } })).json;
const adm = (await api('/auth/login', { method: 'POST', body: { email: 'admin@orderpilot.dev', password: 'admin@123' } })).json;
ok('login customer+admin', !!cust.token && !!adm.token);
ok('wrong password → 401', (await api('/auth/login', { method: 'POST', body: { email: 'aarav@example.com', password: 'x' } })).status === 401);
const reg = await api('/auth/register', { method: 'POST', body: { name: 'Test User', email: `t${Date.now()}@ex.com`, password: 'test@123' } });
ok('register → 201 + token', reg.status === 201 && !!reg.json.token);

// catalog
const prods = (await api('/products')).json.items;
ok('products listed', prods.length >= 12, `(${prods.length})`);

// quote engine
const q1 = await api('/orders/quote', { method: 'POST', body: { items: [{ productId: 1, qty: 2 }, { productId: 6, qty: 1 }], coupon: 'FIRST10', paymentMethod: 'UPI' } });
ok('quote computes totals', q1.json.subtotal === prods[0].price * 2 + prods[5].price && q1.json.discount > 0, `sub=${q1.json.subtotal} disc=${q1.json.discount} total=${q1.json.total}`);
ok('bad coupon → 422', (await api('/orders/quote', { method: 'POST', body: { items: [{ productId: 1, qty: 1 }], coupon: 'ZZZ' } })).status === 422);
ok('below coupon min → 422', (await api('/orders/quote', { method: 'POST', body: { items: [{ productId: 11, qty: 1 }], coupon: 'PILOT500' } })).status === 422);

// place order
const stockBefore = (await api('/products/1')).json.stock;
const placed = await api('/orders', { method: 'POST', token: cust.token, body: { items: [{ productId: 1, qty: 2 }, { productId: 6, qty: 1 }], paymentMethod: 'UPI', coupon: 'FIRST10', shipping: SHIP, notes: 'Leave at door' } });
const O = placed.json.order;
ok('place order → 201 PENDING', placed.status === 201 && O.status === 'PENDING' && /^OP-\d{4}-\d{3}$/.test(O.order_number), O.order_number);
ok('payment auto-PAID for UPI', O.payment_status === 'PAID');
ok('stock decremented', (await api('/products/1')).json.stock === stockBefore - 2);
ok('bad shipping → 422', (await api('/orders', { method: 'POST', token: cust.token, body: { items: [{ productId: 1, qty: 1 }], paymentMethod: 'UPI', shipping: { name: 'x' } } })).status === 422);
ok('oversell → 409/422', [409, 422].includes((await api('/orders', { method: 'POST', token: cust.token, body: { items: [{ productId: 9, qty: 99 }], paymentMethod: 'UPI', shipping: SHIP } })).status));
ok('no token → 401', (await api('/orders', { method: 'POST', body: { items: [] } })).status === 401);

// read + ownership
ok('get own order', (await api(`/orders/${O.id}`, { token: cust.token })).status === 200);
const meera = (await api('/auth/login', { method: 'POST', body: { email: 'meera@example.com', password: 'demo@123' } })).json;
ok("other customer → 403", (await api(`/orders/${O.id}`, { token: meera.token })).status === 403);
ok('admin sees all orders', (await api('/orders?limit=50', { token: adm.token })).json.total >= 14);
const filt = (await api('/orders?status=PENDING', { token: adm.token })).json;
ok('status filter works', filt.items.every(o => o.status === 'PENDING'), `(${filt.total} pending)`);

// update
const upd = await api(`/orders/${O.id}`, { method: 'PATCH', token: cust.token, body: { shipping: { ...SHIP, address: '99 Marine Drive Cottage, Near Post Office', pincode: '400020' }, notes: 'Ring bell twice' } });
ok('update shipping (PENDING)', upd.json.order?.ship_pincode === '400020');
ok('address-update logged as event', upd.json.order.events.some(e => /address updated/i.test(e.message)));

// admin status flow — full happy path
let prev = O.status;
for (const s of ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
  const st = await api(`/orders/${O.id}/status`, { method: 'PATCH', token: adm.token, body: { status: s } });
  if (st.status !== 200) { ok(`transition ${prev}→${s}`, false, JSON.stringify(st.json)); break; }
  prev = s;
}
ok('full flow PENDING→DELIVERED', prev === 'DELIVERED');
const after = (await api(`/orders/${O.id}`, { token: cust.token })).json.order;
ok('AWB generated at SHIPPED', !!after.awb, after.awb);
ok('delivered_at set', !!after.delivered_at);
ok('6-event tracking trail', after.events.length >= 6, `(${after.events.length})`);
ok('terminal state → no more moves', (await api(`/orders/${O.id}/status`, { method: 'PATCH', token: adm.token, body: { status: 'CANCELLED' } })).status === 409);
ok('customer cannot change status', (await api(`/orders/${O.id}/status`, { method: 'PATCH', token: cust.token, body: { status: 'PACKED' } })).status === 403);

// cancel + restock on a fresh order
const s2 = (await api('/products/2')).json.stock;
const cOrd = (await api('/orders', { method: 'POST', token: cust.token, body: { items: [{ productId: 2, qty: 3 }], paymentMethod: 'COD', shipping: SHIP } })).json.order;
ok('COD order PENDING_PAYMENT', cOrd.payment_status === 'PENDING_PAYMENT' && (await api('/products/2')).json.stock === s2 - 3);
const cx = await api(`/orders/${cOrd.id}/cancel`, { method: 'POST', token: cust.token, body: { reason: 'Ordered wrong variant' } });
ok('cancel → CANCELLED', cx.json.order?.status === 'CANCELLED' && !!cx.json.order.cancelled_at);
ok('stock restocked on cancel', (await api('/products/2')).json.stock === s2);
ok('cancel event logged', cx.json.order.events.at(-1).message.includes('Ordered wrong variant'));
ok('double cancel → 409', (await api(`/orders/${cOrd.id}/cancel`, { method: 'POST', token: cust.token })).status === 409);

// public tracking
const trk = await api(`/orders/track/${O.order_number}`);
ok('track masked without proof', trk.json.verified === false && !trk.json.order);
const trk2 = await api(`/orders/track/${O.order_number}?verify=400020`);
ok('track verified with pincode', trk2.json.verified === true && trk2.json.order.status === 'DELIVERED' && trk2.json.verified);
ok('phone masked in verified view', String(trk2.json.order.ship_phone).startsWith('•••••'));
ok('unknown number → 404', (await api('/orders/track/OP-2026-9999')).status === 404);

// admin product CRUD + stats
const np = await api('/products', { method: 'POST', token: adm.token, body: { sku: SKU, name: 'Test Widget', price: 999, stock: 5, category: 'home', emoji: '🧪' } });
ok('admin create product', np.status === 201);
ok('duplicate SKU → 409', (await api('/products', { method: 'POST', token: adm.token, body: { sku: SKU, name: 'dup', price: 10 } })).status === 409);
ok('customer create product → 403', (await api('/products', { method: 'POST', token: cust.token, body: { sku: 'HACK', name: 'x', price: 1 } })).status === 403);
const patch = await api(`/products/${np.json.id}`, { method: 'PATCH', token: adm.token, body: { price: 1499, stock: 9 } });
ok('admin patch product', patch.json.price === 1499 && patch.json.stock === 9);
const ov = (await api('/stats/overview', { token: adm.token })).json;
ok('stats overview', ov.totals.orders >= 15 && typeof ov.totals.revenue === 'number', `revenue=₹${ov.totals.revenue}`);
ok('revenue-daily 14 pts', (await api('/stats/revenue-daily', { token: adm.token })).json.series.length === 14);
ok('funnel monotonic', ((f) => f.counts.every((c, i) => i === 0 || f.counts[i - 1] >= c))((await api('/stats/funnel', { token: adm.token })).json));
ok('404 for unknown api route', (await api('/nope')).status === 404);

console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

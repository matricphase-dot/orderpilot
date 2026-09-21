// OrderPilot — demo seed (products, users, and a spread of orders across every lifecycle stage)
import { db, nextOrderNumber } from './db.js';
import { hashPassword } from './auth.js';
import { round2 } from './util.js';

const run = db.transaction(() => {
  const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (existing > 0 && !process.env.SEED_FORCE) {
    console.log('Database already seeded — skipping (set SEED_FORCE=1 to wipe & reseed).');
    return;
  }
  if (process.env.SEED_FORCE) {
    for (const t of ['order_events', 'order_items', 'orders', 'products', 'users']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items','order_events','products','users')`).run();
  }

  // ── users ──
  const mk = db.prepare('INSERT INTO users (name,email,phone,role,pass_salt,pass_hash) VALUES (?,?,?,?,?,?)');
  const mkUser = (name, email, phone, role, pass) => { const { salt, hash } = hashPassword(pass); mk.run(name, email, phone, role, salt, hash); };
  mkUser('Priya Admin', 'admin@orderpilot.dev', '9000000001', 'admin', 'admin@123');
  mkUser('Aarav Sharma', 'aarav@example.com', '9820011223', 'customer', 'demo@123');
  mkUser('Meera Nair', 'meera@example.com', '9867712345', 'customer', 'demo@123');
  mkUser('Rohan Gupta', 'rohan@example.com', '9987054321', 'customer', 'demo@123');
  mkUser('Sara Ali', 'sara@example.com', '9812345678', 'customer', 'demo@123');

  // ── products ──
  const P = [
    ['AUR-EP10', 'Aurora Pro ANC Earbuds', 'audio', 'Active noise-cancelling TWS with 42h battery, wireless charging case.', 5499, 48, '🎧', '#8b5cf6'],
    ['NIM-WCH01', 'Nimbus Chrono Smartwatch', 'wearables', 'AMOLED smartwatch · SpO₂, GPS, 14-day battery, 5ATM.', 8999, 25, '⌚', '#06b6d4'],
    ['VOX-MIC-L', 'VoxCast Studio Microphone', 'audio', 'Cardioid USB condenser mic with zero-latency monitoring.', 6499, 18, '🎙️', '#f59e0b'],
    ['KBD-TKL87', 'Tactile TKL Mechanical Keyboard', 'accessories', 'Hot-swap 87-key board, gasket mount, RGB, PBT caps.', 7299, 32, '⌨️', '#22c55e'],
    ['MSL-XM-G', 'Muscle X Mouse Wireless', 'accessories', '8K Hz polling ultra-light gaming mouse, 26K DPI sensor.', 4299, 40, '🖱️', '#ec4899'],
    ['PYK-65W', 'Pyko 65W GaN Charger', 'power', '4-port GaN fast charger — laptop to phone, one brick.', 2499, 60, '🔌', '#3b82f6'],
    ['PWR-BNK20', 'PowerVault 20K PD Bank', 'power', '20,000 mAh PD 3.1 power bank with 140W passthrough.', 3499, 22, '🪫', '#ef4444'],
    ['LMP-DESK1', 'Lumen Desk Lamp Pro', 'home', 'Bias-lighting monitor bar with auto dimming & warm modes.', 1999, 55, '💡', '#eab308'],
    ['CAM-4K-W', 'Sentinel 4K Webcam', 'home', 'AI-framed 4K webcam with dual mics and privacy shutter.', 7999, 15, '📷', '#14b8a6'],
    ['SPK-360', 'EchoSphere 360 Speaker', 'audio', '360° room-filling speaker, IP67, 24h playtime.', 4999, 28, '🔊', '#a855f7'],
    ['TAB-STN-M', 'Mesa Tablet Stand Alu', 'accessories', 'Solid aluminium adjustable stand for 8–13" tablets.', 1299, 70, '📐', '#64748b'],
    ['HUB-USBC9', 'Orbit USB-C 9-in-1 Hub', 'power', 'HDMI 4K60, gigabit LAN, SD/microSD, 100W PD passthrough.', 3999, 35, '🧩', '#0ea5e9'],
  ];
  const insP = db.prepare('INSERT INTO products (sku,name,category,description,price,stock,emoji,accent) VALUES (?,?,?,?,?,?,?,?)');
  for (const [sku, name, cat, desc, price, stock, emoji, accent] of P) insP.run(sku, name, cat, desc, price, stock, emoji, accent);
  const products = db.prepare('SELECT * FROM products').all();
  const pick = (i) => products[i % products.length];

  // ── orders spread over 13 days, every status ──
  const customers = db.prepare(`SELECT id, name FROM users WHERE role='customer' ORDER BY id`).all();
  const addEvent = (oId, status, message, mins, actor = 'system') =>
    db.prepare(`INSERT INTO order_events (order_id,status,message,actor,created_at) VALUES (?,?,?,?,datetime('now', ?))`)
      .run(oId, status, message, actor, `+${mins} minutes`);

  const SHIP = [
    { name: 'Aarav Sharma', phone: '9820011223', address: '402 Sea Breeze Apartments, Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' },
    { name: 'Meera Nair', phone: '9867712345', address: '12 Palm Villa Road, Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' },
    { name: 'Rohan Gupta', phone: '9987054321', address: 'B-14 Sector 62, Noida', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301' },
    { name: 'Sara Ali', phone: '9812345678', address: '7 Alipore Lane, Lake Town', city: 'Kolkata', state: 'West Bengal', pincode: '700089' },
  ];
  const PM = ['UPI', 'CARD', 'COD', 'NETBANKING'];

  const plan = [
    // [status, daysAgo, customerIdx, items, paymentIdx, coupon]
    ['DELIVERED', 12, 0, [[0, 1], [5, 2]], 0, 'FIRST10'],
    ['DELIVERED', 10, 1, [[3, 1]], 1, null],
    ['CANCELLED', 9, 2, [[4, 1]], 0, null],
    ['DELIVERED', 8, 3, [[1, 1], [10, 3]], 2, null],
    ['OUT_FOR_DELIVERY', 6, 0, [[8, 1]], 0, null],
    ['SHIPPED', 5, 1, [[2, 1], [5, 1]], 1, 'PILOT500'],
    ['DELIVERED', 4, 2, [[9, 2]], 0, null],
    ['PACKED', 3, 3, [[11, 1], [6, 1]], 2, null],
    ['SHIPPED', 2, 1, [[0, 2]], 0, null],
    ['CONFIRMED', 1, 0, [[7, 3], [10, 2]], 1, null],
    ['PENDING', 1, 2, [[4, 1], [5, 1]], 2, 'FIRST10'],
    ['CONFIRMED', 0, 3, [[1, 1], [8, 1]], 0, null],
    ['PENDING', 0, 0, [[6, 1], [9, 1]], 1, null],
  ];

  for (const [status, daysAgo, custIdx, lines, pmIdx, coupon] of plan) {
    const cust = customers[custIdx];
    const ship = SHIP[custIdx];
    const items = lines.map(([pi, q]) => ({ product: pick(pi), qty: q }));
    const subtotal = round2(items.reduce((s, l) => s + l.product.price * l.qty, 0));
    let discount = 0;
    if (coupon === 'FIRST10') discount = round2(subtotal * 0.10);
    if (coupon === 'PILOT500' && subtotal >= 3000) discount = 500;
    const taxable = round2(subtotal - discount);
    const shipping = taxable >= 4999 ? 0 : 99;
    const pm = PM[pmIdx % PM.length];
    const codFee = pm === 'COD' ? 25 : 0;
    const tax = round2(taxable * 0.05);
    const total = round2(taxable + shipping + tax + codFee);
    const number = nextOrderNumber();
    const created = `-${daysAgo} days`;

    const payStatus = status === 'CANCELLED' ? (pm === 'COD' ? 'PENDING_PAYMENT' : 'REFUNDED') : (pm === 'COD' && !['DELIVERED'].includes(status) ? 'PENDING_PAYMENT' : 'PAID');
    const { lastInsertRowid: oId } = db.prepare(`INSERT INTO orders
      (order_number, customer_id, status, payment_method, payment_status, subtotal, shipping_fee, tax, discount, cod_fee, total, coupon_code,
       ship_name, ship_phone, ship_addr, ship_city, ship_state, ship_pincode, notes, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?), datetime('now', ?))`)
      .run(number, cust.id, status, pm, payStatus, subtotal, shipping, tax, discount, codFee, total, coupon,
        ship.name, ship.phone, ship.address, ship.city, ship.state, ship.pincode,
        status === 'CANCELLED' ? 'Changed my mind — ordered a different model.' : '', created, created);

    for (const l of items) {
      db.prepare('INSERT INTO order_items (order_id, product_id, name, unit_price, qty, line_total) VALUES (?,?,?,?,?,?)')
        .run(oId, l.product.id, l.product.name, l.product.price, l.qty, round2(l.product.price * l.qty));
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.product.id);
    }

    // build the event trail
    const order = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const upto = status === 'CANCELLED' ? order.indexOf('PENDING') : order.indexOf(status);
    const msgs = {
      PENDING: 'Order placed — payment verified.', CONFIRMED: 'Order confirmed by the fulfilment team.',
      PACKED: 'Items picked and packed at the Mumbai hub.', SHIPPED: 'Shipped via Delhivery.',
      OUT_FOR_DELIVERY: 'Out for delivery — rider assigned.', DELIVERED: 'Delivered and signed for. ⭐ Rate your order!',
    };
    let mins = 0;
    for (let i = 0; i <= upto; i++) {
      const s = order[i];
      addEvent(oId, s, msgs[s], mins);
      mins += 60 + Math.floor(Math.random() * 900);
    }
    if (status === 'CANCELLED') {
      const cancelDay = Math.max(0, order.indexOf('PENDING') - 0);
      addEvent(oId, 'PENDING', 'Order placed — payment verified.', 0);
      addEvent(oId, 'CANCELLED', 'Order cancelled by customer. Refund initiated within 48h to source account.', 95);
      db.prepare("UPDATE orders SET cancelled_at = datetime('now', ?), payment_status = ? WHERE id = ?")
        .run(`-${daysAgo} days`, pm === 'COD' ? 'PENDING_PAYMENT' : 'REFUNDED', oId);
      // give back stock for cancelled seed orders
      for (const l of items) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(l.qty, l.product.id);
    }
    if (status === 'SHIPPED' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED') {
      db.prepare("UPDATE orders SET awb=?, carrier='Delhivery' WHERE id=?").run(`AWB${(100000 + oId * 7919).toString(36).toUpperCase()}`, oId);
    }
    if (status === 'DELIVERED') db.prepare("UPDATE orders SET delivered_at = datetime('now', ?) WHERE id=?").run(`-${Math.max(0, daysAgo - 2)} days`, oId);
  }

  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`✅ Seeded: ${c('users')} users · ${c('products')} products · ${c('orders')} orders · ${c('order_items')} line items · ${c('order_events')} tracking events`);
});

run();

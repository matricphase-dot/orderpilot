// OrderPilot — SQLite data layer (schema + migrations)
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
// Finite-state machine of legal order transitions
export const NEXT_STATUS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export const CANCELLABLE = new Set(['PENDING', 'CONFIRMED', 'PACKED']);
export const FULFILLABLE = new Set(['PENDING', 'CONFIRMED']); // editable by customer

export const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'orderpilot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  price REAL NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  emoji TEXT NOT NULL DEFAULT '📦',
  accent TEXT NOT NULL DEFAULT '#6366f1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','CARD','NETBANKING','COD')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (payment_status IN ('PENDING_PAYMENT','PAID','REFUNDED')),
  subtotal REAL NOT NULL,
  shipping_fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  cod_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  ship_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_addr TEXT NOT NULL,
  ship_city TEXT NOT NULL,
  ship_state TEXT NOT NULL,
  ship_pincode TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  awb TEXT,
  carrier TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,           -- snapshot at purchase time
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_items_order     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_events_order    ON order_events(order_id);
`);

// Order numbers derive from MAX(id) at call time, so a fresh (re)seed restarts at 001
export function nextOrderNumber() {
  const m = db.prepare('SELECT MAX(id) m FROM orders').get().m || 0;
  const y = new Date().getFullYear();
  return `OP-${y}-${String(m + 1).padStart(3, '0')}`;
}

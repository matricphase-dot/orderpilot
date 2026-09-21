# 🛒 OrderPilot — Full-Stack E-Commerce Order Management System

**🌐 Live demo: <https://orderpilot-ten.vercel.app>** · **📦 Repo: <https://github.com/matricphase-dot/orderpilot>**
*(Deployed on Vercel — React SPA served statically, the Express API runs as a serverless function with an auto-seeding SQLite demo database. Data resets on cold starts; run locally with `./run.sh` for persistence.)*

> An Intellectual-Property project: place → update → cancel → track orders through a complete lifecycle, built as a **real full-stack application** — a REST API over SQLite behind a modern React SPA, with customer and admin experiences.

![stack](https://img.shields.io/badge/React%2018-Vite%205-22d3ee) ![stack](https://img.shields.io/badge/Express%204-Node%2020-6d7cff) ![db](https://img.shields.io/badge/SQLite-WAL%20(%20better--sqlite3%20)-22c55e) ![auth](https://img.shields.io/badge/auth-scrypt%20%2B%20HMAC--JWT-f59e0b)

---

## 1. What it does

### Customer
| Feature | Detail |
|---|---|
| **Place order** | Cart → live server-priced quote (coupons, GST, shipping, COD fee) → checkout → **demo payment gateway** (UPI QR · Luhn-validated test card · net-banking) → order `OP-YYYY-NNN` |
| **Update order** | Edit delivery address / phone / notes while the order is `PENDING` or `CONFIRMED`; every edit is logged as a tracking event |
| **Cancel order** | One-click cancel until the order ships — stock is restocked automatically and refunds are marked initiated |
| **Track order** | Public tracking by order number (privacy-masked unless verified with email / phone / pincode), 6-stage animated timeline, auto-refreshing detail page |
| **Demo payment** | Simulated gateway UI: staged processing (tokenize → authorize → 3-D Secure → approved), txn receipt `demo_txn_…`; non-COD orders land `PAID`, COD flips to `PAID` at delivery |
| **Fulfilment demo** | One click on the order page ("🤖 Run fulfilment demo" / "🚀 Watch it ship" after payment) advances the *real* FSM one stage at a time — CONFIRMED → … → DELIVERED with AWB, events and live timeline |
| **Auth** | Register/login, password hashing (scrypt), stateless HMAC-signed tokens, per-customer data isolation |

### Admin (fulfilment console)
| Feature | Detail |
|---|---|
| **Dashboard** | Revenue KPIs, 14-day revenue bar chart, status donut, fulfilment funnel, top sellers, low-stock alerts, latest orders feed (live polling) |
| **Order operations** | Search / filter / paginate every order; advance lifecycle with one click (`CONFIRMED → PACKED → SHIPPED → OUT → DELIVERED`); illegal transitions rejected by a server-side **finite-state machine**; AWB generated on ship |
| **Product & stock control** | Create SKUs, edit price/stock inline; stock is decremented on purchase and restored on cancel — all inside SQL transactions |

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React 18 + Vite 5 + react-router 6** (zero UI libraries — hand-rolled design system in CSS, SVG/CSS charts) | Fast HMR dev, tiny bundle (~73 KB gz), shows real craftsmanship |
| Backend | **Node 20 + Express 4** REST API, layered routes → controllers → SQL | Industry-standard minimalism |
| Database | **SQLite via better-sqlite3** (WAL mode, foreign keys, transactions) | Zero-config, embedded, real relational modelling for a student IP |
| Auth | **scrypt password hashing + HMAC-signed bearer tokens** (JWT-shaped, built on `node:crypto`) | No external auth deps, still production-shaped |

## 3. Architecture

```
┌──────────────────────────────  Browser  ──────────────────────────────┐
│  React SPA (Vite dev :5173 / static build served by Express in prod)  │
│  Shop · Cart drawer (live /quote) · My Orders · Order Detail · Track   │
│  Admin: Dashboard · Ops table · Products        (Context store + RTL)  │
└───────────────┬────────────────────────────────────────────────────────┘
                │  fetch JSON  ·  Authorization: Bearer <token>
┌───────────────▼────────────────────────────────────────────────────────┐
│                      Express API  :4000  (/api/*)                       │
│  auth.js ── scrypt + HMAC tokens      orders.js ── FSM · stock · events │
│  products.js ── catalog CRUD          stats.js ── SQL analytics         │
├─────────────────────────────────────────────────────────────────────────┤
│  better-sqlite3 (WAL)   users · products · orders · order_items         │
│                         order_events  ← immutable tracking trail        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Order lifecycle (finite-state machine, enforced server-side)

```
PENDING ──► CONFIRMED ──► PACKED ──► SHIPPED ──► OUT_FOR_DELIVERY ──► DELIVERED
   │            │            │           │
   └────────────┴────────────┴───────────┴──► CANCELLED   (restock + refund)
```
Every transition appends an `order_events` row → this *is* the tracking timeline (audit-friendly, customer-visible).

## 4. Data model (ERD)

```
users 1 ──── * orders 1 ──── * order_items * ──── 1 products
                 │
                 └──── * order_events   (status, message, actor, time)
```

* `orders` carries pricing snapshot (`subtotal, discount, shipping_fee, tax, cod_fee, total`), shipping snapshot, `payment_status` (`PENDING_PAYMENT/PAID/REFUNDED`), `awb/carrier`, timestamps (`created_at, updated_at, cancelled_at, delivered_at`).
* Line items snapshot `name` and `unit_price` at purchase time (prices can change without corrupting history).

## 5. API reference (22 endpoints — 21 in spec + health)

Base URL `http://localhost:4000/api` — full machine-readable spec in [`openapi.yaml`](server/openapi.yaml), Postman collection in [`postman/OrderPilot.postman_collection.json`](postman/OrderPilot.postman_collection.json).

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Create customer → `{user, token}` |
| POST | `/auth/login` | — | Login → `{user, token}` |
| GET | `/auth/me` | 🔑 | Current profile |
| GET | `/products?q=&category=&sort=` | — | Browse catalog |
| GET | `/products/:id` · `/products/categories` | — | Detail / facets |
| POST/PATCH | `/products` · `/products/:id` | 👑 | Create SKU / edit price & stock |
| POST | `/orders/quote` | — | **Cart pricing engine** (coupons, GST, shipping, COD) |
| POST | `/orders` | 🔑 | **Place order** (stock check + decrement in a transaction) |
| GET | `/orders?status=&q=&page=&limit=` | 🔑 | List (customer: own only · admin: all) |
| GET | `/orders/:id` | 🔑 | Order + items + events + `next_statuses` |
| PATCH | `/orders/:id` | 🔑 | **Update** address/notes (until CONFIRMED) / carrier+AWB (admin) |
| POST | `/orders/:id/cancel` | 🔑 | **Cancel** (until SHIPPED) → restock + refund event |
| POST | `/orders/:id/autopilot` | 🔑 | **Demo** one-step fulfilment advance (owner/admin, happy path; kill switch `DEMO_MODE=0`) |
| PATCH | `/orders/:id/status` | 👑 | **Advance lifecycle** (FSM-validated) |
| GET | `/orders/track/:orderNumber?verify=` | 🌐 | **Track** — masked until verified by email/phone/pincode |
| GET | `/stats/overview` · `/stats/revenue-daily` · `/stats/top-products` · `/stats/funnel` | 👑 | Dashboard analytics |

### Example — place an order
```http
POST /api/orders
Authorization: Bearer <token>
{
  "items": [{ "productId": 1, "qty": 2 }, { "productId": 6, "qty": 1 }],
  "coupon": "FIRST10",
  "paymentMethod": "UPI",
  "shipping": { "name": "Aarav Sharma", "phone": "9820011223",
                "address": "402 Sea Breeze Apartments, Bandra West",
                "city": "Mumbai", "state": "Maharashtra", "pincode": "400050" }
}
→ 201 { "order": { "order_number": "OP-2026-001", "status": "PENDING", ... } }
```

Error contract (every route): `{ "error": "human message", "field": "coupon" }` with proper HTTP codes (401/403/404/409/422).

## 6. Running it

```bash
# 1. API (port 4000)
cd server && npm install && npm run seed && npm run dev

# 2. Web app (port 5173, proxies /api → :4000)  — new terminal
cd client && npm install && npm run dev
```

Or one command from the repo root: `./run.sh`

**Vercel deploy (this repo is configured for it):** `vercel deploy --prod` from the root — `vercel.json` builds the client to static assets, rewrites `/api/*` to `api/index.js`, which boots the same Express app + SQLite in `/tmp` and seeds the demo dataset on cold start. Optional: run `vercel git connect` after installing the Vercel GitHub App on your repo for auto-deploy on every push.

**Production demo (single port):** `cd client && npm run build`, then `cd ../server && npm start` → everything served on `:4000`.

### Demo accounts
| Role | Email | Password |
|---|---|---|
| 👤 Customer | `aarav@example.com` (also meera/rohan/sara) | `demo@123` |
| 🛠️ Admin | `admin@orderpilot.dev` | `admin@123` |

Coupons: `FIRST10` (10% off) · `PILOT500` (₹500 off ≥ ₹3000) · `MEGA20` (20% off ≥ ₹8000).
Seeded DB already contains 13 orders spread across **every** lifecycle state, so tracking, cancel-restock and analytics all show meaningful data on day one.

## 7. Testing

```bash
cd server && npm start &        # API on :4000
node test/api.test.mjs          # → 🎉 47 passed, 0 failed
```
The suite is a black-box E2E over HTTP covering (plus a Playwright UI suite for the payment flow): auth + RBAC, coupon engine, stock decrement/restock, oversell rejection, FSM transitions (legal + illegal), cancel + refund flow, address updates, public tracking with privacy masking, product CRUD, and analytics correctness.

## 8. Nice bits you can defend in a viva

* **Transactions everywhere** — `place order` = price + insert order + insert items + decrement stock atomically (`db.transaction`), with a guarded `UPDATE … WHERE stock >= qty` to survive concurrent oversells.
* **Event-sourced tracking** — the timeline is an append-only `order_events` log, never a mutation of state; doubles as an audit trail with actor attribution.
* **FSM-guarded status flow** — the server (not the UI) owns legal transitions; the UI only renders `next_statuses` the API advertises.
* **Server-truth pricing** — the cart calls `/quote` continuously; totals are computed server-side, so the client can never forge a price.
* **Privacy-aware public tracking** — unverified lookups get a masked summary; verification (email/phone/pincode) unlocks the full trail; phone is shown masked even then.
* **Dependency discipline** — backend runs on just 3 packages; frontend charts/toasts/modals are hand-built SVG/CSS, no UI kit.

## 9. Project layout

```
orderpilot/
├─ server/                 # Express + SQLite REST API
│  ├─ src/db.js            # schema, FSM constants, order-number generator
│  ├─ src/auth.js          # scrypt, HMAC tokens, requireAuth/requireAdmin
│  ├─ src/util.js          # validation, coupon engine
│  ├─ src/routes/          # auth · products · orders · stats
│  ├─ src/seed.js          # demo catalog + 13 orders across all stages
│  ├─ test/api.test.mjs    # 42-assertion E2E suite
│  └─ openapi.yaml         # machine-readable API spec
├─ client/                 # React 18 + Vite SPA
│  ├─ src/api.js           # typed API client + status metadata
│  ├─ src/store.jsx        # auth/cart/toast context
│  ├─ src/components/      # Nav, CartDrawer, Timeline, charts, ui atoms
│  ├─ src/pages/           # Shop · MyOrders · OrderDetail · Track · Auth
│  └─ src/pages/admin/     # Dashboard · AdminOrders · AdminProducts
├─ postman/OrderPilot.postman_collection.json
└─ run.sh                  # one-command dev launcher
```

## 10. Extensions (future scope)

Email/webhook notifications per event · real payment-gateway adapter behind the same `payment_status` flow · JWT refresh tokens & rate limiting · returns/RMA state branch · SSE/WebSocket instead of polling · pagination cursors · multi-warehouse stock allocation.

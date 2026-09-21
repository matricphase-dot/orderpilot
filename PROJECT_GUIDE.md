# 📘 OrderPilot — The Complete Project Guide
### What it is · full tech stack · how everything works · viva preparation

*(Keep this next to you when explaining the project — every claim here matches the code in this repo.)*

---

## 1. What is this project? (say this in 2 sentences)

> **OrderPilot is a full-stack e-commerce order management system**: customers place orders, pay through a (simulated) gateway, update their address, cancel before dispatch, and track the shipment through a live 6-stage timeline — while an admin console drives fulfilment (confirm → pack → ship → out-for-delivery → delivered) with analytics. It is built as a real production-style application: a **React 18 SPA**, a **Node.js/Express REST API**, a **SQLite relational database**, deployed on **Vercel** (static frontend + serverless API functions).

**Problem it solves:** in any e-commerce business, orders are messy — stock races, "can I still cancel?", address changes, customers asking *"where is my order?"*. OrderPilot models that whole lifecycle with rules enforced by the **server** (not just the UI): legal status transitions, stock decrement/restock inside database transactions, server-computed pricing, and an append-only tracking event log.

---

## 2. The full tech stack (and *why* each choice)

| Layer | Technology | Version in repo | Why it's here |
|---|---|---|---|
| **UI framework** | React | 18.3 | Component model, hooks, concurrent-mode features (`createRoot`); the industry default for SPAs |
| **Client routing** | React Router DOM | 6.30 | Client-side routes (`/`, `/orders/:id`, `/admin/...`) — SPA behaviour with shareable URLs, zero server round-trips for navigation |
| **Build tool / dev server** | Vite | 5.4 | Instant HMR during development; esbuild-based production build (~73 KB gzipped JS). Also proxies `/api` → backend during dev |
| **UI styling** | Hand-written CSS design system | 251-line `styles.css` | No UI kit — custom dark theme, CSS variables, gradients, glass panels, keyframe animations. Proves frontend fundamentals (great viva point) |
| **Charts** | Hand-rolled SVG/CSS | `charts.jsx` | Bar, donut, funnel, progress steppers drawn as raw SVG — zero chart-library dependency |
| **Backend runtime** | Node.js | 20 (dev) / 24 (Vercel) | One language across the whole stack (JS everywhere = "full-stack JavaScript" architecture) |
| **Web framework** | Express | 4.21 | Minimal, battle-tested HTTP framework: middleware pipeline, routers, error-handling layer |
| **CORS** | cors | 2.8 | Browser cross-origin policy in dev (Vite :5173 ↔ API :4000) |
| **Database** | SQLite (WAL mode) | via driver | Embedded relational DB — real SQL, real constraints, foreign keys, `CHECK`s, indexes; zero-config, file-based (`server/data/orderpilot.db`) |
| **DB driver** | better-sqlite3 | 12.4 | **Synchronous**, prepared-statement API → trivially correct transactions (no await races inside a transaction), native C++ binding |
| **Password hashing** | Node `crypto.scryptSync` | built-in | scrypt (memory-hard KDF) + per-user 16-byte salt + `timingSafeEqual` — no bcrypt dependency needed |
| **Tokens / "sessions"** | HMAC-signed bearer tokens (JWT-shaped) | built-in `crypto` | Stateless auth: `header.payload.signature`, `exp` expiry, verified with `createHmac('sha256')` — implements what JWTs do, from first principles |
| **API contract** | OpenAPI 3.0 | `server/openapi.yaml` | Machine-readable spec of all 22 endpoints; renders in Swagger UI / Postman |
| **API client tool** | Postman collection | `postman/…json` | Pre-wired requests with env-var token chaining for live demos |
| **Testing** | Custom Node E2E suite + Playwright | 47 assertions / UI flows | Black-box HTTP tests against the *running* API; browser suite drives the real UI (payment → ship → delivered) |
| **Hosting / CI** | Vercel | `vercel.json` | Static SPA from `client/dist`; the *entire Express app* runs as a Node 24 serverless function (`api/index.js`) with catch-all rewrites |
| **Source control** | Git + GitHub | `matricphase-dot/orderpilot` | Public repo, clean history, conventional commits |

**Architectural style:** classic **3-tier** — Presentation (React SPA) / Application (Express REST) / Data (SQLite) — with a **stateless** middle tier (token auth, no server sessions), which is what makes the same Express app deployable to serverless.

---

## 3. How a request travels through the stack (draw/whiteboard this)

```
Browser (React SPA)
  └─ fetch('/api/…', { Authorization: 'Bearer <token>' })      ← api.js is the single choke point
       │
       ▼  (dev: Vite proxy :5173→:4000 · prod: Vercel rewrite → Node 24 function)
Express app (src/app.js)
  cors → json parser → request logger → attachUser (HMAC-verify token → req.user)
       │
       ▼
Route module (routes/orders.js etc.)          ← validation: status codes 401/403/404/409/422
  │  db.transaction( … )                      ← better-sqlite3 prepared statements
  ▼
SQLite (WAL): users · products · orders · order_items · order_events
```

Every error is thrown as `httpError(status, message, field)` and one **central error middleware** turns it into `{ "error": "...", "field": "..." }` — consistent contract, no stack leaks.

---

## 4. Database design (5 tables, real relational modelling)

```
users ──1:N── orders ──1:N── order_items ──N:1── products
              │
              └──1:N── order_events        (append-only tracking trail)
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | role `customer/admin`, `pass_salt`, `pass_hash` | scrypt-hashed passwords never leave the DB |
| `products` | `sku UNIQUE`, `price ≥ 0 CHECK`, `stock ≥ 0 CHECK` | stock is *live inventory* |
| `orders` | `order_number UNIQUE (OP-YYYY-NNN)`, `status`, `payment_status`, pricing snapshot, ship-to snapshot, `awb/carrier`, `created/updated/cancelled/delivered_at` | **snapshot** columns (name/price at purchase time) so history never mutates when product prices change |
| `order_items` | qty `> 0 CHECK`, `line_total` | cascade-deleted with the order |
| `order_events` | status, message, **actor**, created_at | *event-sourced* tracking: the timeline the customer sees **is** the audit log |

Indexes on `orders(customer_id)`, `orders(status)`, `order_items(order_id)`, `order_events(order_id)`. Foreign keys enforced (`PRAGMA foreign_keys = ON`).

---

## 5. The crown jewel: order lifecycle as a Finite State Machine

```
PENDING ──► CONFIRMED ──► PACKED ──► SHIPPED ──► OUT_FOR_DELIVERY ──► DELIVERED
   │             │            │           │
   └─────────────┴────────────┴───────────┴──► CANCELLED  (restock + refund)
```

Enforced **server-side** in `db.js` (`NEXT_STATUS` map) inside `applyStatus()` — the *single* place that mutates order status. Consequences:

* `SHIPPED → PENDING`? **409 Illegal transition.**
* Terminal states (`DELIVERED`, `CANCELLED`) accept **nothing** — returns would be a new order branch.
* Side effects per stage: **SHIPPED** auto-generates an AWB + carrier · **DELIVERED** stamps `delivered_at` and captures COD payment (`PENDING_PAYMENT → PAID`) · **CANCELLED** (legal until packed) restocks every line item and flips `PAID → REFUNDED`.
* Each transition appends an `order_events` row → customers get a live timeline, admins get an audit trail.

**Demo autopilot** (`POST /orders/:id/autopilot`) walks this same FSM one legal step per call — the "watch it ship" animation is real server state, not a frontend trick (kill-switch: `DEMO_MODE=0`).

---

## 6. Feature list by screen (what to click during the demo)

**Customer**
- **Shop** — search (server `LIKE` query), category chips, sort by price/name, stock badges (out/low/in-stock), add-to-cart
- **Cart drawer** — qty steppers bounded by live stock · coupon engine (`FIRST10`, `PILOT500`, `MEGA20`) validated by the server via `/orders/quote` · the totals in your cart are **computed by the API**, so they can't be tampered with
- **Checkout** — address validation server-side (10-digit IN mobile, 6-digit pincode) · payment method: UPI / Card / Net-banking / COD
- **Demo payment gateway** — simulated UPI QR, **Luhn-checked** card form ("use test card" = 4111 1111 1111 1111), bank picker, staged approval animation, txn receipt `demo_txn_…` on the done screen
- **My Orders** — status filter chips, search, pagination, progress bars
- **Order detail** — animated 6-stage timeline, **cancel** (reason + refund note), **edit address** (only while PENDING/CONFIRMED — server enforces), "🤖 Run fulfilment demo"
- **Public tracking** (`/track`) — order number only; *masked* status until you prove identity with registered email / phone / pincode; phone stays masked even when verified

**Admin**
- **Dashboard** — revenue/AOV/KPI cards, 14-day revenue bars, status donut, fulfilment funnel, top sellers, live-polling order feed
- **Ops table** — every order; one-click legal next stage (buttons come from `next_statuses` the API advertises — UI never guesses the FSM), cancel-with-restock confirm dialog
- **Products** — create SKUs, inline stock nudges (−1/+1/+10), price edit; stock is shared truth with the storefront

---

## 7. Auth & security story (defensible, honest)

* **Passwords:** scrypt (memory-hard) + per-user salt; comparison via `timingSafeEqual` → no timing leak, no rainbow tables.
* **Sessions:** none — HMAC-SHA256 signed tokens (`base64url(header).base64url(payload).signature`, 7-day `exp`). Same shape as a JWT HS256, hand-built to *show* how JWTs work.
* **Authorization rules per route:** `requireAuth`, `requireAdmin`, plus object-level checks (customer can only read/act on `customer_id = self` — verified by tests: other-customer fetch → 403, cancel someone else's order → 403).
* **Validation:** every input type-checked + length/regex validated on the server; `LIMIT`/`OFFSET` parameterized SQL → SQL injection is structurally impossible (prepared statements).
* **Honest limitations to admit if asked** (and how to fix): symmetric secret shared per deployment → use RS256/short-lived access + refresh tokens; no rate limiting → add `express-rate-limit` on `/auth/*`; demo gateway obviously isn't PCI-scope → real flow = tokenized card via gateway SDK, same `payment_status` state machine.

---

## 8. Money & inventory correctness (the "real engineering" section)

* **Pricing is server-side truth.** `POST /orders/quote` and `POST /orders` share `priceCart()`: subtotal → coupon discount → free shipping ≥ ₹4,999 → 5% GST → +₹25 COD fee. The client never computes money.
* **Oversell protection:** stock check *and* `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` inside a single `db.transaction` — if 0 rows changed, the whole order rolls back (409). Two users racing the last unit → exactly one wins.
* **Cancel = restock + refund** atomically (both status flip and stock return in one transaction).
* **Coupon rules** (`COUPONS` in `util.js`): percent/flat, minimum-order gates; re-validated at placement, so applying at quote-time can't be bypassed.

---

## 9. REST API — 22 endpoints

Full machine-readable spec: `server/openapi.yaml` · importable requests: `postman/OrderPilot.postman_collection.json`

| # | Method & path | Auth | What |
|---|---|---|---|
| 1 | `GET /api/health` | — | liveness |
| 2 | `POST /api/auth/register` | — | create customer → `{user, token}` |
| 3 | `POST /api/auth/login` | — | login → `{user, token}` |
| 4 | `GET /api/auth/me` | 🔑 | profile from token |
| 5 | `GET /api/products` | — | browse (`q`, `category`, `sort`) |
| 6 | `GET /api/products/categories` | — | facets |
| 7 | `GET /api/products/:id` | — | detail |
| 8 | `POST /api/products` | 👑 | create SKU |
| 9 | `PATCH /api/products/:id` | 👑 | price/stock/edit |
| 10 | `POST /api/orders/quote` | — | cart pricing engine |
| 11 | `POST /api/orders` | 🔑 | **place order** (tx: price + insert + stock) |
| 12 | `GET /api/orders` | 🔑 | list (scope-aware) + filter + page |
| 13 | `GET /api/orders/:id` | 🔑 | items + events + `next_statuses` |
| 14 | `PATCH /api/orders/:id` | 🔑 | update address/notes; admin carrier/AWB |
| 15 | `POST /api/orders/:id/cancel` | 🔑 | cancel → restock + refund event |
| 16 | `PATCH /api/orders/:id/status` | 👑 | advance FSM (+ note) |
| 17 | `POST /api/orders/:id/autopilot` | 🔑 | demo one-step walker (`DEMO_MODE=0` kills it) |
| 18 | `GET /api/orders/track/:orderNumber` | 🌐 | public tracking, masked unless `verify` matches |
| 19 | `GET /api/stats/overview` | 👑 | KPI totals |
| 20 | `GET /api/stats/revenue-daily` | 👑 | 14/30-day series (gap-filled in SQL+JS) |
| 21 | `GET /api/stats/top-products` | 👑 | best sellers by revenue |
| 22 | `GET /api/stats/funnel` | 👑 | orders that reached each stage |

Status-code contract: `201` created · `401` no/bad token · `403` role/ownership · `404` missing · `409` state conflict (stock, FSM, duplicate SKU) · `422` validation (`field` included).

---

## 10. Deployment (Vercel) — how one repo runs a *full* stack

```
vercel.json:  build client → static output (client/dist)
              api/index.js → Node 24 serverless function (the ENTIRE Express app)
              rewrites: /api/* → function · everything else → /index.html (SPA fallback)
api/index.js: sets DB_FILE=/tmp/orderpilot.db → imports db schema →
              on cold start, if users table empty → runs the seed
```

* SQLite on Vercel lives in **`/tmp` (ephemeral)** → every cold start/redeploy reseeds the 13-order demo dataset. *Say this in the viva:* "the demo is durable during a session; durable data needs a client-server DB (Neon/Supabase/Turso) — the driver layer is the only thing that changes because every query is already plain SQL."
* Single-port local production mode: `npm run build` in client → `npm start` in server serves API **and** SPA from `:4000` (`app.js` detects `client/dist`).
* Live: **https://orderpilot-ten.vercel.app** · Repo: **https://github.com/matricphase-dot/orderpilot**

---

## 11. Testing & verification (what backs "it works")

* **`server/test/api.test.mjs` — 47/47 assertions**, black-box over HTTP against the running server: auth + RBAC + wrong-password 401; coupon min-amount rejections; stock decrement + restock-on-cancel (reads the DB via API before/after); oversell 409; full PENDING→DELIVERED walk with AWB + `delivered_at`; terminal-state lock; cancel someone else's order 403; public tracking masked→verified; product create/duplicate-SKU 409/customer-403; stats correctness (funnel monotonic, 14-point series).
* **Playwright UI suite** (headless Chromium): drawer opens, coupon applies, Luhn gating (Pay disabled until valid card), gateway stages, order placed, **paid→shipped→delivered in-browser** on localhost *and* on the production URL, plus responsive checks (0px horizontal overflow @360–620px).
* Every bug fixed during the build (INSERT arity, cart-drawer `onClose`, stale `pkill`) came with a re-run — "check artifacts before done" is itself a good slide.

---

## 12. Codebase map (~2,740 lines of JS/JSX + 251 lines CSS)

```
orderpilot/
├─ server/src/db.js         schema + FSM map + order-number generator      (data tier)
├─ server/src/auth.js       scrypt · HMAC tokens · requireAuth/requireAdmin (security)
├─ server/src/util.js       validators · coupon engine · httpError         (domain rules)
├─ server/src/routes/*.js   auth · products · orders (place/cancel/status/
│                           autopilot/track) · stats                        (application tier)
├─ server/src/seed.js       demo catalog + 13 orders covering every state  (fixture)
├─ server/test/api.test.mjs 47-assertion E2E suite
├─ server/openapi.yaml      21-operation REST spec
├─ client/src/api.js        typed fetch client + status metadata
├─ client/src/store.jsx     auth/cart/toasts context (state mgmt)
├─ client/src/pages/…       Shop · MyOrders · OrderDetail · Track · Auth
├─ client/src/pages/admin/… Dashboard · AdminOrders · AdminProducts
├─ client/src/components/…  Nav · CartDrawer(4-step) · pay.jsx — demo payment gateway · Timeline · charts · ui atoms
└─ client/src/styles.css     design system
```

---

## 13. Rapid-fire viva Q&A (memorize these)

| Q | A |
|---|---|
| Why REST and not GraphQL? | Resource-oriented domain (orders are documents with sub-resources), simple cacheable HTTP verbs; OpenAPI gives typing without codegen. |
| Why SQLite? | Embedded, ACID, zero-ops, WAL gives concurrent readers; the query layer is plain SQL so swapping to Postgres = driver + connect string. |
| Why is stock safe from race conditions? | Single `db.transaction` + guarded `UPDATE … WHERE stock >= qty`; better-sqlite3 is synchronous → no interleaved awaits inside the transaction. |
| How is cancel different from status update? | Customer route with eligibility window (`CANCELLABLE`), restock + refund marking; admin FSM route is the superset. |
| How does tracking work? | Append-only `order_events`; every transition (incl. edits/cancels) writes one row with actor; UI renders last event as "current" + timeline. |
| Why can status updates only be admin? | Object-level authz: ownership verified, but fulfilment authority is role-gated; demo autopilot exists behind `DEMO_MODE` flag. |
| What's JWT-shaped auth? | `hmac_sha256(base64url(header).base64url({uid,exp}))` signed bearer tokens; verify signature + `exp` on every request → stateless. |
| How are passwords stored? | `scryptSync(password, 128-bit salt, 64)` → hex salt/hash; `timingSafeEqual` compare. |
| Where is pricing decided? | Server `priceCart()` used by both `/orders/quote` (live cart) and `/orders` (authoritative) — clients are untrusted. |
| What breaks on Vercel and how'd you solve it? | No persistent FS → per-instance `/tmp` SQLite + cold-start seeding; same Express app exported as a function (no `listen`). |
| One thing you'd improve first? | Swap demo seeding for Vercel Postgres/Turso + refresh-token auth + rate limiting; then SSE instead of polling for the timeline. |

---

## 14. One-page abstract (copy into the report)

> **OrderPilot — Full-Stack E-Commerce Order Management System.** This project implements the complete order lifecycle of an online store — placement, payment (simulated gateway), address update, cancellation with automatic inventory restock and refund marking, and multi-stage shipment tracking — as a production-style full-stack application. The frontend is a React 18 single-page app (Vite, React Router, a hand-authored design system and dependency-free SVG charts); the backend is a Node.js/Express REST API exposing 22 endpoints secured with scrypt-hashed credentials and HMAC-signed bearer tokens with role- and ownership-based access control; persistence uses SQLite (WAL) with five normalised tables, CHECK constraints, and transactional inventory operations that prevent overselling under concurrency. The order status engine is a server-enforced finite-state machine whose transitions are recorded as an append-only event log that doubles as the customer tracking timeline and the audit trail. Pricing (coupons, GST, shipping thresholds, COD fees) is computed exclusively server-side. An admin console provides analytics (revenue series, status donut, funnel) and one-click fulfilment transitions. The system ships with a 47-assertion end-to-end API test suite, a Playwright UI suite, an OpenAPI 3 specification, a Postman collection, and is deployed to Vercel (static SPA + Node 24 serverless functions with cold-start demo seeding).

*Stack keywords for the report:* React 18 · Vite 5 · React Router 6 · Context API · Node.js 20/24 · Express 4 · REST · JSON · OpenAPI 3 · SQLite (WAL) · better-sqlite3 · ACID transactions · prepared statements · scrypt · HMAC tokens · RBAC · Finite-State Machine · event sourcing (tracking log) · SPA · serverless · Vercel · Git/GitHub · Postman · Playwright · Node test runner.

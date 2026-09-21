// OrderPilot — typed-ish API client (single choke point for fetch + errors)
const BASE = '/api';

async function req(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the OrderPilot API — is the server running?'), { status: 0 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error || `Request failed (${res.status})`);
    e.status = res.status; e.field = json.field;
    throw e;
  }
  return json;
}

const q = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)); const s = p.toString(); return s ? `?${s}` : ''; };

export const api = {
  // auth
  register: (b) => req('/auth/register', { method: 'POST', body: b }),
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  me: (t) => req('/auth/me', { token: t }),
  // catalog
  products: (f) => req('/products' + q(f || {})),
  categories: () => req('/products/categories'),
  createProduct: (b, t) => req('/products', { method: 'POST', body: b, token: t }),
  patchProduct: (id, b, t) => req(`/products/${id}`, { method: 'PATCH', body: b, token: t }),
  // orders
  quote: (b) => req('/orders/quote', { method: 'POST', body: b }),
  placeOrder: (b, t) => req('/orders', { method: 'POST', body: b, token: t }),
  listOrders: (f, t) => req('/orders' + q(f), { token: t }),
  getOrder: (id, t) => req(`/orders/${id}`, { token: t }),
  updateOrder: (id, b, t) => req(`/orders/${id}`, { method: 'PATCH', body: b, token: t }),
  cancelOrder: (id, reason, t) => req(`/orders/${id}/cancel`, { method: 'POST', body: { reason }, token: t }),
  setStatus: (id, b, t) => req(`/orders/${id}/status`, { method: 'PATCH', body: b, token: t }),
  trackPublic: (num, verify) => req('/orders/track/' + encodeURIComponent(num) + q({ verify })),
  // admin stats
  overview: (t) => req('/stats/overview', { token: t }),
  revenueDaily: (days, t) => req('/stats/revenue-daily' + q({ days }), { token: t }),
  topProducts: (t) => req('/stats/top-products' + q({ limit: 6 }), { token: t }),
  funnel: (t) => req('/stats/funnel', { token: t }),
};

export const INR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);
export const dt = (s) => s ? new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z')).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
export const rel = (s) => {
  if (!s) return '';
  const diff = (Date.now() - new Date(s.replace(' ', 'T') + 'Z').getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

// client-side mirror of the server's order FSM (for button enablement)
export const STAGES = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const NEXT = { PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PACKED', 'CANCELLED'], PACKED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['OUT_FOR_DELIVERY', 'CANCELLED'], OUT_FOR_DELIVERY: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
export const STATUS_META = {
  PENDING: { label: 'Pending', color: '#f59e0b', icon: '⏳', hint: 'Awaiting confirmation' },
  CONFIRMED: { label: 'Confirmed', color: '#3b82f6', icon: '👌', hint: 'Accepted by fulfilment' },
  PACKED: { label: 'Packed', color: '#8b5cf6', icon: '📦', hint: 'Boxed at warehouse' },
  SHIPPED: { label: 'Shipped', color: '#06b6d4', icon: '🚚', hint: 'In transit with carrier' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: '#ec4899', icon: '🛵', hint: 'With your rider' },
  DELIVERED: { label: 'Delivered', color: '#22c55e', icon: '✅', hint: 'Completed' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444', icon: '✖️', hint: 'Cancelled & refunded' },
};
export const stageIndex = (s) => STAGES.indexOf(s);

// OrderPilot — shared validation + formatting helpers
export const asInt = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function validEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()); }
export function validPhone(p) { return typeof p === 'string' && /^[6-9]\d{9}$/.test(p.replace(/\s+/g, '')); }
export function validPincode(p) { return typeof p === 'string' && /^[1-9]\d{5}$/.test(p); }

export function validateShipping(s = {}) {
  const errors = [];
  if (!s.name || String(s.name).trim().length < 3) errors.push('ship_name: full name required (min 3 chars)');
  if (!validPhone(s.phone)) errors.push('ship_phone: valid 10-digit Indian mobile required');
  if (!s.address || String(s.address).trim().length < 10) errors.push('ship_addr: address too short (min 10 chars)');
  if (!s.city || String(s.city).trim().length < 2) errors.push('ship_city: city required');
  if (!s.state || String(s.state).trim().length < 2) errors.push('ship_state: state required');
  if (!validPincode(s.pincode)) errors.push('ship_pincode: valid 6-digit pincode required');
  return errors;
}

/** Demo coupon engine. */
export const COUPONS = {
  FIRST10: { type: 'percent', value: 10, min: 0, desc: '10% off your order' },
  PILOT500: { type: 'flat', value: 500, min: 3000, desc: '₹500 off on orders above ₹3000' },
  MEGA20: { type: 'percent', value: 20, min: 8000, desc: '20% off mega sale (min ₹8000)' },
};
export function applyCoupon(code, subtotal) {
  const c = COUPONS[String(code || '').trim().toUpperCase()];
  if (!code) return { discount: 0, coupon: null };
  if (!c) throw badCoupon(`Coupon "${code}" is not valid.`);
  if (subtotal < c.min) throw badCoupon(`Coupon ${code} needs a minimum order of ₹${c.min}.`);
  const disc = c.type === 'percent' ? round2((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  return { discount: disc, coupon: String(code).trim().toUpperCase() };
}
function badCoupon(msg) { const e = new Error(msg); e.status = 422; e.field = 'coupon'; return e; }

export const httpError = (status, msg, field) => Object.assign(new Error(msg), { status, field });

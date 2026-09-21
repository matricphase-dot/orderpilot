// OrderPilot — lightweight JWT-style auth built on node:crypto (scrypt passwords + HMAC-signed tokens)
import crypto from 'node:crypto';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || 'orderpilot-dev-secret-change-me';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  const cand = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(cand, 'hex'), Buffer.from(hash, 'hex')); }
  catch { return false; }
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url').toString('utf8');

export function signToken(payload, ttlSeconds = 60 * 60 * 24 * 7) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64u(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [head, body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const payload = JSON.parse(unb64u(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/** Attach req.user if a valid token is present (never fails). */
export function attachUser(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = verifyToken(token);
  if (payload) {
    const u = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(payload.uid);
    if (u) req.user = u;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  next();
}
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    next();
  });
}

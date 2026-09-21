// OrderPilot — /api/auth  (register, login, me)
import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js';
import { validEmail, validPhone, httpError } from '../util.js';

const r = Router();

r.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || String(name).trim().length < 2) throw httpError(422, 'Name is required (min 2 chars).', 'name');
  if (!validEmail(email)) throw httpError(422, 'A valid email is required.', 'email');
  if (phone && !validPhone(phone)) throw httpError(422, 'Phone must be a valid 10-digit mobile number.', 'phone');
  if (!password || String(password).length < 6) throw httpError(422, 'Password must be at least 6 characters.', 'password');
  const em = String(email).trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(em)) throw httpError(409, 'An account with this email already exists.', 'email');

  const { salt, hash } = hashPassword(password);
  const info = db.prepare('INSERT INTO users (name, email, phone, role, pass_salt, pass_hash) VALUES (?,?,?,?,?,?)')
    .run(String(name).trim(), em, phone || null, 'customer', salt, hash);
  const user = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user, token: signToken({ uid: user.id, role: user.role }) });
});

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!u || !verifyPassword(password || '', u.pass_salt, u.pass_hash)) throw httpError(401, 'Invalid email or password.');
  const user = { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
  res.json({ user, token: signToken({ uid: u.id, role: u.role }) });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;

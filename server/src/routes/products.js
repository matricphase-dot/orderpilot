// OrderPilot — /api/products  (catalog browse for everyone; CRUD for admin)
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../auth.js';
import { asInt, httpError } from '../util.js';

const r = Router();

r.get('/', (req, res) => {
  const { q, category, sort } = req.query;
  let sql = 'SELECT * FROM products WHERE active = 1';
  const args = [];
  if (q) { sql += ' AND (name LIKE ? OR sku LIKE ? OR category LIKE ?)'; const like = `%${q}%`; args.push(like, like, like); }
  if (category) { sql += ' AND category = ?'; args.push(category); }
  sql += { price_asc: ' ORDER BY price ASC', price_desc: ' ORDER BY price DESC', name: ' ORDER BY name ASC' }[sort] || ' ORDER BY id ASC';
  res.json({ items: db.prepare(sql).all(...args) });
});

r.get('/categories', (_req, res) => {
  res.json({ items: db.prepare('SELECT category, COUNT(*) n FROM products WHERE active = 1 GROUP BY category ORDER BY category').all() });
});

r.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(asInt(req.params.id, 0));
  if (!p) throw httpError(404, 'Product not found.');
  res.json(p);
});

r.post('/', requireAdmin, (req, res) => {
  const { sku, name, price, stock, category, emoji, accent, description } = req.body || {};
  if (!sku || !name) throw httpError(422, 'sku and name are required.');
  const pr = Number(price); const st = asInt(stock, 0);
  if (!Number.isFinite(pr) || pr <= 0) throw httpError(422, 'price must be a positive number.', 'price');
  if (st < 0) throw httpError(422, 'stock cannot be negative.', 'stock');
  const dup = db.prepare('SELECT id FROM products WHERE sku = ?').get(String(sku).toUpperCase());
  if (dup) throw httpError(409, `SKU "${sku}" already exists.`, 'sku');
  const info = db.prepare(`INSERT INTO products (sku,name,description,category,price,stock,emoji,accent) VALUES (?,?,?,?,?,?,?,?)`)
    .run(String(sku).toUpperCase(), String(name).trim(), description || '', category || 'general', pr, st, emoji || '📦', accent || '#6366f1');
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

r.patch('/:id', requireAdmin, (req, res) => {
  const id = asInt(req.params.id, 0);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw httpError(404, 'Product not found.');
  const { name, price, stock, category, emoji, accent, description, active } = req.body || {};
  if (price !== undefined && (Number(price) <= 0)) throw httpError(422, 'price must be positive.', 'price');
  if (stock !== undefined && asInt(stock, -1) < 0) throw httpError(422, 'stock cannot be negative.', 'stock');
  db.prepare(`UPDATE products SET name=COALESCE(?,name), price=COALESCE(?,price), stock=COALESCE(?,stock),
      category=COALESCE(?,category), emoji=COALESCE(?,emoji), accent=COALESCE(?,accent),
      description=COALESCE(?,description), active=COALESCE(?,active) WHERE id=?`)
    .run(name ?? null, price ?? null, stock ?? null, category ?? null, emoji ?? null, accent ?? null, description ?? null,
      active === undefined ? null : (active ? 1 : 0), id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

export default r;

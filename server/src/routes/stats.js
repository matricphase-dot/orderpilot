// OrderPilot — /api/stats  (admin dashboard analytics, computed in SQL)
import { Router } from 'express';
import { db, ORDER_STATUSES } from '../db.js';
import { requireAdmin } from '../auth.js';
import { asInt } from '../util.js';

const r = Router();

r.get('/overview', requireAdmin, (_req, res) => {
  const byStatus = Object.fromEntries(ORDER_STATUSES.map(s => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all()) byStatus[row.status] = row.n;
  const totals = db.prepare(`SELECT
      COUNT(*) orders,
      IFNULL(SUM(CASE WHEN status != 'CANCELLED' THEN total END),0) revenue,
      IFNULL(ROUND(AVG(CASE WHEN status != 'CANCELLED' THEN total END),2),0) aov,
      SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) orders_today,
      IFNULL(SUM(CASE WHEN date(created_at)=date('now') AND status != 'CANCELLED' THEN total END),0) revenue_today,
      SUM(CASE WHEN status IN ('PENDING','CONFIRMED') THEN 1 ELSE 0 END) needs_action,
      SUM(CASE WHEN status IN ('SHIPPED','OUT_FOR_DELIVERY') THEN 1 ELSE 0 END) in_transit
    FROM orders`).get();
  const catalog = db.prepare(`SELECT COUNT(*) products, SUM(CASE WHEN stock=0 THEN 1 ELSE 0 END) out_of_stock, SUM(CASE WHEN stock>0 AND stock<=5 THEN 1 ELSE 0 END) low_stock FROM products WHERE active=1`).get();
  const customers = db.prepare(`SELECT COUNT(*) n FROM users WHERE role='customer'`).get().n;
  res.json({ by_status: byStatus, totals, catalog, customers });
});

r.get('/revenue-daily', requireAdmin, (req, res) => {
  const days = Math.min(60, Math.max(7, asInt(req.query.days, 14)));
  const rows = db.prepare(`
    SELECT date(o.created_at) d,
           IFNULL(SUM(CASE WHEN o.status != 'CANCELLED' THEN o.total END),0) revenue,
           COUNT(*) orders
    FROM orders o WHERE date(o.created_at) >= date('now', ?)
    GROUP BY d ORDER BY d`).all(`-${days - 1} days`);
  const map = Object.fromEntries(rows.map(r0 => [r0.d, r0]));
  const series = [];
  const cur = new Date(); cur.setDate(cur.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = cur.toISOString().slice(0, 10);
    series.push({ date: key, revenue: map[key]?.revenue || 0, orders: map[key]?.orders || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  res.json({ days, series });
});

r.get('/top-products', requireAdmin, (req, res) => {
  const limit = Math.min(10, Math.max(3, asInt(req.query.limit, 5)));
  res.json({ items: db.prepare(`
    SELECT oi.name, SUM(oi.qty) units, SUM(oi.line_total) revenue, p.emoji, p.category
    FROM order_items oi JOIN orders o ON o.id=oi.order_id AND o.status != 'CANCELLED'
    JOIN products p ON p.id=oi.product_id
    GROUP BY oi.product_id ORDER BY revenue DESC LIMIT ?`).all(limit) });
});

r.get('/funnel', requireAdmin, (_req, res) => {
  // how many live orders have *reached* each stage (current status at/after that stage)
  const stages = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const counts = stages.map((s) => {
    const reached = stages.slice(stages.indexOf(s));
    const ph = reached.map(() => '?').join(',');
    return db.prepare(`SELECT COUNT(*) n FROM orders WHERE status IN (${ph})`).get(...reached).n;
  });
  res.json({ stages, counts });
});

export default r;

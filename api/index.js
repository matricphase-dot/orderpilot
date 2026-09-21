// OrderPilot — Vercel Serverless entry: boots the full Express app + SQLite per cold start.
// The DB file lives in /tmp (ephemeral); when it's missing/empty we seed the demo dataset,
// so every fresh deployment is instantly explorable. Swap to Turso/Neon/Postgres for durability.
import fs from 'node:fs';

if (!process.env.DB_FILE) process.env.DB_FILE = '/tmp/orderpilot.db';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'orderpilot-vercel-demo-secret';

// dynamic imports so the env vars above win before db.js opens the file
const { db } = await import('../server/src/db.js');
const app = (await import('../server/src/app.js')).default;

let boot = null;
const ensureSeed = () =>
  (boot ??= (async () => {
    const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    if (!users) {
      await import('../server/src/seed.js');
      console.log('[orderpilot] cold start — seeded demo data into', process.env.DB_FILE);
    }
  })());

export default async function handler(req, res) {
  await ensureSeed();
  return app(req, res);
}

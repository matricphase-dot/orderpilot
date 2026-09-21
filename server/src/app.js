// OrderPilot — Express app factory (no listen; reused by serverless entry)
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachUser } from './auth.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import statsRoutes from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// tiny request logger
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (!req.originalUrl.startsWith('/api')) return;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  next();
});
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'orderpilot-api', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stats', statsRoutes);

// If a production client build exists, serve it from the same server (single-port deploy).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// async-safe error wrapper + unified error shape
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal server error.' : err.message, field: err.field });
});

export default app;

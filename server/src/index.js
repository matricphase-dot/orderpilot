// OrderPilot — API server entry (local dev / single-port production)
import app from './app.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`⚡ OrderPilot API listening on http://0.0.0.0:${PORT}`));

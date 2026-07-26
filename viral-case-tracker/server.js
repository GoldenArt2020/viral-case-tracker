require('dotenv').config();
const express = require('express');
const path = require('path');
const { getAllCases, getRuns, deleteCase } = require('./lib/store');
const { runResearch } = require('./lib/runResearch');
const { startScheduler } = require('./lib/scheduler');

// STARTUP CHECK: confirms which required env vars actually made it into
// this deployment. Prints only true/false, never the real key values, so
// it's safe to leave in Railway's logs.
console.log('[startup] Environment check:');
console.log('  GROQ_API_KEY present:', Boolean(process.env.GROQ_API_KEY));
console.log('  TAVILY_API_KEY present:', Boolean(process.env.TAVILY_API_KEY));
console.log('  YOUTUBE_API_KEY present:', Boolean(process.env.YOUTUBE_API_KEY));
console.log('  DASHBOARD_PASSWORD present:', Boolean(process.env.DASHBOARD_PASSWORD));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Minimal HTTP Basic Auth, only if DASHBOARD_PASSWORD is set ---
app.use((req, res, next) => {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return next(); // auth disabled

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [, pass] = decoded.split(':');
    if (pass === password) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Viral Case Tracker"');
  return res.status(401).send('Authentication required.');
});

app.use(express.static(path.join(__dirname, 'public')));

// --- API routes ---

app.get('/api/cases', (req, res) => {
  res.json(getAllCases());
});

app.get('/api/runs', (req, res) => {
  res.json(getRuns());
});

app.post('/api/run-now', async (req, res) => {
  if (!process.env.TAVILY_API_KEY || !process.env.GROQ_API_KEY) {
    return res.status(400).json({
      ok: false,
      error: 'TAVILY_API_KEY and/or GROQ_API_KEY is not set on the server.',
    });
  }
  const result = await runResearch();
  res.json(result);
});

app.delete('/api/cases/:key', (req, res) => {
  deleteCase(req.params.key);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Viral Case Tracker running at http://localhost:${PORT}`);
  if (!process.env.TAVILY_API_KEY || !process.env.GROQ_API_KEY) {
    console.warn('WARNING: TAVILY_API_KEY or GROQ_API_KEY is not set. Research runs will fail until you set them.');
  }
  startScheduler();
});
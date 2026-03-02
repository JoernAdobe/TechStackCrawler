import './load-env.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bedrock API-Key: aus Secrets Manager ODER .env (Fallback)
const secretName = process.env.BEDROCK_SECRET_NAME;
if (secretName && !process.env.BEDROCK_API_KEY) {
  const { fetchBedrockApiKey } = await import('./services/bedrockSecrets.js');
  const key = await fetchBedrockApiKey(secretName);
  if (key) {
    process.env.BEDROCK_API_KEY = key;
    console.log('Bedrock API-Key aus Secrets Manager geladen');
  } else {
    console.warn('Secrets Manager: Key nicht geladen – nutze BEDROCK_API_KEY aus .env falls gesetzt');
  }
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { analyzeSyncRoute } from './routes/analyzeSync.js';
import { useCaseDiscoveryRoute } from './routes/useCaseDiscovery.js';
import { ttsRoute } from './routes/tts.js';
import { isTtsAvailable } from './services/tts.js';
import { listAnalysesRoute, getAnalysisRoute } from './routes/analyses.js';
import { dashboardLogin, dashboardStats, requireDashboardAuth } from './routes/dashboard.js';
import { initDb, getPool, closeDb } from './db/index.js';
import { config } from './config.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production',
  hsts: false,
}));
app.use(
  cors({
    origin: config.nodeEnv === 'production'
      ? (process.env.CORS_ORIGIN || true)
      : true,
  }),
);
app.use(express.json({ limit: '1mb' }));

const analysisLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests – please try again later.' },
});

const ttsLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many TTS requests – please try again later.' },
});

// DB init (awaited so routes don't hit a missing DB)
await initDb().catch((err) => {
  console.error('DB init failed:', err);
});

// API routes
app.post('/api/analyze-sync', analysisLimiter, analyzeSyncRoute);
app.post('/api/use-case-discovery', analysisLimiter, useCaseDiscoveryRoute);
app.get('/api/tts/status', (_req, res) => res.json({ available: isTtsAvailable() }));
app.post('/api/tts', ttsLimiter, ttsRoute);
app.get('/api/analyses', listAnalysesRoute);
app.get('/api/analyses/:id', getAnalysisRoute);
app.post('/api/dashboard/login', dashboardLogin);
app.get('/api/dashboard/stats', requireDashboardAuth, dashboardStats);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || '—',
  });
});

app.get('/api/bedrock-status', (_req, res) => {
  const hasKey = !!config.bedrock.apiKey;
  const hasIam = !!(config.bedrock.awsAccessKeyId && config.bedrock.awsSecretAccessKey);
  res.json({
    auth: hasKey ? 'api-key' : hasIam ? 'iam' : 'none',
    model: config.bedrock.model,
  });
});

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const host = config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';
const server = app.listen(config.port, host, () => {
  console.log(`TechStack Analyzer server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Bedrock model: ${config.bedrock.model}`);
  const keyStatus = config.bedrock.apiKey
    ? 'OK (api-key)'
    : config.bedrock.awsAccessKeyId
      ? 'IAM (AWS_ACCESS_KEY_ID)'
      : 'FEHLT – BEDROCK_API_KEY oder IAM in .env setzen';
  console.log(`Bedrock Auth: ${keyStatus}`);
  const db = getPool();
  console.log(`Datenbank: ${db ? (db.dialect === 'sqlite' ? 'SQLite' : 'MariaDB') : 'keine'}`);
});

async function shutdown() {
  const { closeBrowser } = await import('./services/scraper.js');
  await closeBrowser();
  await closeDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

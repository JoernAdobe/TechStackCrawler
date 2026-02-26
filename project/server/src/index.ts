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
import { analyzeRoute } from './routes/analyze.js';
import { analyzeSyncRoute } from './routes/analyzeSync.js';
import { useCaseDiscoveryRoute } from './routes/useCaseDiscovery.js';
import { ttsRoute } from './routes/tts.js';
import { isTtsAvailable } from './services/tts.js';
import { listAnalysesRoute, getAnalysisRoute } from './routes/analyses.js';
import { initDb, getPool } from './db/index.js';
import { config } from './config.js';

const app = express();
app.use(express.json());

// DB init (creates tables if needed)
initDb().catch((err) => console.error('DB init:', err));

// API routes
app.post('/api/analyze', analyzeRoute);
app.post('/api/analyze-sync', analyzeSyncRoute);
app.post('/api/use-case-discovery', useCaseDiscoveryRoute);
app.get('/api/tts/status', (_req, res) => res.json({ available: isTtsAvailable() }));
app.post('/api/tts', ttsRoute);
app.get('/api/analyses', listAnalysesRoute);
app.get('/api/analyses/:id', getAnalysisRoute);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Bedrock-Status (Diagnose bei 403/Key-Problemen)
app.get('/api/bedrock-status', (_req, res) => {
  const hasKey = !!config.bedrock.apiKey;
  const hasIam = !!(config.bedrock.awsAccessKeyId && config.bedrock.awsSecretAccessKey);
  res.json({
    auth: hasKey ? 'api-key' : hasIam ? 'iam' : 'none',
    keyPrefix: hasKey ? config.bedrock.apiKey.slice(0, 12) + '...' : null,
    endpoint: config.bedrock.endpoint || '(default)',
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
    ? `OK (${config.bedrock.apiKey.slice(0, 12)}...)`
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
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

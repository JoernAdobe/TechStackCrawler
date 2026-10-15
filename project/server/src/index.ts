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
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { analyzeSyncRoute } from './routes/analyzeSync.js';
import { useCaseDiscoveryRoute } from './routes/useCaseDiscovery.js';
import { ttsRoute } from './routes/tts.js';
import { isTtsAvailable } from './services/tts.js';
import { listAnalysesRoute, getAnalysisRoute } from './routes/analyses.js';
import { dashboardLogin, dashboardStats, requireDashboardAuth } from './routes/dashboard.js';
import { createAuthRoutes } from './routes/oktaAuth.js';
import { createTokenRoute, listTokensRoute, revokeTokenRoute } from './routes/apiTokens.js';
import { createMcpRoutes } from './mcp/server.js';
import { requireMcpAuth } from './mcp/auth.js';
import { initDb, getPool, closeDb } from './db/index.js';
import { config, validateConfig } from './config.js';
import { asyncHandler, errorHandler, notFoundHandler } from './utils/http.js';
import { createEnrichmentRoutes } from './routes/enrichments.js';
import { createGeoRoutes } from './routes/geo.js';
import { createBatchRoutes } from './routes/batches.js';
import { createDeckRoutes } from './routes/deck.js';
import { createFeedbackRoutes } from './routes/feedback.js';
import { startBatchWorker } from './services/batchRunner.js';

validateConfig();

const app = express();

// Caddy sitzt als Reverse-Proxy davor und setzt X-Forwarded-For.
// Genau einen Proxy vertrauen, damit express-rate-limit die Client-IP korrekt
// erkennt (verhindert ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production'
    ? {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", 'https://saleshub.corp.adobe.com'],
          'img-src': ["'self'", 'data:', 'https://www.google.com', 'https://saleshub.corp.adobe.com'],
          'connect-src': ["'self'", 'https://saleshub.corp.adobe.com'],
          'upgrade-insecure-requests': null,
        },
      }
    : false,
  hsts: false,
}));
app.use(
  cors({
    // Production: nur explizit erlaubte Origins (CORS_ORIGIN, komma-getrennt), sonst
    // ausschließlich Same-Origin. Früher wurde jeder Origin gespiegelt – damit konnte
    // jede fremde Seite über den Browser eines Mitarbeiters die API aufrufen.
    origin: config.nodeEnv === 'production'
      ? (process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
        : false)
      : true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const analysisLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Abgelehnte Eingaben (400 ungültige URL, 422 Preflight/Tippfehler) kosten nichts und zählen nicht.
  skipFailedRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 400 && res.statusCode !== 422,
  message: { error: 'Too many requests – please try again later.', code: 'rate_limited' },
});

const ttsLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many TTS requests – please try again later.', code: 'rate_limited' },
});

// Break-Glass-Login: eng limitiert, da hier ein Passwort geprüft wird.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts – please try again later.', code: 'rate_limited' },
});

// Okta-Flow: begrenzt das Anlegen von pendingAuth-Einträgen. Bewusst großzügig,
// damit normale Login-/Logout-Zyklen nicht betroffen sind.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts – please try again later.', code: 'rate_limited' },
});

// MCP-Token-Auth: zählt nur FEHLGESCHLAGENE Requests (skipSuccessfulRequests), sonst
// würden legitime Tool-Calls eines MCP-Clients das Limit sofort ausschöpfen.
const mcpAuthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed auth attempts – please try again later.', code: 'rate_limited' },
});

// DB init: In Production ist eine funktionierende DB Pflicht — dann lieber sofort
// scheitern als mit halb funktionierender App weiterlaufen. Lokal genügt eine Warnung.
await initDb().catch((err) => {
  if (config.nodeEnv === 'production' && !config.database.useSqlite) {
    console.error('DB init failed:', err);
    process.exit(1);
  }
  console.error('DB init failed (weiter ohne DB):', err);
});

// EAA-Parität: Batch-Queue nach DB-Init starten (setzt hängende Items zurück).
if (getPool()) {
  startBatchWorker().catch((err) => console.error('Batch worker start failed:', err));
}

// EAA-Parität: eigene Limiter, damit der bestehende Analyse-Limiter unverändert bleibt.
const enrichLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests – please try again later.', code: 'rate_limited' },
});
// Batch-Anlage reiht bis zu 1.000 URLs ein → deutlich enger als die Enrichments.
const batchCreateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessments created – please try again later.', code: 'rate_limited' },
});
const lightLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests – please try again later.', code: 'rate_limited' },
});

// API routes
app.post('/api/analyze-sync', analysisLimiter, asyncHandler(analyzeSyncRoute));
app.post('/api/use-case-discovery', analysisLimiter, asyncHandler(useCaseDiscoveryRoute));
app.get('/api/tts/status', (_req, res) => res.json({ available: isTtsAvailable() }));
app.post('/api/tts', ttsLimiter, asyncHandler(ttsRoute));
app.get('/api/analyses', asyncHandler(listAnalysesRoute));
app.get('/api/analyses/:id', asyncHandler(getAnalysisRoute));
app.post('/api/dashboard/login', loginLimiter, asyncHandler(dashboardLogin));
app.get('/api/dashboard/stats', requireDashboardAuth, asyncHandler(dashboardStats));

// Okta OIDC + Session-Status (/auth/login, /auth/callback, /auth/logout, /api/dashboard/session)
app.use('/auth', authLimiter);
app.use(createAuthRoutes());

// Token management API (dashboard-auth protected)
app.post('/api/tokens', requireDashboardAuth, asyncHandler(createTokenRoute));
app.get('/api/tokens', requireDashboardAuth, asyncHandler(listTokensRoute));
app.delete('/api/tokens/:id', requireDashboardAuth, asyncHandler(revokeTokenRoute));

// EAA-Parität: Enrichments, GEO-Score, Account-/Bulk-Assessments, Decks, Feedback
app.use(createEnrichmentRoutes({ limiter: enrichLimiter }));
app.use(createGeoRoutes({ limiter: enrichLimiter }));
app.use(createBatchRoutes({ limiter: batchCreateLimiter }));
app.use(createDeckRoutes({ limiter: lightLimiter }));
app.use(createFeedbackRoutes({ limiter: lightLimiter }));

// MCP endpoint (bearer-token protected)
app.use('/mcp', mcpAuthLimiter, asyncHandler(requireMcpAuth), createMcpRoutes());

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

// Unbekannte API-Pfade: sauberes 404-JSON statt SPA-HTML.
app.use('/api', notFoundHandler);

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Zentrale Fehlerbehandlung – muss als LETZTES registriert werden.
app.use(errorHandler);

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

// Analyse (Scrape + Unterseiten + KI inkl. Retries) kann mehrere Minuten dauern – Node-Default
// (300 s) würde den Sync-Request vorher kappen. Keep-Alive > typischer Proxy-Idle-Timeout.
server.requestTimeout = 10 * 60_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 61_000;
server.on('error', (err) => {
  console.error('HTTP server error:', err);
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received – shutting down`);
  setTimeout(() => process.exit(1), 5000).unref();
  server.close(() => process.exit(0));
  await closeDb().catch((err) => console.error('DB close failed:', err));
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Letztes Netz: verlorene Promises nur loggen (Request-Fehler laufen über errorHandler),
// damit ein einzelner vergessener catch nicht den ganzen Server beendet.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});
// Netzwerkfehler auf bereits geschlossenen Sockets sind harmlos; alles andere hinterlässt
// einen undefinierten Zustand → in Production sauber beenden (Orchestrator startet neu),
// lokal weiterlaufen lassen, damit `tsx watch` nicht stehen bleibt.
const BENIGN_ERROR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);
process.on('uncaughtException', (err) => {
  const code = (err as NodeJS.ErrnoException).code ?? '';
  console.error(`[process] Uncaught exception${code ? ` (${code})` : ''}:`, err);
  if (config.nodeEnv === 'production' && !BENIGN_ERROR_CODES.has(code)) void shutdown('uncaughtException');
});

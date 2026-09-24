import path from 'path';
import { passwordHashFormat } from './utils/passwordHash.js';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  bedrock: {
    /** API-Key für Bedrock (Alternative zu AWS IAM) */
    apiKey: process.env.BEDROCK_API_KEY || '',
    /** Custom Endpoint (z.B. https://bedrock-runtime.us-west-2.amazonaws.com) */
    endpoint: process.env.BEDROCK_ENDPOINT || '',
    model: process.env.BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-4-6',
    /** Max. Output-Tokens pro LLM-Aufruf (11-Kategorien-Analyse braucht Reserve). */
    maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '8192', 10),
    /** Fallback: AWS IAM Credentials */
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2',
  },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    timeout: parseInt(process.env.SCRAPE_TIMEOUT || '60000', 10),
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || '',
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_v3',
  },
  database: {
    /** SQLite für lokal (Default in development wenn keine MariaDB-Credentials) */
    useSqlite:
      process.env.DB_TYPE === 'sqlite' ||
      !!process.env.DB_PATH ||
      (process.env.NODE_ENV !== 'production' && !process.env.DB_PASSWORD),
    sqlitePath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'techstack.db'),
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'techstack',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'techstack_crawler',
  },
  okta: {
    /** Org-Issuer = Wert im id_token `iss`-Claim (OHNE /oauth2). */
    issuer: (process.env.OKTA_ISSUER || 'https://adobe.okta.com').replace(/\/$/, ''),
    clientId: (process.env.OKTA_CLIENT_ID || '').trim(),
    clientSecret: (process.env.OKTA_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.OKTA_REDIRECT_URI || '').trim(),
    scopes: process.env.OKTA_SCOPES || 'openid profile email',
  },
  /** E-Mail-Whitelist für Admin-/Dashboard-Zugriff (case-insensitive). */
  adminEmails: (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'daudert@adobe.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  dashboard: {
    /**
     * Break-Glass-Notfallzugang, falls Okta nicht verfügbar/konfiguriert ist.
     * Bewusst OHNE Default: Ist DASHBOARD_PASSWORD_HASH nicht gesetzt, bleibt der
     * Login deaktiviert — so existiert nie ein aus dem Quellcode ableitbares Passwort.
     * Hash erzeugen (scrypt, gesalzen):
     *   npm run hash-dashboard-password -- '<pw>'   (im Ordner project/)
     */
    breakGlassEmail: (process.env.DASHBOARD_EMAIL || '').trim().toLowerCase(),
    breakGlassPasswordHash: (process.env.DASHBOARD_PASSWORD_HASH || '').trim().toLowerCase(),
  },
};

/**
 * Prüft die Konfiguration beim Start, damit Fehlkonfiguration sofort auffällt
 * statt erst beim ersten Request. Wirft nur bei unbrauchbaren Werten; fehlende
 * optionale Integrationen werden lediglich gewarnt, damit lokale Setups starten.
 */
export function validateConfig(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const numbers: Array<[string, number]> = [
    ['PORT', config.port],
    ['BEDROCK_MAX_TOKENS', config.bedrock.maxTokens],
    ['SCRAPE_TIMEOUT', config.puppeteer.timeout],
  ];
  // DB_PORT ist nur relevant, wenn tatsächlich MariaDB genutzt wird.
  if (!config.database.useSqlite) {
    numbers.push(['DB_PORT', config.database.port]);
  }
  for (const [name, value] of numbers) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} ist keine gültige positive Zahl (aktuell: ${String(value)})`);
    }
  }

  if (!config.bedrock.apiKey && !(config.bedrock.awsAccessKeyId && config.bedrock.awsSecretAccessKey)) {
    warnings.push(
      'Kein Bedrock-Zugang konfiguriert (BEDROCK_API_KEY oder AWS-IAM-Credentials) – AI-Analysen schlagen fehl.',
    );
  }
  if (config.nodeEnv === 'production' && !config.database.useSqlite && !config.database.password) {
    errors.push('DB_PASSWORD fehlt, obwohl in Production MariaDB genutzt wird.');
  }
  if (!config.okta.clientId || !config.okta.clientSecret || !config.okta.redirectUri) {
    warnings.push(
      'Okta-SSO unvollständig konfiguriert (OKTA_CLIENT_ID/SECRET/REDIRECT_URI) – SSO-Login deaktiviert.',
    );
  }

  const { breakGlassEmail, breakGlassPasswordHash } = config.dashboard;
  if (breakGlassEmail && !breakGlassPasswordHash) {
    warnings.push('DASHBOARD_EMAIL gesetzt, aber DASHBOARD_PASSWORD_HASH fehlt – Break-Glass-Login bleibt deaktiviert.');
  }
  const hashFormat = breakGlassPasswordHash ? passwordHashFormat(breakGlassPasswordHash) : null;
  if (hashFormat === 'invalid') {
    // In Production ist eine fehlerhafte Auth-Konfiguration ein harter Fehler. Lokal
    // soll ein vertippter optionaler Hash den Start nicht verhindern.
    const msg = 'DASHBOARD_PASSWORD_HASH hat ein unbekanntes Format (erwartet: scrypt$<salt>$<hash> oder SHA-256-Hex).';
    if (config.nodeEnv === 'production') {
      errors.push(msg);
    } else {
      warnings.push(`${msg} Break-Glass-Login bleibt deaktiviert.`);
    }
  } else if (hashFormat === 'sha256') {
    warnings.push(
      'DASHBOARD_PASSWORD_HASH nutzt das ungesalzene Legacy-SHA-256-Format – bitte per `npm run hash-dashboard-password` auf scrypt umstellen.',
    );
  }

  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    throw new Error(`Ungültige Konfiguration:\n - ${errors.join('\n - ')}`);
  }
}

import path from 'path';
import { fileURLToPath } from 'url';

/** Relative Pfade (z. B. `.venv/bin/python`) beziehen sich auf `project/`, nicht auf das cwd. */
function resolvePythonPath(value: string): string {
  if (!value.includes('/') || path.isAbsolute(value)) return value;
  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  return path.resolve(projectRoot, value);
}

/** Owner des Admin-Views: immer Admin, unabhängig von ENV und DB. */
export const OWNER_ADMIN_EMAIL = 'daudert@adobe.com';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  bedrock: {
    /** API-Key für Bedrock (Alternative zu AWS IAM) */
    apiKey: process.env.BEDROCK_API_KEY || '',
    /** Custom Endpoint (z.B. https://bedrock-runtime.us-west-2.amazonaws.com) */
    endpoint: process.env.BEDROCK_ENDPOINT || '',
    model: process.env.BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-5-5',
    /** Max. Output-Tokens pro LLM-Aufruf (11-Kategorien-Analyse braucht Reserve). */
    maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '8192', 10),
    /** Fallback: AWS IAM Credentials */
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2',
  },
  scraper: {
    pythonPath: resolvePythonPath(process.env.SCRAPLING_PYTHON_PATH || 'python3'),
    chromiumPath: process.env.SCRAPLING_CHROMIUM_PATH || undefined,
    timeout: parseInt(process.env.SCRAPE_TIMEOUT || '60000', 10),
  },
  observepoint: {
    apiKey: (process.env.OBSERVEPOINT_API_KEY || '').trim(),
    baseUrl: (process.env.OBSERVEPOINT_BASE_URL || 'https://api.observepoint.com').replace(/\/$/, ''),
    /** Bestehende Runs älter als N Tage gelten als veraltet und werden nicht wiederverwendet. */
    maxRunAgeDays: parseInt(process.env.OBSERVEPOINT_MAX_RUN_AGE_DAYS || '365', 10),
    /** Frische Scans starten (verbraucht Page-Scan-Kontingent im geteilten Account) – nur mit explizitem Opt-in. */
    allowCreate: process.env.OBSERVEPOINT_ALLOW_CREATE === '1',
    /**
     * Eigenes, in der OP-UI angelegtes Audit, das für Domains ohne bestehendes Audit per PUT auf die Ziel-URL
     * umkonfiguriert und gestartet wird (dokumentierter Weg; ein Create-Endpoint ist nicht dokumentiert).
     */
    scratchAuditId: parseInt(process.env.OBSERVEPOINT_SCRATCH_AUDIT_ID || '0', 10),
    maxPages: parseInt(process.env.OBSERVEPOINT_MAX_PAGES || '5', 10),
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
  /** IMS-Passthrough für /mcp (Coworker reicht den IMS-User-Token durch). */
  ims: {
    enabled: process.env.MCP_IMS_AUTH_ENABLED !== 'false',
    /** Erlaubte IMS-Instanzen (Prod + Stage); der Token-Claim `as` wählt die passende. */
    baseUrls: (process.env.IMS_BASE_URLS || 'https://ims-na1.adobelogin.com,https://ims-na1-stg1.adobelogin.com')
      .split(',')
      .map((u) => u.trim().replace(/\/$/, ''))
      .filter(Boolean),
    allowedEmailDomains: (process.env.MCP_IMS_ALLOWED_EMAIL_DOMAINS || 'adobe.com')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    allowedClientIds: (process.env.MCP_IMS_ALLOWED_CLIENT_IDS || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  },
  /** Aufbewahrung für Nutzungs-/Audit-/LLM-Logs in Tagen (OneTrust-PIA); täglicher Purge, min. 7 (Wochen-Aggregate). */
  retentionLogDays: Math.max(7, Number.parseInt(process.env.RETENTION_LOG_DAYS || '', 10) || 30),
  /** Fixe Admins (nicht in der UI entfernbar, case-insensitive); weitere Admins pflegt die Admin-UI in der DB. */
  adminEmails: [
    ...new Set(
      [OWNER_ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',')]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ],
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
    ['SCRAPE_TIMEOUT', config.scraper.timeout],
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
  if (config.scraper.timeout < 1_000 || config.scraper.timeout > 120_000) {
    errors.push('SCRAPE_TIMEOUT muss zwischen 1000 und 120000 Millisekunden liegen.');
  }
  if (!config.okta.clientId || !config.okta.clientSecret || !config.okta.redirectUri) {
    warnings.push(
      'Okta-SSO unvollständig konfiguriert (OKTA_CLIENT_ID/SECRET/REDIRECT_URI) – SSO-Login deaktiviert.',
    );
  }

  if (config.ims.enabled) {
    if (config.ims.baseUrls.length === 0 || config.ims.baseUrls.some((u) => !/^https:\/\//.test(u))) {
      errors.push('IMS_BASE_URLS muss eine oder mehrere https-URLs enthalten.');
    }
    if (config.ims.allowedEmailDomains.length === 0) {
      errors.push('MCP_IMS_ALLOWED_EMAIL_DOMAINS darf bei aktivem IMS-Passthrough nicht leer sein.');
    }
  }

  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    throw new Error(`Ungültige Konfiguration:\n - ${errors.join('\n - ')}`);
  }
}

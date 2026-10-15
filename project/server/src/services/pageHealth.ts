import type { ScrapedData } from './scraper.js';
import type { ScanWarning } from '../types/analysis.js';

/**
 * Erkennt "stille Fehlergebnisse": Fehlerseiten (z. B. AEM "Service Outage"), 4xx/5xx,
 * Bot-Walls (Cloudflare, Akamai, Imperva, DataDome, PerimeterX, Captcha) und fast leere
 * Seiten. Ergebnis sind Warnungen fürs Result (`scanWarnings`) plus die Info, ob ein
 * erneuter Scan-Versuch sinnvoll ist.
 */

export interface PageHealth {
  warnings: ScanWarning[];
  /** True bei transienten Problemen (5xx, Fehlerseite, leere Seite) – ein Re-Scan kann helfen. */
  retryable: boolean;
  /** Grobe Inhaltsgröße zum Vergleich zweier Scan-Versuche. */
  contentScore: number;
}

const ERROR_PAGE =
  /service outage|service (?:is )?(?:temporarily )?unavailable|temporarily unavailable|under maintenance|maintenance mode|scheduled maintenance|bad gateway|gateway time-?out|internal server error|\b50[234]\b.{0,20}(?:error|service|gateway)|origin (?:is )?unreachable|web server is down|site can.?t be reached|something went wrong/i;
const NOT_FOUND = /\b404\b|page not found|page (?:does not|doesn.?t) exist|not be found/i;

const BOT_TITLE =
  /just a moment|attention required|access denied|pardon our interruption|request unsuccessful|are you a (?:robot|human)|verify(?:ing)? (?:you are|that you are) (?:a )?human|bot (?:verification|protection)|security check|ddos protection/i;
const BOT_MARKUP =
  /cf-chl-|challenge-platform|cf_chl_opt|_Incapsula_Resource|incapsula incident|px-captcha|captcha-delivery\.com|geo\.captcha-delivery|perimeterx|you don.?t have permission to access .{0,80}on this server|akamai.{0,40}reference ?#|errors\.edgesuite\.net/i;
const CAPTCHA = /g-recaptcha|hcaptcha|h-captcha|turnstile|captcha/i;

/** Kurze Seiten sind verdächtig; nur dann wird auch der Body nach Fehlermustern durchsucht. */
const SHORT_BODY_CHARS = 2_000;
const THIN_BODY_CHARS = 200;
const THIN_HTML_CHARS = 5_000;

function header(scraped: ScrapedData, name: string): string {
  return (scraped.headers?.[name] ?? []).join(' ');
}

export function assessPageHealth(scraped: ScrapedData): PageHealth {
  const warnings: ScanWarning[] = [];
  const title = (scraped.title ?? '').trim();
  const body = (scraped.bodyText ?? '').replace(/\s+/g, ' ').trim();
  const html = scraped.html ?? '';
  const status = scraped.status ?? 0;
  const shortBody = body.length < SHORT_BODY_CHARS;
  let retryable = false;

  const botByTitle = BOT_TITLE.test(title);
  const botByMarkup = BOT_MARKUP.test(html.slice(0, 200_000));
  const cfChallenge = /challenge/i.test(header(scraped, 'cf-mitigated'));
  const captchaOnly = shortBody && CAPTCHA.test(html.slice(0, 200_000)) && body.length < 600;
  const isBotWall = cfChallenge || ((botByTitle || botByMarkup) && (shortBody || status >= 400)) || captchaOnly;

  if (isBotWall) {
    warnings.push({
      code: 'bot_challenge',
      severity: 'error',
      message:
        'The site answered with a bot-protection or captcha page (e.g. Cloudflare, Akamai). Detections are likely incomplete — the real page was not analyzed.',
    });
  }

  const errorPage =
    !isBotWall && (ERROR_PAGE.test(title) || (shortBody && ERROR_PAGE.test(body.slice(0, SHORT_BODY_CHARS))));
  if (errorPage) {
    retryable = true;
    warnings.push({
      code: 'error_page',
      severity: 'error',
      message: `The site returned an error or maintenance page${title ? ` ("${title.slice(0, 80)}")` : ''} instead of its regular content. Results are likely incomplete — try again later.`,
    });
  }

  if (status >= 400 && !isBotWall) {
    if (status >= 500) retryable = true;
    const notFound = status === 404 || (shortBody && NOT_FOUND.test(title));
    warnings.push({
      code: 'http_error',
      severity: status >= 500 ? 'error' : 'warning',
      message: notFound
        ? `The page returned HTTP ${status} (not found). Check the URL — results only reflect the error page.`
        : `The page returned HTTP ${status}. Results may only reflect an error page.`,
    });
  }

  const thin = body.length < THIN_BODY_CHARS && html.length < THIN_HTML_CHARS;
  if (thin && !isBotWall && !errorPage) {
    retryable = true;
    warnings.push({
      code: 'thin_content',
      severity: 'warning',
      message: 'The page contained almost no content. It may not have loaded completely, so detections can be incomplete.',
    });
  }

  if (scraped.scrapeMode === 'http') {
    warnings.push({
      code: 'http_fallback',
      severity: 'info',
      message:
        'Browser rendering failed, so the page was fetched via plain HTTP. Tags loaded at runtime by JavaScript may be missing.',
    });
  }

  const contentScore = body.length + Math.min(html.length, 500_000) / 10 + (scraped.requests?.length ?? 0) * 50;
  return { warnings, retryable, contentScore };
}

/** Zusatzwarnung, wenn auffällig wenig erkannt wurde (oft Folge einer der obigen Ursachen). */
export function detectionCountWarning(strongDetections: number): ScanWarning | undefined {
  if (strongDetections > 3) return undefined;
  return {
    code: 'few_detections',
    severity: 'info',
    message: `Only ${strongDetections} technolog${strongDetections === 1 ? 'y was' : 'ies were'} detected. The page may be minimal, blocked or not fully loaded.`,
  };
}

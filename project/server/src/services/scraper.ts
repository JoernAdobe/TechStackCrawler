import puppeteer, { type Browser } from 'puppeteer';
import { config } from '../config.js';
import { localeForUrl } from '../utils/locale.js';
import { isPrivateIpAddress, resolvesToPrivateAddress, sanitizeUrl, sanitizeUrlWithDns } from '../utils/sanitize.js';

export interface ScrapedData {
  url: string;
  finalUrl: string;
  html: string;
  headers: Record<string, string[]>;
  meta: Record<string, string[]>;
  scriptSrc: string[];
  cookies: Record<string, string>;
  title: string;
  bodyText: string;
  links: string[];
}

let browser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  if (browserPromise) return browserPromise;

  browserPromise = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        // WebRTC darf keine direkten UDP-Verbindungen (ICE/STUN) ins interne Netz aufbauen;
        // diese laufen an der Request-Interception vorbei.
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
      executablePath: config.puppeteer.executablePath,
    })
    .then((b) => {
      browser = b;
      browserPromise = null;
      return b;
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });

  return browserPromise;
}

export type ScrapeProgressCallback = (message: string) => void;

/** Runs a long-running promise while sending progress every intervalMs. */
async function withHeartbeat<T>(
  promise: Promise<T>,
  onProgress: ScrapeProgressCallback,
  messageFn: (elapsedSec: number) => string,
  intervalMs = 5000,
): Promise<T> {
  const start = Date.now();
  const beat = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - start) / 1000);
    onProgress(messageFn(elapsedSec));
  }, intervalMs);
  try {
    return await promise;
  } finally {
    clearInterval(beat);
  }
}

export async function scrapePage(
  url: string,
  onProgress?: ScrapeProgressCallback,
): Promise<ScrapedData> {
  onProgress?.('Starting browser…');
  const b = await withHeartbeat(
    getBrowser(),
    (m) => onProgress?.(m),
    (s) => `Launching browser… (${s}s)`,
    5000,
  );
  onProgress?.('Browser ready, opening page…');
  const page = await b.newPage();

  try {
    // SSRF-Schutz: JEDER Request der (fremdgesteuerten) Seite wird geprüft — nicht nur
    // Main-Frame-Navigationen, sondern auch fetch/XHR/img/script/iframe/Redirect-Hops.
    // Sonst kann die Seite blind interne Dienste (172.17.0.1, 10.x, 169.254.169.254 …)
    // ansprechen. Das Prüfergebnis wird pro Hostname im Page-Scope gecacht, damit nicht
    // jedes Asset neu aufgelöst wird.
    const hostVerdicts = new Map<string, Promise<boolean>>();
    // Wird gesetzt, sobald eine Response von einer privaten IP kam (DNS-Rebinding, s.u.).
    let privateRemoteHit: string | null = null;
    const isHostAllowed = (hostname: string): Promise<boolean> => {
      let verdict = hostVerdicts.get(hostname);
      if (!verdict) {
        verdict = resolvesToPrivateAddress(hostname).then(
          (isPrivate) => !isPrivate,
          () => false,
        );
        hostVerdicts.set(hostname, verdict);
      }
      return verdict;
    };
    const isRequestAllowed = async (rawUrl: string): Promise<boolean> => {
      // Nach einem Treffer auf eine private IP keine weiteren Requests mehr zulassen –
      // sonst könnte die Seite die intern gelesene Antwort nach außen exfiltrieren.
      if (privateRemoteHit) return false;
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return false;
      }
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return true;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      // String-Prüfung (localhost, IP-Literale, .internal …) vor der DNS-Prüfung.
      if (!sanitizeUrl(rawUrl)) return false;
      return isHostAllowed(parsed.hostname);
    };

    // Service Worker umgehen, damit auch deren Requests durch die Interception laufen.
    await page.setBypassServiceWorker(true);
    // WebSockets/WebRTC werden von der Request-Interception nicht erfasst → deaktivieren,
    // damit darüber kein Handshake an interne Hosts möglich ist. Worker werden ebenfalls
    // abgeschaltet, weil dieses Init-Script dort nicht greift (WebSocket wäre im Worker
    // wieder verfügbar). Für die Tech-Erkennung sind Worker nicht nötig.
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as Record<string, unknown>;
      for (const key of ['WebSocket', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport', 'Worker', 'SharedWorker']) {
        try {
          Object.defineProperty(w, key, { value: undefined, configurable: false, writable: false });
        } catch {
          // best effort
        }
      }
    });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      void (async () => {
        try {
          if (await isRequestAllowed(request.url())) {
            await request.continue();
            return;
          }
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            console.warn('[scraper] Navigation blockiert (SSRF-Schutz):', request.url());
          }
          await request.abort('blockedbyclient');
        } catch {
          // Request kann bereits abgeschlossen sein – dann ist nichts mehr zu tun.
        }
      })();
    });

    // DNS-Rebinding/TOCTOU: Die obige Prüfung löst selbst per DNS auf; Chromium löst
    // danach erneut auf und könnte (bei kurzer TTL) eine andere, private IP bekommen.
    // Die IP lässt sich im Singleton-Browser nicht pro Host pinnen. Mitigation: die
    // tatsächlich verbundene Remote-IP JEDER Response prüfen; bei einem Treffer werden alle
    // weiteren Requests blockiert (isRequestAllowed) und der Crawl verworfen – es wird kein
    // Inhalt zurückgegeben.
    // RESTRISIKO: Der erste Request an die private Adresse ist bereits rausgegangen, und
    // Kanäle außerhalb der Interception (z.B. WebSocket aus about:blank-iframes) lassen
    // sich auf App-Ebene nicht vollständig schließen. Harte Garantie nur per Netzwerk-
    // Egress-Filter (RFC1918, 100.64/10, 169.254/16, Docker-Bridge sperren) – empfohlen.
    const assertNoPrivateRemote = () => {
      if (privateRemoteHit) {
        console.warn('[scraper] Response von privater Adresse, Crawl verworfen:', privateRemoteHit);
        throw new Error('Blocked: resolved to private address');
      }
    };
    page.on('response', (response) => {
      const ip = response.remoteAddress()?.ip;
      if (ip && isPrivateIpAddress(ip) && !privateRemoteHit) {
        privateRemoteHit = `${response.url()} -> ${ip}`;
      }
    });

    onProgress?.('Loading page (this may take 15–30 seconds for large sites)…');
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
    // Locale/Timezone zur eingegebenen TLD passend setzen, damit Seiten nicht auf eine
    // fremde Länderversion umleiten (z.B. .de → englische/US-Variante).
    const { acceptLanguage, timezone } = localeForUrl(url);
    await page.setExtraHTTPHeaders({ 'Accept-Language': acceptLanguage });
    try {
      await page.emulateTimezone(timezone);
    } catch {
      // Timezone-Emulation ist best-effort; Fehler ignorieren.
    }

    // Collect response headers from the main document
    const responseHeaders: Record<string, string[]> = {};
    page.on('response', (response) => {
      if (response.request().resourceType() === 'document') {
        const headers = response.headers();
        for (const [key, value] of Object.entries(headers)) {
          responseHeaders[key] = [value];
        }
      }
    });

    await withHeartbeat(
      page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.puppeteer.timeout,
      }),
      (m) => onProgress?.(m),
      (s) => `Still loading page… (${s}s)`,
      5000,
    );

    // Zweite Verteidigungslinie: Endzustand nach allen Redirects prüfen.
    if (!(await sanitizeUrlWithDns(page.url()))) {
      throw new Error('Blocked unsafe final URL after redirects');
    }
    assertNoPrivateRemote();

    // Cookie-Banner akzeptieren, damit Marketing-Cookies geladen werden
    const { acceptCookieBanner } = await import('./cookieBanner.js');
    await acceptCookieBanner(page, onProgress);

    onProgress?.('Extracting page content…');
    const pageData = await page.evaluate(() => {
      // Meta tags
      const meta: Record<string, string[]> = {};
      document.querySelectorAll('meta').forEach((el) => {
        const name =
          el.getAttribute('name') ||
          el.getAttribute('property') ||
          el.getAttribute('http-equiv') ||
          '';
        const content = el.getAttribute('content') || '';
        if (name && content) {
          if (!meta[name]) meta[name] = [];
          meta[name].push(content);
        }
      });

      // Script sources
      const scriptSrc = Array.from(document.querySelectorAll('script[src]'))
        .map((el) => el.getAttribute('src') || '')
        .filter(Boolean);

      // Links
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((el) => el.getAttribute('href') || '')
        .filter((href) => href.startsWith('http'))
        .slice(0, 200);

      return {
        html: document.documentElement.outerHTML,
        meta,
        scriptSrc,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 50000),
        links,
      };
    });

    // Cookies
    const rawCookies = await page.cookies();
    const cookies: Record<string, string> = {};
    for (const c of rawCookies) {
      cookies[c.name] = c.value;
    }

    // Letzte Prüfung vor Rückgabe: auch nach Cookie-Banner/Extraktion nachgeladene
    // Responses dürfen nicht von privaten Adressen stammen.
    assertNoPrivateRemote();

    return {
      url,
      finalUrl: page.url(),
      html: pageData.html,
      headers: responseHeaders,
      meta: pageData.meta,
      scriptSrc: pageData.scriptSrc,
      cookies,
      title: pageData.title,
      bodyText: pageData.bodyText,
      links: pageData.links,
    };
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

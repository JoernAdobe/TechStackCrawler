import puppeteer, { type Browser } from 'puppeteer';
import { config } from '../config.js';

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

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
      executablePath: config.puppeteer.executablePath,
    });
  }
  return browser;
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
    onProgress?.('Loading page (this may take 15–30 seconds for large sites)…');
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );

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

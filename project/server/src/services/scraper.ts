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

export async function scrapePage(url: string): Promise<ScrapedData> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
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

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: config.puppeteer.timeout,
    });

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

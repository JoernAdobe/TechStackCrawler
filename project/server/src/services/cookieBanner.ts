/**
 * Akzeptiert Cookie-Banner, damit Marketing-Cookies geladen werden.
 * Verwendet bekannte Selektoren und optional AI als Fallback.
 */
import type { Page, Frame } from 'puppeteer';
import { config } from '../config.js';
import { getBedrockClient } from './bedrockClient.js';

/** Bekannte Selektoren für "Accept all" / "Alle akzeptieren" (häufige CMPs) */
const ACCEPT_SELECTORS = [
  // OneTrust
  '#onetrust-accept-btn-handler',
  '[id*="onetrust-accept"]',
  '.onetrust-close-btn-handler',
  // Cookiebot
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '[id*="CybotCookiebotDialogBodyButton"]',
  // Optanon (OneTrust)
  '[id*="OptanonConsent"] button',
  '.optanon-allow-all',
  '#optanon-accept',
  // Didomi
  '[id*="didomi"] button[id*="accept"]',
  '[class*="didomi"] button[class*="accept"]',
  'button[id*="didomi-notice-agree"]',
  // CookieYes
  '.cky-btn-accept',
  '[class*="cookieyes"] button[class*="accept"]',
  // Cookie Consent (generic)
  '.cc-btn.cc-allow',
  '.cc-accept',
  '[class*="cookie-consent"] button[class*="accept"]',
  '[class*="cookie-banner"] button[class*="accept"]',
  // Generic patterns
  '[id*="cookie"] button[class*="accept"]',
  '[id*="consent"] button[class*="accept"]',
  '[class*="consent"] button[class*="accept"]',
  '[class*="gdpr"] button[class*="accept"]',
  'button[data-action="accept"]',
  'button[data-testid*="accept"]',
  '[aria-label*="Accept" i]',
  '[aria-label*="Allow" i]',
  '[aria-label*="Akzeptieren" i]',
  '[aria-label*="Zustimmen" i]',
  // Text-based (via data attributes)
  'a[href*="accept-cookies"]',
  'a[href*="accept_all"]',
];

/** Texte für "Accept all" in verschiedenen Sprachen */
const ACCEPT_TEXTS = [
  'accept all',
  'accept all cookies',
  'allow all',
  'allow all cookies',
  'accept',
  'allow',
  'agree',
  'i agree',
  'ok',
  'got it',
  'alle akzeptieren',
  'alle cookies akzeptieren',
  'alle erlauben',
  'zustimmen',
  'akzeptieren',
  'erlauben',
  'accepter tout',
  'accepter',
  'todos los cookies',
  'aceptar todo',
  'aceptar',
  'accetta tutto',
  'accetta',
  'akceptuj wszystko',
  'akceptuj',
  'accepteer alles',
  'accepteer',
];

async function trySelectorsInFrame(frame: Frame): Promise<boolean> {
  for (const sel of ACCEPT_SELECTORS) {
    try {
      const el = await frame.$(sel);
      if (el) {
        const box = await el.boundingBox();
        if (box && box.height > 0 && box.width > 0) {
          await el.click();
          return true;
        }
        await el.dispose();
      }
    } catch {
      // Selector failed, try next
    }
  }
  return false;
}

async function trySelectors(page: Page): Promise<boolean> {
  const main = page.mainFrame();
  if (await trySelectorsInFrame(main)) return true;
  for (const frame of page.frames()) {
    if (frame !== main && (await trySelectorsInFrame(frame))) return true;
  }
  return false;
}

async function tryTextMatchInFrame(frame: Frame): Promise<boolean> {
  return frame.evaluate((texts: string[]) => {
    const lower = (s: string) => s.toLowerCase().trim();
    const allClickable = document.querySelectorAll(
      'button, a, [role="button"], input[type="submit"], [onclick]',
    );
    for (const el of allClickable) {
      const text = (el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const combined = `${text} ${ariaLabel}`.toLowerCase();
      for (const t of texts) {
        if (combined.includes(t) || lower(text) === t || lower(ariaLabel) === t) {
          // Prefer "accept all" over just "accept"
          if (t.includes('all') || t.includes('alle') || t.includes('tout')) {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
    }
    // Second pass: any match
    for (const el of allClickable) {
      const text = (el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const combined = `${text} ${ariaLabel}`.toLowerCase();
      for (const t of texts) {
        if (combined.includes(t)) {
          (el as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }, ACCEPT_TEXTS);
}

async function tryTextMatch(page: Page): Promise<boolean> {
  try {
    if (await tryTextMatchInFrame(page.mainFrame())) return true;
  } catch {
    // Cross-origin, skip
  }
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame()) {
      try {
        if (await tryTextMatchInFrame(frame)) return true;
      } catch {
        // Cross-origin iframe, skip
      }
    }
  }
  return false;
}

/** AI-Fallback: Findet den Accept-Button per Claude */
async function findAcceptButtonWithAI(page: Page): Promise<boolean> {
  if (!config.bedrock.apiKey && !config.bedrock.awsAccessKeyId) return false;

  const buttonInfo = await page.evaluate(() => {
    const candidates: Array<{ tag: string; text: string; selector: string; id: string; classes: string }> = [];
    const els = document.querySelectorAll(
      'button, a, [role="button"], input[type="submit"], [onclick], [class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"]',
    );
    els.forEach((el, i) => {
      const text = (el.textContent || '').trim().slice(0, 80);
      const id = el.id || '';
      const classes = (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 100);
      if (text || id || classes) {
        const sel = el.id ? `#${el.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}` : `${el.tagName}[data-ai-idx="${i}"]`;
        candidates.push({ tag: el.tagName, text, selector: sel, id, classes });
      }
    });
    // Add data-ai-idx for AI-suggested index
    els.forEach((el, i) => {
      (el as HTMLElement).setAttribute('data-ai-idx', String(i));
    });
    return candidates.slice(0, 50).map((c, i) => `[${i}] ${c.tag} text="${c.text}" id="${c.id}" class="${c.classes}"`);
  });

  if (buttonInfo.length === 0) return false;

  const client = getBedrockClient();

  const prompt = `These are buttons/elements from a cookie consent banner. Which one should be clicked to ACCEPT ALL cookies / allow marketing cookies? Reply with ONLY the index number in brackets, e.g. [3]. If none clearly accept, reply [none].

${buttonInfo.join('\n')}`;

  try {
    const res = await client.messages.create({
      model: config.bedrock.model,
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (res.content[0] as { text?: string }).text || '';
    const match = text.match(/\[(\d+)\]/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const clicked = await page.evaluate((i) => {
        const el = document.querySelector(`[data-ai-idx="${i}"]`);
        if (el) {
          (el as HTMLElement).click();
          return true;
        }
        return false;
      }, idx);
      return clicked;
    }
  } catch (e) {
    console.warn('Cookie-Banner AI-Fallback fehlgeschlagen:', (e as Error).message);
  }
  return false;
}

/**
 * Versucht, das Cookie-Banner zu akzeptieren, damit Marketing-Cookies geladen werden.
 * @returns true wenn geklickt, false wenn kein Banner gefunden
 */
export async function acceptCookieBanner(
  page: Page,
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    onProgress?.('Warte auf Cookie-Banner…');
    await sleep(2500);

    onProgress?.('Suche Cookie-Akzeptieren-Button…');

    if (await trySelectors(page)) {
      onProgress?.('Cookie-Banner akzeptiert (Selektor).');
      await sleep(3000);
      return true;
    }

    if (await tryTextMatch(page)) {
      onProgress?.('Cookie-Banner akzeptiert (Text-Match).');
      await sleep(3000);
      return true;
    }

    onProgress?.('Versuche AI-Fallback für Cookie-Banner…');
    if (await findAcceptButtonWithAI(page)) {
      onProgress?.('Cookie-Banner akzeptiert (AI).');
      await sleep(3000);
      return true;
    }

    onProgress?.('Kein Cookie-Banner gefunden oder bereits akzeptiert.');
    return false;
  } catch (e) {
    console.warn('Cookie-Banner-Handling:', (e as Error).message);
    return false;
  }
}

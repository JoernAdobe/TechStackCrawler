import type { ScrapedData } from './scraper.js';
import { customDetect, type DetectedTech } from './customDetectors.js';

/**
 * Simple built-in detection based on common patterns.
 * We use this instead of wappalyzer-core to avoid compatibility issues
 * with the deprecated package. Our custom detectors plus these common
 * patterns cover the key enterprise martech tools we care about.
 */

interface SimpleRule {
  name: string;
  categories: string[];
  check: (s: ScrapedData) => boolean;
  versionExtract?: (s: ScrapedData) => string | undefined;
}

const simpleRules: SimpleRule[] = [
  // ── Frameworks ───────────────────────────────────────
  {
    name: 'React',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /__react/.test(s.html) ||
      /react\.production/.test(s.html) ||
      s.scriptSrc.some((src) => /react/i.test(src)),
  },
  {
    name: 'Vue.js',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /vue@|vue\.js|vue\.min\.js/.test(s.html) ||
      /__vue/.test(s.html) ||
      /data-v-[a-f0-9]/.test(s.html),
  },
  {
    name: 'Angular',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /ng-version/.test(s.html) || /angular\.io/.test(s.html) || /ng-app/.test(s.html),
    versionExtract: (s) => {
      const m = s.html.match(/ng-version="([^"]+)"/);
      return m?.[1];
    },
  },
  {
    name: 'Next.js',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /__NEXT_DATA__/.test(s.html) || /_next\/static/.test(s.html),
  },
  {
    name: 'Nuxt.js',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /__NUXT__/.test(s.html) || /_nuxt\//.test(s.html),
  },
  {
    name: 'Gatsby',
    categories: ['JavaScript Framework'],
    check: (s) =>
      /gatsby/.test(s.html) || s.scriptSrc.some((src) => /gatsby/.test(src)),
  },
  // ── CMS ──────────────────────────────────────────────
  {
    name: 'WordPress',
    categories: ['CMS'],
    check: (s) =>
      /wp-content|wp-includes|wp-json/.test(s.html) ||
      s.meta['generator']?.some((v) => /WordPress/i.test(v)) === true,
    versionExtract: (s) => {
      const gen = s.meta['generator']?.find((v) => /WordPress/i.test(v));
      const m = gen?.match(/WordPress\s+([\d.]+)/i);
      return m?.[1];
    },
  },
  {
    name: 'Drupal',
    categories: ['CMS'],
    check: (s) =>
      /drupal/i.test(s.html) ||
      /Drupal\.settings/.test(s.html) ||
      s.meta['generator']?.some((v) => /Drupal/i.test(v)) === true,
  },
  {
    name: 'Joomla',
    categories: ['CMS'],
    check: (s) =>
      s.meta['generator']?.some((v) => /Joomla/i.test(v)) === true ||
      /\/media\/jui\//.test(s.html),
  },
  {
    name: 'Ghost',
    categories: ['CMS'],
    check: (s) =>
      s.meta['generator']?.some((v) => /Ghost/i.test(v)) === true,
  },
  // ── eCommerce ────────────────────────────────────────
  {
    name: 'Shopify',
    categories: ['eCommerce'],
    check: (s) =>
      /cdn\.shopify\.com/.test(s.html) || /Shopify\.theme/.test(s.html),
  },
  {
    name: 'WooCommerce',
    categories: ['eCommerce'],
    check: (s) =>
      /woocommerce/i.test(s.html) || /wc-cart/.test(s.html),
  },
  {
    name: 'BigCommerce',
    categories: ['eCommerce'],
    check: (s) =>
      /bigcommerce/i.test(s.html) || /cdn\.bigcommerce\.com/.test(s.html),
  },
  {
    name: 'PrestaShop',
    categories: ['eCommerce'],
    check: (s) =>
      /prestashop/i.test(s.html) ||
      s.meta['generator']?.some((v) => /PrestaShop/i.test(v)) === true,
  },
  // ── Analytics ────────────────────────────────────────
  {
    name: 'Google Analytics',
    categories: ['Analytics'],
    check: (s) =>
      /google-analytics\.com|googletagmanager\.com\/gtag/.test(s.html) ||
      s.scriptSrc.some((src) =>
        /google-analytics\.com|gtag\/js/.test(src),
      ),
  },
  {
    name: 'Matomo (Piwik)',
    categories: ['Analytics'],
    check: (s) =>
      /matomo|piwik/i.test(s.html) ||
      s.scriptSrc.some((src) => /matomo|piwik/i.test(src)),
  },
  {
    name: 'Hotjar',
    categories: ['Analytics'],
    check: (s) =>
      /hotjar\.com/.test(s.html) ||
      s.scriptSrc.some((src) => /hotjar\.com/.test(src)),
  },
  // ── Web Servers ──────────────────────────────────────
  {
    name: 'Nginx',
    categories: ['Web Server'],
    check: (s) => s.headers['server']?.some((v) => /nginx/i.test(v)) === true,
  },
  {
    name: 'Apache',
    categories: ['Web Server'],
    check: (s) => s.headers['server']?.some((v) => /apache/i.test(v)) === true,
  },
  {
    name: 'IIS',
    categories: ['Web Server'],
    check: (s) =>
      s.headers['server']?.some((v) => /Microsoft-IIS/i.test(v)) === true,
  },
  // ── CDN ──────────────────────────────────────────────
  {
    name: 'Cloudflare',
    categories: ['CDN'],
    check: (s) =>
      s.headers['cf-ray'] !== undefined ||
      s.headers['server']?.some((v) => /cloudflare/i.test(v)) === true,
  },
  {
    name: 'Akamai',
    categories: ['CDN'],
    check: (s) =>
      s.headers['x-akamai-transformed'] !== undefined ||
      /akamai/i.test(JSON.stringify(s.headers)),
  },
  {
    name: 'Fastly',
    categories: ['CDN'],
    check: (s) =>
      s.headers['x-fastly-request-id'] !== undefined ||
      s.headers['via']?.some((v) => /fastly/i.test(v)) === true,
  },
  {
    name: 'AWS CloudFront',
    categories: ['CDN'],
    check: (s) =>
      s.headers['x-amz-cf-id'] !== undefined ||
      s.headers['via']?.some((v) => /CloudFront/i.test(v)) === true,
  },
  // ── CSS Frameworks ───────────────────────────────────
  {
    name: 'Tailwind CSS',
    categories: ['CSS Framework'],
    check: (s) => /tailwindcss|tw-/.test(s.html),
  },
  {
    name: 'Bootstrap',
    categories: ['CSS Framework'],
    check: (s) =>
      /bootstrap/i.test(s.html) ||
      s.scriptSrc.some((src) => /bootstrap/i.test(src)),
  },
  // ── Chat & Support ──────────────────────────────────
  {
    name: 'Intercom',
    categories: ['Customer Support'],
    check: (s) =>
      /intercom/i.test(s.html) ||
      s.scriptSrc.some((src) => /intercom/.test(src)),
  },
  {
    name: 'Zendesk',
    categories: ['Customer Support'],
    check: (s) =>
      /zendesk/i.test(s.html) ||
      s.scriptSrc.some((src) => /zendesk/.test(src)),
  },
  {
    name: 'Drift',
    categories: ['Customer Support'],
    check: (s) =>
      /drift\.com/.test(s.html) ||
      s.scriptSrc.some((src) => /drift/.test(src)),
  },
  // ── Payment ──────────────────────────────────────────
  {
    name: 'Stripe',
    categories: ['Payment'],
    check: (s) =>
      /js\.stripe\.com/.test(s.html) ||
      s.scriptSrc.some((src) => /stripe\.com/.test(src)),
  },
  {
    name: 'PayPal',
    categories: ['Payment'],
    check: (s) =>
      /paypal\.com/.test(s.html) ||
      s.scriptSrc.some((src) => /paypal\.com/.test(src)),
  },
];

export async function detectTechnologies(
  scraped: ScrapedData,
): Promise<DetectedTech[]> {
  const results: DetectedTech[] = [];

  // Built-in simple detection
  for (const rule of simpleRules) {
    try {
      if (rule.check(scraped)) {
        results.push({
          name: rule.name,
          categories: rule.categories,
          confidence: 90,
          version: rule.versionExtract?.(scraped),
        });
      }
    } catch {
      // Skip rules that error out
    }
  }

  // Custom enterprise martech detection
  const customResults = customDetect(scraped);

  // Merge and deduplicate
  const all = [...results, ...customResults];
  const seen = new Set<string>();
  return all.filter((tech) => {
    const key = tech.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

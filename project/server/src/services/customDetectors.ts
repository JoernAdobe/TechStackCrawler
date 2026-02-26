import type { ScrapedData } from './scraper.js';

export interface DetectedTech {
  name: string;
  categories: string[];
  confidence: number;
  version?: string;
}

interface DetectionRule {
  name: string;
  categories: string[];
  patterns: {
    html?: RegExp[];
    scriptSrc?: RegExp[];
    cookies?: string[];
    headers?: Record<string, RegExp>;
    meta?: Record<string, RegExp>;
  };
}

const rules: DetectionRule[] = [
  // ── CMS ──────────────────────────────────────────────
  {
    name: 'Adobe Experience Manager',
    categories: ['CMS'],
    patterns: {
      html: [/\/etc\.clientlibs\//, /cq[-:]template/, /jcr:content/, /\/content\/dam\//],
      cookies: ['cq-authoring-mode'],
      scriptSrc: [/\/etc\.clientlibs\//, /granite\.js/],
    },
  },
  {
    name: 'Sitecore',
    categories: ['CMS'],
    patterns: {
      html: [/sitecore/i, /__sc_/, /sc_site/],
      cookies: ['SC_ANALYTICS_GLOBAL_COOKIE', 'sitecore'],
    },
  },
  {
    name: 'Contentful',
    categories: ['CMS'],
    patterns: {
      html: [/contentful/i, /ctfassets\.net/],
      scriptSrc: [/contentful/],
    },
  },
  {
    name: 'Sanity',
    categories: ['CMS'],
    patterns: {
      html: [/sanity\.io/, /cdn\.sanity\.io/],
    },
  },
  // ── eCommerce ────────────────────────────────────────
  {
    name: 'Adobe Commerce (Magento)',
    categories: ['eCommerce'],
    patterns: {
      html: [/Magento/, /magento/i, /mage\//, /requirejs-config.*Magento/],
      scriptSrc: [/mage\//, /static\/version/],
      cookies: ['PHPSESSID', 'form_key'],
    },
  },
  {
    name: 'Salesforce Commerce Cloud',
    categories: ['eCommerce'],
    patterns: {
      html: [/demandware\.net/, /demandware\.store/],
      scriptSrc: [/demandware/],
    },
  },
  {
    name: 'SAP Commerce Cloud (Hybris)',
    categories: ['eCommerce'],
    patterns: {
      html: [/hybris/i, /_ui\/responsive/, /acceleratorservices/],
    },
  },
  {
    name: 'Oracle Commerce Cloud',
    categories: ['eCommerce'],
    patterns: {
      html: [/oracle\.com.*commerce/i, /ccstore/],
    },
  },
  // ── DMP ──────────────────────────────────────────────
  {
    name: 'Adobe Audience Manager',
    categories: ['DMP'],
    patterns: {
      html: [/demdex\.net/, /dpm\.demdex\.net/],
      scriptSrc: [/demdex\.net/, /dil\.js/],
    },
  },
  {
    name: 'Oracle BlueKai',
    categories: ['DMP'],
    patterns: {
      html: [/bluekai\.com/, /bkrtx\.com/],
      scriptSrc: [/bluekai\.com/, /bkrtx\.com/],
    },
  },
  {
    name: 'Lotame',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/lotame\.com/, /crwdcntrl\.net/],
    },
  },
  // ── CDP ──────────────────────────────────────────────
  {
    name: 'Adobe Real-Time CDP',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/alloy\.js/, /launchpad\.adobedc\.net/],
      html: [/adobedc\.net/],
    },
  },
  {
    name: 'Segment',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/cdn\.segment\.com/, /cdn\.segment\.io/],
      html: [/analytics\.identify/, /analytics\.track/],
    },
  },
  {
    name: 'Tealium',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/tags\.tiqcdn\.com/, /tealium/],
    },
  },
  {
    name: 'mParticle',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/mparticle\.com/],
    },
  },
  // ── Analytics ────────────────────────────────────────
  {
    name: 'Adobe Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/omtrdc\.net/, /AppMeasurement/, /assets\.adobedtm\.com/],
      html: [/s_account/, /omniture/i, /sc\.omtrdc\.net/],
    },
  },
  {
    name: 'Adobe Experience Platform Web SDK',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/alloy\.js/, /launch-.*\.adobedtm\.com/],
      html: [/alloy\(/, /adobedc\.net/],
    },
  },
  // ── Personalization & Optimization ───────────────────
  {
    name: 'Adobe Target',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/tt\.omtrdc\.net/, /at\.js/],
      html: [/mboxCreate/, /adobe\.target/, /mbox/],
    },
  },
  {
    name: 'Optimizely',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/cdn\.optimizely\.com/],
    },
  },
  {
    name: 'VWO',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dev\.visualwebsiteoptimizer\.com/, /vwo_code/],
    },
  },
  {
    name: 'Dynamic Yield',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dynamicyield\.com/, /dy-api/],
    },
  },
  // ── DAM ──────────────────────────────────────────────
  {
    name: 'Adobe Experience Manager Assets',
    categories: ['DAM'],
    patterns: {
      html: [/\/content\/dam\//, /assets\.adobe\.com/],
    },
  },
  {
    name: 'Bynder',
    categories: ['DAM'],
    patterns: {
      html: [/bynder\.com/, /bynder/i],
    },
  },
  {
    name: 'Canto',
    categories: ['DAM'],
    patterns: {
      html: [/canto\.com/, /cantoglobal/],
    },
  },
  // ── CRM ──────────────────────────────────────────────
  {
    name: 'Salesforce',
    categories: ['CRM'],
    patterns: {
      html: [/force\.com/, /salesforce\.com/],
      scriptSrc: [/force\.com/],
    },
  },
  {
    name: 'Microsoft Dynamics',
    categories: ['CRM'],
    patterns: {
      html: [/dynamics\.com/, /msdyncrm/],
    },
  },
  {
    name: 'HubSpot CRM',
    categories: ['CRM'],
    patterns: {
      scriptSrc: [/js\.hs-scripts\.com/, /js\.hubspot\.com/],
      html: [/hubspot/i],
    },
  },
  // ── ESP / Marketing Automation ───────────────────────
  {
    name: 'Adobe Marketo Engage',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/munchkin\.marketo\.net/, /mktoForms/],
      html: [/mktoForm/, /marketo/i, /munchkin/i],
    },
  },
  {
    name: 'Salesforce Marketing Cloud',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/exacttarget\.com/, /salesforce-mc/],
      html: [/exacttarget/i],
    },
  },
  {
    name: 'Eloqua',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/eloqua\.com/, /elqtrack/],
      html: [/eloqua/i, /elqTrack/],
    },
  },
  {
    name: 'Pardot',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/pardot\.com/, /pi\.pardot/],
      html: [/pardot/i],
    },
  },
  {
    name: 'Klaviyo',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/klaviyo\.com/, /static\.klaviyo/],
    },
  },
  // ── EDW / Data ───────────────────────────────────────
  {
    name: 'Snowflake',
    categories: ['EDW'],
    patterns: {
      html: [/snowflake/i],
    },
  },
  // ── Tag Management ───────────────────────────────────
  {
    name: 'Adobe Experience Platform Launch',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/assets\.adobedtm\.com/, /launch-.*\.min\.js/],
    },
  },
  {
    name: 'Google Tag Manager',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/googletagmanager\.com/],
      html: [/GTM-[A-Z0-9]+/],
    },
  },
  // ── Advertising / Tracking ───────────────────────────
  {
    name: 'Adobe Advertising Cloud',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/everesttech\.net/],
      html: [/everesttech\.net/],
    },
  },
  {
    name: 'Google Ads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/googleads\.g\.doubleclick\.net/, /pagead2\.googlesyndication/],
    },
  },
  {
    name: 'Facebook Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/connect\.facebook\.net/],
      html: [/fbq\(/, /facebook\.com\/tr/],
    },
  },
];

export function customDetect(scraped: ScrapedData): DetectedTech[] {
  const detected: DetectedTech[] = [];

  for (const rule of rules) {
    let matched = false;

    // Check HTML patterns
    if (!matched && rule.patterns.html) {
      matched = rule.patterns.html.some((re) => re.test(scraped.html));
    }

    // Check script source patterns
    if (!matched && rule.patterns.scriptSrc) {
      matched = rule.patterns.scriptSrc.some((re) =>
        scraped.scriptSrc.some((src) => re.test(src)),
      );
    }

    // Check cookie name patterns
    if (!matched && rule.patterns.cookies) {
      matched = rule.patterns.cookies.some((name) => name in scraped.cookies);
    }

    // Check header patterns
    if (!matched && rule.patterns.headers) {
      for (const [header, re] of Object.entries(rule.patterns.headers)) {
        const headerKey = Object.keys(scraped.headers).find(
          (k) => k.toLowerCase() === header.toLowerCase(),
        );
        if (headerKey && scraped.headers[headerKey]?.some((v) => re.test(v))) {
          matched = true;
          break;
        }
      }
    }

    // Check meta tag patterns
    if (!matched && rule.patterns.meta) {
      for (const [metaName, re] of Object.entries(rule.patterns.meta)) {
        if (scraped.meta[metaName]?.some((v) => re.test(v))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      detected.push({
        name: rule.name,
        categories: rule.categories,
        confidence: 80,
      });
    }
  }

  return detected;
}

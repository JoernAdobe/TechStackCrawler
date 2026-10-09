import assert from 'node:assert/strict';
import test from 'node:test';
import { annotatePreConsent, PRE_CONSENT_WARNING } from '../src/services/consentAudit.js';
import { classifyCnameChain, detectFromDns, firstPartyHosts } from '../src/services/dnsSignals.js';
import type { DetectedTech } from '../src/services/customDetectors.js';
import type { ScrapedData } from '../src/services/scraper.js';

function page(overrides: Partial<ScrapedData> = {}): ScrapedData {
  return {
    url: 'https://www.example.co.uk/',
    finalUrl: 'https://www.example.co.uk/',
    html: '',
    headers: {},
    meta: {},
    scriptSrc: [],
    cookies: {},
    title: '',
    bodyText: '',
    links: [],
    requests: [],
    jsGlobals: {},
    edgeSignals: [],
    ...overrides,
  };
}

test('firstPartyHosts keeps only same registrable domain (incl. co.uk)', () => {
  const hosts = firstPartyHosts(
    page({
      requests: ['https://smetrics.example.co.uk/b/ss/x/1/JS-2.0/s1', 'https://www.google-analytics.com/g/collect'],
      scriptSrc: ['https://assets.example.co.uk/app.js', 'https://other.co.uk/x.js'],
    }),
  );
  assert.deepEqual(hosts, ['www.example.co.uk', 'smetrics.example.co.uk', 'assets.example.co.uk']);
});

test('classifyCnameChain maps AEM Cloud Service, Analytics CNAME and CDN', () => {
  assert.deepEqual(
    classifyCnameChain('www.example.de', ['cdn.adobeaemcloud.com', 'adobe-aem.map.fastly.net']).map((c) => c.tech),
    ['Adobe Experience Manager', 'Fastly'],
  );
  assert.equal(classifyCnameChain('smetrics.example.de', ['example.de.ssl.sc.omtrdc.net'])[0]?.tech, 'Adobe Analytics');
  assert.deepEqual(classifyCnameChain('x.example.de', ['notacdn.example.net']), []);
});

test('detectFromDns follows CNAME chains with an injected resolver', async () => {
  const table: Record<string, string[]> = {
    'www.example.co.uk': ['www.example.co.uk.edgekey.net'],
    'www.example.co.uk.edgekey.net': ['e123.a.akamaiedge.net'],
    'smetrics.example.co.uk': ['example.co.uk.ssl.d1.sc.omtrdc.net'],
  };
  const resolver = async (h: string) => {
    if (table[h]) return table[h];
    throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
  };
  const found = await detectFromDns(page({ requests: ['https://smetrics.example.co.uk/b/ss/rs/1/JS-2.0/s1'] }), resolver);
  const names = found.map((d) => d.name).sort();
  assert.deepEqual(names, ['Adobe Analytics', 'Akamai']);
  assert.ok(found.every((d) => d.confidence >= 90 && d.evidence?.length));
  assert.ok(found.find((d) => d.name === 'Adobe Analytics')?.evidence?.[0].includes('smetrics.example.co.uk'));
});

test('annotatePreConsent flags tracking that fires before banner accept', () => {
  const detected: DetectedTech[] = [
    { name: 'Facebook / Meta Pixel', categories: ['Advertising'], confidence: 90 },
    { name: 'Google Analytics 4', categories: ['Analytics'], confidence: 90, evidence: ['Measurement ID(s): G-1'] },
    { name: 'OneTrust', categories: ['Consent Management'], confidence: 90 },
  ];
  const flagged = annotatePreConsent(
    detected,
    {
      bannerAccepted: true,
      preConsentRequests: ['https://www.facebook.com/tr/?id=123&ev=PageView', 'https://cdn.cookielaw.org/consent/x.js'],
      preConsentCookies: [],
    },
    'https://www.example.de/',
  );
  assert.deepEqual(flagged, ['Facebook / Meta Pixel']);
  assert.equal(detected[0].evidence?.[0], PRE_CONSENT_WARNING);
  assert.equal(detected[1].evidence?.[0], 'Measurement ID(s): G-1');
  assert.equal(detected[2].evidence, undefined);
});

test('annotatePreConsent is a no-op when no banner was accepted', () => {
  const detected: DetectedTech[] = [{ name: 'Facebook / Meta Pixel', categories: ['Advertising'], confidence: 90 }];
  const flagged = annotatePreConsent(
    detected,
    { bannerAccepted: false, preConsentRequests: ['https://www.facebook.com/tr/?id=1'], preConsentCookies: [] },
    'https://www.example.de/',
  );
  assert.deepEqual(flagged, []);
  assert.equal(detected[0].evidence, undefined);
});

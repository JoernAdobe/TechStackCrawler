/**
 * Martech-Regeln aus docs/library-research/03-rule-proposals.json (Server-Side-/Consent-Fallbacks)
 * und den Top-Konkurrenzprodukten aus 01-open-source-fingerprints.md.
 * Signale sind eigenständig aus Hersteller-Dokumentation formuliert (keine Wappalyzer-Patterns).
 */
import type { DetectionRule } from '../customDetectors.js';
import { host } from './ruleHelpers.js';

export const MARTECH_RULES: DetectionRule[] = [
  {
    // /g/collect allein ist generisch: nur auf Nicht-Google-Hosts UND mit GA4-Parametern (v=2, tid=G-…).
    // /mp/collect (Measurement Protocol) ist Server-zu-Server und im Browser nicht sichtbar → bewusst weggelassen.
    name: 'Server-Side GTM (First-Party Collect)',
    categories: ['Tag Management'],
    maxConfidence: 75,
    patterns: {
      requests: [
        /^https?:\/\/(?![^/]*(google-analytics|googletagmanager|analytics\.google|doubleclick)\.)[^/]+\/g\/collect(?=\?([^#]*&)?v=2(&|$))(?=\?([^#]*&)?tid=G-)/,
      ],
    },
  },
  {
    // Herstellerunabhängig: jeder TCF-v2-CMP setzt euconsent-v2. __tcfapi wird mangels JS-Probe nicht geprüft.
    name: 'IAB TCF v2 CMP',
    categories: ['Consent Management'],
    maxConfidence: 80,
    patterns: { cookies: ['euconsent-v2'] },
  },

  // ── Konkurrenzprodukte (01) ──
  {
    name: 'Salesforce Data Cloud',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [host('c360a.salesforce.com')],
      requests: [host('c360a.salesforce.com')],
    },
  },
  {
    name: 'Oracle Maxymiser',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [host('service.maxymiser.net')],
      requests: [/(^|\/\/)service\.maxymiser\.net\/(api|cdn)\//],
      cookies: ['mmapi.'],
    },
  },
  {
    name: 'IBM Tealeaf',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/(^|\/)tealeaf(\.[\w-]+)?(\.min)?\.js(\?|$)/i],
      requests: [/\/TealeafTarget\.(php|jsp|aspx)/i],
      cookies: ['TLTSID'],
    },
  },
  {
    name: 'Oracle Infinity',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/(^|\/\/)(c|d)\.oracleinfinity\.io\//],
      requests: [/(^|\/\/)dc\.oracleinfinity\.io\//],
      cookies: ['ORA_FPC', 'oracleinfinity'],
    },
  },
  {
    name: 'Acquia Personalization',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/(^|[\/.])lift\.acquia\.com\//],
      requests: [/(^|[\/.])lift\.acquia\.com\//],
    },
  },
  {
    name: 'Acquia CDP',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [host('agilone.com')],
      requests: [host('agilone.com')],
    },
  },
  {
    name: 'Acquia Site Studio',
    categories: ['CMS'],
    patterns: { html: [/\/sites\/default\/files\/cohesion\//] },
  },
];

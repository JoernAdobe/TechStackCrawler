import { BRIEFING_SECTIONS, type BriefingResult, type BriefingSection, type BriefingSectionId, type BriefingSource } from '../../src/types/briefing.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon YYYY" relativ zu heute (der Validator prüft Zukunft/Alter gegen das aktuelle Datum). */
export function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const XSS = '<script>alert("x")</script>';

function src(title: string, url: string, publisher: string, independent: boolean, ago = 1, snippetOnly = false): BriefingSource {
  return { title, url, publisher, date: monthsAgo(ago), independent, ...(snippetOnly ? { snippetOnly } : {}) };
}

function section(id: BriefingSectionId, blocks: BriefingSection['blocks'], sources: BriefingSource[], gaps: string[] = []): BriefingSection {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === id)!;
  return { id, title: meta.title, eyebrow: meta.eyebrow, status: 'done', blocks, sources, gaps };
}

/** Reichhaltiges Fixture: alle Blocktypen, bösartige Strings, abgewählte Abschnitte (nur s01, s04, s09, s12, s14). */
export function buildBriefingFixture(overrides: Partial<BriefingResult> = {}): BriefingResult {
  const sections: BriefingSection[] = [
    section(
      's01',
      [
        { type: 'paragraph', text: `Northwind Rockets is a European launch provider with 4,200 employees. ${XSS} See s04 for the platform and s05 for marketing.` },
        {
          type: 'feature-grid',
          cards: [
            { label: 'Headquarters', value: 'Bremen, Germany', detail: 'Founded 1998' },
            { label: 'Employees', value: '4,200', detail: 'FY2025 annual report' },
            { label: 'Revenue', value: 'EUR 1.9bn', detail: '+12% YoY' },
            { label: 'Markets', value: `EU & US ${XSS}` },
          ],
        },
      ],
      [
        src('Annual Report 2025', 'https://www.northwind-rockets.example/investors/annual-report-2025', 'Northwind Rockets', false, 2),
        src('Northwind lifts guidance', 'https://www.reuters.com/business/aerospace/northwind-lifts-guidance', 'Reuters', true, 1),
        src('European launch market review', 'https://www.ft.com/content/launch-market-review', 'Financial Times', true, 3, true),
      ],
    ),
    section(
      's04',
      [
        { type: 'paragraph', text: 'The company runs a composable commerce stack and is consolidating analytics vendors.' },
        {
          type: 'steps',
          items: [
            { title: 'Cloud migration', body: 'Moved core ERP workloads to a hyperscaler in 2025.' },
            { title: 'Data platform', body: `Centralising customer data in a warehouse ${XSS}.` },
          ],
        },
        { type: 'note', title: 'Tech signal', text: 'Detected tag manager and A/B testing tool on the main site.' },
      ],
      [
        src('Digital strategy keynote', 'https://www.computerweekly.com/news/northwind-digital-strategy', 'Computer Weekly', true, 2),
        src('Careers: Data Engineer', 'https://careers.northwind-rockets.example/jobs/data-engineer', 'Northwind Rockets', false, 1),
      ],
    ),
    section(
      's09',
      [
        { type: 'paragraph', text: 'Three competitors dominate the segment; pricing pressure is rising.' },
        {
          type: 'legend',
          items: [
            { label: 'Leader', color: '#EB1000', text: 'Orbital Freight AG' },
            { label: 'Challenger', color: 'javascript:alert(1)', text: 'Skyline Launch Ltd' },
          ],
        },
      ],
      [
        src('Launch market share 2026', 'https://www.statista.com/statistics/launch-market-share', 'Statista', true, 4),
        src('Competitor pricing analysis', 'https://www.spacenews.com/competitor-pricing-analysis', 'SpaceNews', true, 2),
      ],
    ),
    section(
      's12',
      [
        { type: 'paragraph', text: 'Key decision makers for marketing and digital.' },
        {
          type: 'table',
          headers: ['Name', 'Role', 'Relevance'],
          rows: [
            ['Jane Doe', 'Chief Digital Officer', 'Owns the digital roadmap'],
            ['John Roe', 'CMO', `Budget owner ${XSS}`],
          ],
        },
      ],
      [
        src('Leadership team', 'https://www.northwind-rockets.example/about/leadership', 'Northwind Rockets', false, 1),
        src('CDO interview', 'https://www.handelsblatt.com/technik/northwind-cdo-interview', 'Handelsblatt', true, 2),
      ],
      ['Procurement lead not publicly available (searched LinkedIn and press releases).'],
    ),
    section(
      's14',
      [
        { type: 'paragraph', text: 'Adobe can support the data consolidation (s04) and the competitive pressure described in s09.' },
        {
          type: 'steps',
          items: [
            { title: 'Adobe Real-Time CDP for unified profiles', body: 'Builds on the warehouse initiative.' },
            { title: 'Adobe Journey Optimizer for lifecycle messaging', body: 'Supports retention under price pressure.' },
            { title: 'Adobe Customer Journey Analytics for vendor consolidation', body: 'Replaces fragmented analytics tools.' },
            { title: 'Adobe Experience Manager Sites for brand consistency', body: `Unifies the web estate ${XSS}.` },
          ],
        },
      ],
      [
        src('Analytics vendor consolidation RFP', 'https://www.ted.europa.eu/notice/northwind-analytics', 'TED', true, 1),
        src('Customer data platform market guide', 'https://www.gartner.com/en/documents/cdp-market-guide', 'Gartner', true, 5),
      ],
    ),
  ];

  return {
    jobId: 42,
    analysisId: 7,
    companyName: 'Northwind Rockets',
    domain: 'northwind-rockets.example',
    clientDomains: ['northwind-rockets.example', 'careers.northwind-rockets.example'],
    generatedAt: new Date().toISOString(),
    language: 'en',
    sections,
    executive: {
      overallScore: 72,
      band: 'high',
      confidence: 'medium',
      verdict: `Strong fit driven by the data consolidation programme ${XSS}.`,
      bullets: [
        { key: 'whyNow', label: 'Why now', text: 'Analytics consolidation RFP is open.', sectionRef: 's14', source: sections[4].sources[0] },
        { key: 'topOpportunity', label: 'Top opportunity', text: 'Unified customer profiles.', sectionRef: 's04' },
        { key: 'keyRisk', label: 'Key risk', text: 'Price pressure from competitors.', sectionRef: 's09' },
        { key: 'whoToTalkTo', label: 'Who to talk to', text: 'Chief Digital Officer.', sectionRef: 's12' },
        { key: 'nextStep', label: 'Next step', text: `Request discovery workshop ${XSS}.`, sectionRef: 's05' },
      ],
      subScores: [
        { key: 'whitespace', label: 'Adobe whitespace', weight: 0.3, value: 80, kind: 'measured', rationale: 'No Adobe products detected.', sectionRefs: ['s04'] },
        { key: 'maturity', label: 'Digital maturity', weight: 0.15, value: 60, kind: 'rated', rubricLevel: 3, rationale: 'Modern stack, fragmented data.', sectionRefs: ['s04'] },
        { key: 'reach', label: 'Digital reach', weight: 0.15, value: null, kind: 'measured', rationale: 'Traffic data unavailable.', sectionRefs: [] },
        { key: 'momentum', label: 'Momentum', weight: 0.2, value: 70, kind: 'rated', rubricLevel: 4, rationale: 'Revenue growth of 12%.', sectionRefs: ['s01'] },
        { key: 'urgency', label: 'Urgency', weight: 0.2, value: 75, kind: 'rated', rubricLevel: 4, rationale: 'Open RFP.', sectionRefs: ['s14', 's09'] },
      ],
      topPlays: [
        { product: 'Adobe Real-Time CDP', headline: 'Unify customer profiles', basedOn: 'Warehouse initiative', sectionRef: 's04' },
        { product: 'Customer Journey Analytics', headline: 'Consolidate analytics', basedOn: 'Open RFP', sectionRef: 's14' },
        { product: 'Adobe Journey Optimizer', headline: 'Retention journeys', basedOn: 'Price pressure', sectionRef: 's09' },
      ],
    },
    validation: { ok: true, errors: [], warnings: [] },
    usage: { inputTokens: 1000, outputTokens: 500, usd: 0.12, searches: 10, fetches: 8 },
    ...overrides,
  };
}

export const FIXTURE_SECTIONS: BriefingSectionId[] = ['s01', 's04', 's09', 's12', 's14'];

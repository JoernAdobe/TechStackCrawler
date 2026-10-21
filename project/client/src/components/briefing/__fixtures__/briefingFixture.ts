/**
 * Dev-only Fixture für das Client Pre-Briefing (fiktives Unternehmen).
 * Wird nur über den Mock-Shim in useBriefing geladen (import.meta.env.DEV).
 */
import type {
  BriefingBlock,
  BriefingResult,
  BriefingSection,
  BriefingSectionId,
  BriefingSource,
} from '../../../types/briefing';
import { BRIEFING_SECTIONS } from '../../../types/briefing';

const src = (title: string, url: string, publisher: string, date: string, independent = true, snippetOnly?: boolean): BriefingSource => ({
  title, url, publisher, date, independent, ...(snippetOnly ? { snippetOnly } : {}),
});

const SOURCES = {
  annual: src('Annual Report 2025', 'https://www.nordwind-group.example/investors/annual-report-2025', 'Nordwind Group', 'Mar 2026', false),
  press: src('Nordwind names new Chief Digital Officer', 'https://news.example.com/retail/nordwind-cdo', 'Retail Weekly', 'Aug 2026'),
  ft: src('Nordwind accelerates e-commerce replatforming', 'https://www.ft.example/content/nordwind-replatforming', 'Financial Times', 'Sep 2026', true, true),
  jobs: src('Senior Engineer – Composable Commerce (job posting)', 'https://careers.nordwind-group.example/jobs/4711', 'Nordwind Careers', 'Oct 2026', false),
  wiki: src('Nordwind Group', 'https://en.wikipedia.org/wiki/Special:Search?search=Nordwind+Group', 'Wikipedia', 'n.d.'),
  semrush: src('Domain overview nordwind-group.example', 'https://www.semrush.com/analytics/overview/', 'Semrush', 'Oct 2026'),
  regulator: src('EU Digital Services Act – retailer obligations', 'https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package', 'European Commission', 'Jun 2026'),
};

const para = (text: string): BriefingBlock => ({ type: 'paragraph', text });

function section(id: BriefingSectionId, status: BriefingSection['status'], blocks: BriefingBlock[], sources: BriefingSource[], gaps: string[] = []): BriefingSection {
  const meta = BRIEFING_SECTIONS.find((s) => s.id === id)!;
  return { id, title: meta.title, eyebrow: meta.eyebrow, status, blocks, sources, gaps };
}

const SECTIONS: BriefingSection[] = [
  section('s01', 'done', [
    para('Nordwind Group is a European omnichannel retailer for home and lifestyle products, headquartered in Hamburg with roughly 410 stores in 9 countries and about 18,500 employees.'),
    { type: 'feature-grid', cards: [
      { label: 'Founded', value: '1962', detail: 'Family-owned until 2011 IPO' },
      { label: 'Headquarters', value: 'Hamburg, DE' },
      { label: 'Employees', value: '~18,500', detail: 'FY2025' },
      { label: 'Markets', value: '9 countries', detail: 'DACH, Nordics, Benelux' },
    ] },
  ], [SOURCES.annual, SOURCES.wiki]),
  section('s02', 'done', [
    para('Core categories are furniture, home textiles and kitchenware; private labels account for about 45% of revenue. A marketplace for third-party sellers launched in 2025.'),
    { type: 'table', headers: ['Category', 'Share of revenue', 'Trend'], rows: [
      ['Furniture', '38%', 'Stable'], ['Home textiles', '27%', 'Growing'], ['Kitchenware', '21%', 'Growing'], ['Marketplace', '4%', 'New'],
    ] },
  ], [SOURCES.annual]),
  section('s03', 'done', [
    { type: 'feature-grid', cards: [
      { label: 'Revenue FY2025', value: '€4.2bn', detail: '+3.1% YoY' },
      { label: 'Online share', value: '24%', detail: 'up from 19%' },
      { label: 'EBIT margin', value: '4.8%' },
      { label: 'Capex digital', value: '€140m', detail: 'planned FY2026' },
    ] },
    { type: 'note', title: 'Paywalled source', text: 'Capex figure seen in a paywalled article snippet only; confirmed by the annual report outlook.' },
  ], [SOURCES.annual, SOURCES.ft]),
  section('s04', 'done', [
    para('The TechStack scan shows Salesforce Commerce Cloud, Google Analytics 4, Tealium iQ and a custom CMS. Job postings point to a composable commerce migration in 2026–2027.'),
    { type: 'steps', items: [
      { title: 'Today', body: 'Monolithic SFCC storefront with custom CMS and GA4.' },
      { title: '2026', body: 'Headless front end and new CDP evaluation (job postings).' },
      { title: '2027', body: 'Contract renewal window for the commerce platform.' },
    ] },
    { type: 'legend', items: [
      { label: 'Adobe', color: '#EB1000', text: 'No Adobe products detected' },
      { label: 'Competitor', color: '#F59E0B', text: 'Salesforce, Google, Tealium' },
      { label: 'Custom', color: '#8B8FA0', text: 'In-house CMS' },
    ] },
  ], [SOURCES.jobs, SOURCES.ft]),
  section('s05', 'done', [
    para('Brand campaigns run mainly on TV and paid social; a new retail media network was announced in spring 2026.'),
  ], [SOURCES.press]),
  section('s06', 'thin', [
    para('Active on Instagram, Pinterest and YouTube. Follower counts are not reported because the platforms block reliable retrieval.'),
  ], [], ['Follower counts: not publicly available (tried YouTube channel page, press kit).']),
  section('s07', 'done', [
    { type: 'feature-grid', cards: [
      { label: 'Organic keywords', value: '182k' }, { label: 'Monthly visits', value: '~9.4m' },
      { label: 'GEO score', value: '41 / 100', detail: 'Low AI visibility' }, { label: 'Lighthouse', value: '58', detail: 'Mobile performance' },
    ] },
  ], [SOURCES.semrush]),
  section('s08', 'done', [
    para('Eight country domains plus a separate marketplace domain and two mobile apps (iOS, Android).'),
  ], [SOURCES.annual]),
  section('s09', 'done', [
    { type: 'table', headers: ['Competitor', 'Positioning', 'Digital strength'], rows: [
      ['Competitor A', 'Value furniture', 'High'], ['Competitor B', 'Premium design', 'Medium'], ['Competitor C', 'Online pure player', 'Very high'],
    ] },
  ], [SOURCES.press]),
  section('s10', 'done', [para('Core audience: households aged 30–55, increasing share of first-time movers via the app.')], [SOURCES.annual]),
  section('s11', 'skipped', [], [], ['Section not selected for this briefing.']),
  section('s12', 'thin', [
    { type: 'table', headers: ['Name', 'Role', 'Source'], rows: [
      ['Jane Example', 'Chief Digital Officer (since Aug 2026)', 'Press release'], ['John Sample', 'CMO', 'Annual report'],
    ] },
  ], [SOURCES.press, SOURCES.annual], ['Head of CRM: not verified (only aggregator sites found, not used).']),
  section('s13', 'error', [], [], ['Research failed: search provider rate-limited. Retry the briefing for this section.']),
  section('s14', 'done', [
    para('No Adobe footprint detected. A fragmented martech stack and an upcoming replatforming create a clear whitespace for Adobe Experience Platform and Adobe Commerce.'),
    { type: 'note', title: 'Timing', text: 'The CDO change and the 2027 renewal window make Q1 2027 the right time for a discovery workshop.' },
  ], [SOURCES.jobs, SOURCES.press, SOURCES.regulator]),
];

export const briefingFixture: BriefingResult = {
  jobId: 9001,
  analysisId: 0,
  companyName: 'Nordwind Group',
  domain: 'nordwind-group.example',
  clientDomains: ['nordwind-group.example'],
  generatedAt: new Date().toISOString(),
  language: 'en',
  sections: SECTIONS,
  executive: {
    overallScore: 74,
    band: 'high',
    confidence: 'medium',
    verdict: 'High urgency: replatforming is under way, a new CDO is in place and the commerce contract renews in 2027.',
    bullets: [
      { key: 'whyNow', label: 'Why now', text: 'New Chief Digital Officer since August 2026 and a composable commerce migration starting in 2026.', sectionRef: 's04', source: SOURCES.press },
      { key: 'topOpportunity', label: 'Top opportunity', text: 'Real-Time CDP to unify 9 country shops, app and loyalty data ahead of the replatforming.', sectionRef: 's14', source: SOURCES.jobs },
      { key: 'keyRisk', label: 'Key risk', text: 'Salesforce incumbency in commerce; a bundled renewal could close the window.', sectionRef: 's04', source: SOURCES.ft },
      { key: 'whoToTalkTo', label: 'Who to talk to', text: 'Jane Example (CDO) as sponsor, John Sample (CMO) for marketing use cases.', sectionRef: 's12', source: SOURCES.press },
      { key: 'nextStep', label: 'Next step', text: 'Propose a 2-hour discovery workshop on data unification before the RFP is drafted.', sectionRef: 's14' },
    ],
    subScores: [
      { key: 'whitespace', label: 'Adobe Whitespace', weight: 0.3, value: 88, kind: 'measured', rationale: 'No Adobe products detected; 6 competitor tools across analytics, tag management and commerce.', sectionRefs: ['s04', 's14'], sources: [SOURCES.jobs] },
      { key: 'maturity', label: 'Digital Maturity', weight: 0.15, value: 52, kind: 'measured', rationale: '34 technologies detected, Lighthouse 58, GEO score 41, consent banner compliant.', sectionRefs: ['s04', 's07'], sources: [SOURCES.semrush] },
      { key: 'reach', label: 'Digital Reach', weight: 0.15, value: 71, kind: 'measured', rationale: '~9.4m monthly visits across 8 country domains plus marketplace and apps.', sectionRefs: ['s07', 's08'] },
      { key: 'momentum', label: 'Business Momentum', weight: 0.2, value: null, kind: 'rated', rationale: 'Not assessed: Strategic Direction research failed, financial trend alone is not sufficient.', sectionRefs: ['s03', 's13'] },
      { key: 'urgency', label: 'Urgency & Triggers', weight: 0.2, value: 80, kind: 'rated', rubricLevel: 4, rationale: 'Leadership change, active replatforming and renewal window within 18 months (rubric level 4 of 5).', sectionRefs: ['s04', 's12'], sources: [SOURCES.press, SOURCES.ft] },
    ],
    topPlays: [
      { product: 'Real-Time CDP', headline: 'Unify customer data across 9 markets and the app', basedOn: 'Job postings for a CDP evaluation in 2026.', sectionRef: 's04' },
      { product: 'Adobe Commerce', headline: 'Composable storefront for the 2027 replatforming', basedOn: 'Commerce contract renewal window in 2027.', sectionRef: 's14' },
      { product: 'Journey Optimizer', headline: 'Personalised journeys for first-time movers', basedOn: 'Growing share of first-time movers via the app.', sectionRef: 's10' },
    ],
  },
  validation: { ok: true, errors: [], warnings: ['s13 missing content'] },
  usage: { inputTokens: 412000, outputTokens: 38000, usd: 1.84, searches: 52, fetches: 37 },
};

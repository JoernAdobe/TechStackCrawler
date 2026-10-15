import type {
  ObservePointInsights,
  OpAdobeFootprint,
  OpCookieInfo,
  OpLaunchBuild,
  OpPrivacyInsight,
  OpQualityInsight,
  OpTagVersion,
  OpVersionsInsight,
  OpWebVitals,
} from '../../types/parity.js';
import {
  getBrowserLogMessages,
  getBrowserLogSummary,
  getCookieSummary,
  getCookies,
  getPageSummary,
  getPageSummaryPages,
  getPageTags,
  getRequestCompliance,
  getRunInfo,
  getRunTagVersionsGrid,
  getTagLibrary,
  getTagDuplicateTags,
  getTagHealthTags,
  type OpBrowserLogMessage,
  type OpBrowserLogSummary,
  type OpCookie,
  type OpCookieSummary,
  type OpGridResponse,
  type OpLibraryTag,
  type OpPageSummary,
  type OpPageTags,
  type OpRequestCompliance,
  type OpRun,
  type OpRunInfo,
  type OpRunTag,
  type OpTagDuplicateTag,
  type OpTagHealthTag,
} from './client.js';
import { deriveFindings } from './findings.js';
import { isSameSite, siteDomain } from './siteDomain.js';
import { WEB_SDK_TAG, deriveUpgrades } from './versionRules.js';

/**
 * Insight-Blöcke aus einem bereits gewählten OP-Run: Versionen, Adobe-Footprint, Quality, Privacy.
 * Die Builder sind rein (Fixtures-testbar); fetchRunInsights holt die Rohdaten fehlertolerant.
 */

const DAY_MS = 86_400_000;
const TOP_MESSAGES = 5;
const TOP_COOKIES = 10;
const LONG_LIVED_DAYS = 395;
/** EU-27 + EWR (IS, LI, NO). */
const EU_EEA = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO'.split(' '),
);
const CONSENT_TOOL = /onetrust|cookiebot|usercentrics|didomi|trustarc|consentmanager|quantcast|iubenda|cookieyes|clarip|cookie consent|cmp/i;
const ADOBE_TAG = /^adobe|marketo|omniture|audience manager/i;
const GOOGLE_ADS_TAG = /google|floodlight|doubleclick/i;

export interface RunInsightInputs {
  run: Pick<OpRun, 'completed' | 'totalUrl'>;
  runTags: OpRunTag[];
  info?: OpRunInfo;
  pageSummary?: OpPageSummary;
  pageTags?: OpPageTags;
  sampledPage?: string;
  grid?: OpGridResponse;
  tagHealthTags?: OpTagHealthTag[];
  duplicateTags?: OpTagDuplicateTag[];
  logSummary?: OpBrowserLogSummary;
  logMessages?: OpBrowserLogMessage[];
  cookieSummary?: OpCookieSummary;
  cookies?: OpCookie[];
  requests?: OpRequestCompliance[];
  /** OP-Tag-Library: Namen für Cookie-Initiatoren, die nicht in den Run-Tags stehen. */
  libraryTags?: OpLibraryTag[];
}

// ── Helfer ───────────────────────────────────────────────────────────────
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const clean = (s: string, max = 200) =>
  s.replace(/[\u0000-\u001f\u007f`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

interface GridTagRow {
  tag: string;
  tagId?: number;
  version: string;
  pages?: number;
  medianMs?: number;
}

/** Grid-Zeilen über die Header-Reihenfolge auslesen (Spalte TAG kommt als [name, id]). */
export function parseTagGrid(grid: OpGridResponse | undefined): GridTagRow[] {
  const headers = grid?.metadata?.headers ?? [];
  const idx = (pred: (h: (typeof headers)[number]['column']) => boolean) => headers.findIndex((h) => pred(h.column));
  const iTag = idx((c) => c.columnId === 'TAG' || c.columnId === 'TAG_NAME');
  const iVer = idx((c) => c.columnId === 'TAG_VERSION');
  const iPages = idx((c) => c.aggregateFunction === 'count_distinct');
  const iMedian = idx((c) => c.aggregateFunction === 'median');
  if (iTag < 0) return [];
  const out: GridTagRow[] = [];
  for (const row of grid?.rows ?? []) {
    const raw = row[iTag];
    const [tag, tagId] = Array.isArray(raw) ? [String(raw[0] ?? ''), Number(raw[1])] : [String(raw ?? ''), undefined];
    if (!tag) continue;
    const num = (i: number) => (i >= 0 && typeof row[i] === 'number' ? (row[i] as number) : undefined);
    out.push({
      tag,
      tagId: Number.isFinite(tagId) ? tagId : undefined,
      version: iVer >= 0 ? String(row[iVer] ?? '').trim() : '',
      pages: num(iPages),
      medianMs: num(iMedian),
    });
  }
  return out;
}

type Vars = Record<string, string>;
interface PageInstance {
  tag: string;
  account: string;
  vars: Vars;
}

function pageInstances(pageTags: OpPageTags | undefined): PageInstance[] {
  const out: PageInstance[] = [];
  for (const t of pageTags?.pageTags ?? []) {
    for (const i of t.pageTagInstances ?? []) {
      const vars: Vars = {};
      for (const v of i.tagInstanceVariables ?? []) {
        const key = v.name.trim();
        if (key && !(key in vars)) vars[key] = String(v.value ?? '');
      }
      out.push({ tag: t.name, account: String(i.account ?? '').trim(), vars });
    }
  }
  return out;
}

export function launchBuild(pageTags: OpPageTags | undefined, runCompleted?: string | null): OpLaunchBuild | undefined {
  const inst = pageInstances(pageTags);
  const sat = inst.find((i) => i.account === '_satellite') ?? inst.find((i) => 'buildInfo.buildDate' in i.vars);
  if (!sat) return undefined;
  const v = sat.vars;
  const build: OpLaunchBuild = {
    propertyName: v['property.name'] || undefined,
    propertyId: v['property.id'] || undefined,
    environment: v['environment.stage'] || undefined,
    environmentId: v['environment.id'] || undefined,
    buildDate: v['buildInfo.buildDate'] || undefined,
    turbineVersion: v['buildInfo.turbineVersion'] || undefined,
  };
  const built = Date.parse(build.buildDate ?? '');
  const ref = Date.parse(runCompleted ?? '') || Date.now();
  if (Number.isFinite(built)) build.buildAgeDays = Math.max(0, Math.floor((ref - built) / DAY_MS));
  return build;
}

// ── 1. Versionen ─────────────────────────────────────────────────────────
export function buildVersions(input: RunInsightInputs): OpVersionsInsight | null {
  if (!input.grid && !input.pageTags) return null;
  const versions = new Map<string, OpTagVersion>();
  const add = (tag: string, version: string, pages?: number) => {
    const v = version.trim();
    if (!v || v.length > 40 || /^(none|null|undefined)$/i.test(v)) return;
    const key = `${tag}|${v}`;
    const prev = versions.get(key);
    if (!prev) versions.set(key, { tag, version: v, pages });
    else if (pages !== undefined && (prev.pages ?? 0) < pages) prev.pages = pages;
  };
  for (const row of parseTagGrid(input.grid)) add(row.tag, row.version, row.pages);
  for (const i of pageInstances(input.pageTags)) {
    const v = i.vars['tag version'] ?? (/^adobe target$/i.test(i.tag) ? i.vars.version : undefined);
    if (v) add(i.tag, v);
    if (i.account === 'adobeDataLayer' && i.vars.version) add('Adobe Client Data Layer', i.vars.version);
    if (i.account === '_satellite' && i.vars['buildInfo.turbineVersion']) {
      add('Adobe Tags (Launch) Turbine', i.vars['buildInfo.turbineVersion']);
    }
  }
  const list = [...versions.values()].sort((a, b) => a.tag.localeCompare(b.tag) || (b.pages ?? 0) - (a.pages ?? 0));
  const launch = launchBuild(input.pageTags, input.run.completed);
  const present = uniq([...input.runTags.filter((t) => t.tagPresentPageCount > 0).map((t) => t.tagName), ...list.map((v) => v.tag)]);
  const upgrades = deriveUpgrades(list, present, launch);
  if (!list.length && !launch && !upgrades.length) return null;
  return { tags: list, launch, upgrades };
}

// ── 2. Adobe-Footprint ──────────────────────────────────────────────────
const ORG_ID = /[A-F0-9]{24}@AdobeOrg/gi;

export function buildAdobeFootprint(input: RunInsightInputs): OpAdobeFootprint | null {
  if (!input.pageTags) return null;
  const inst = pageInstances(input.pageTags);
  const orgs: string[] = [];
  const rs: string[] = [];
  const servers: string[] = [];
  const target: string[] = [];
  const evars = new Set<string>();
  const props = new Set<string>();
  let appMeasurement = false;
  for (const i of inst) {
    for (const val of [i.vars.mcorgid, i.vars['company.orgId'], i.vars.organization_ID]) {
      for (const m of (val ?? '').match(ORG_ID) ?? []) orgs.push(m.toUpperCase().replace('@ADOBEORG', '@AdobeOrg'));
    }
    if (/^adobe analytics$/i.test(i.tag)) {
      appMeasurement ||= /^JS-/i.test(i.vars['tag version'] ?? '');
      for (const a of i.account.split(',')) if (a.trim() && a.trim() !== 'None') rs.push(a.trim());
      if (i.vars.trackingServer) servers.push(i.vars.trackingServer);
      for (const k of Object.keys(i.vars)) {
        if (/^(v|eVar)\d+$/i.test(k)) evars.add(k.replace(/^eVar/i, 'v'));
        else if (/^(c|prop)\d+$/i.test(k)) props.add(k.replace(/^prop/i, 'c'));
      }
    }
    if (/^adobe target$/i.test(i.tag) && i.account && i.account !== 'None') target.push(i.account);
    if (/^adobe extensions$/i.test(i.tag) && /appmeasurement/i.test(i.vars.type ?? i.vars[' type'] ?? '')) appMeasurement = true;
  }
  for (const c of input.cookies ?? []) {
    for (const m of decodeURIComponent(c.name).match(ORG_ID) ?? []) orgs.push(m.toUpperCase().replace('@ADOBEORG', '@AdobeOrg'));
  }
  const allTags = uniq([
    ...input.runTags.filter((t) => t.tagPresentPageCount > 0).map((t) => t.tagName),
    ...inst.map((i) => i.tag),
  ]);
  const adobeTags = allTags.filter((t) => ADOBE_TAG.test(t)).sort();
  const launch = launchBuild(input.pageTags, input.run.completed);
  const fp: OpAdobeFootprint = {
    imsOrgIds: uniq(orgs),
    reportSuites: uniq(rs),
    trackingServers: uniq(servers),
    targetClientCodes: uniq(target),
    launch,
    evarCount: evars.size || undefined,
    propCount: props.size || undefined,
    webSdk: allTags.some((t) => WEB_SDK_TAG.test(t)),
    appMeasurement,
    adobeTags,
    sampledPage: input.sampledPage,
  };
  const empty = !fp.imsOrgIds.length && !fp.reportSuites.length && !fp.adobeTags.length && !launch;
  return empty ? null : fp;
}

// ── 3. Quality ──────────────────────────────────────────────────────────
function rate(value: number | undefined, good: number, poor: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value <= good ? 'good' : value > poor ? 'poor' : 'needs-improvement';
}

export function webVitals(summary: OpPageSummary | undefined): OpWebVitals | undefined {
  const w = summary?.webVitals;
  if (!w) return undefined;
  const vit: OpWebVitals = {
    lcpMs: w.p75LargestContentfulPaint ?? undefined,
    fcpMs: w.p75FirstContentfulPaint ?? undefined,
    ttfbMs: w.p75TimeToFirstByte ?? undefined,
    cls: w.p75CumulativeLayoutShift ?? undefined,
    ratings: {},
  };
  // Eigene Bewertung nach Google-Schwellen (OP-pass-Flag ist laut Audit inkonsistent).
  const r = vit.ratings;
  const set = (k: keyof OpWebVitals['ratings'], v: ReturnType<typeof rate>) => v && (r[k] = v);
  set('lcp', rate(vit.lcpMs, 2500, 4000));
  set('fcp', rate(vit.fcpMs, 1800, 3000));
  set('ttfb', rate(vit.ttfbMs, 800, 1800));
  set('cls', rate(vit.cls, 0.1, 0.25));
  return Object.keys(r).length ? vit : undefined;
}

export function buildQuality(input: RunInsightInputs): OpQualityInsight | null {
  const { tagHealthTags, duplicateTags, logSummary, logMessages, pageSummary, grid } = input;
  if (!tagHealthTags && !duplicateTags && !logSummary && !logMessages && !pageSummary) return null;
  const median = new Map<string, number>();
  for (const row of parseTagGrid(grid)) {
    if (row.medianMs !== undefined) median.set(row.tag, Math.max(median.get(row.tag) ?? 0, row.medianMs));
  }
  const brokenTags = (tagHealthTags ?? [])
    .filter((t) => (t.tagStatusCodeDistribution?.broken ?? 0) > 0)
    .map((t) => ({ name: t.tagName, instances: t.tagStatusCodeDistribution!.broken! }))
    .sort((a, b) => b.instances - a.instances);
  const slowTags = (tagHealthTags ?? [])
    .map((t) => {
      const d = t.tagLoadTimeDistribution ?? {};
      return { name: t.tagName, medianMs: median.get(t.tagName), slowInstances: (d['500to1000'] ?? 0) + (d['1000to2000'] ?? 0) + (d.above2000 ?? 0) };
    })
    .filter((t) => t.slowInstances > 0 || (t.medianMs ?? 0) >= 500)
    .sort((a, b) => b.slowInstances - a.slowInstances || (b.medianMs ?? 0) - (a.medianMs ?? 0));
  const slowestTags = [...median.entries()]
    .map(([name, medianMs]) => ({ name, medianMs }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, 5);
  const duplicates = (duplicateTags ?? [])
    .filter((t) => (t.filteredTagDuplicateCount ?? 0) > 0)
    .map((t) => ({ name: t.tagName, duplicates: t.filteredTagDuplicateCount!, pages: t.filteredTagDuplicatePageCount ?? 0 }))
    .sort((a, b) => b.duplicates - a.duplicates);
  const levelRank = (l: string) => (l === 'error' ? 0 : l === 'warn' ? 1 : 2);
  const consoleMessages = (logMessages ?? [])
    .filter((m) => m.level === 'error' || m.level === 'warn')
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || (b.pageCount ?? 0) - (a.pageCount ?? 0) || (b.logCount ?? 0) - (a.logCount ?? 0))
    .slice(0, TOP_MESSAGES)
    .map((m) => ({
      level: m.level,
      message: clean(m.message),
      count: m.logCount ?? 1,
      pages: m.pageCount ?? 1,
      tag: m.relatedTag?.tagName,
    }));
  return {
    brokenTags,
    duplicateTags: duplicates,
    slowTags,
    slowestTags,
    consoleErrorCount: logSummary?.errorLogCount,
    consoleWarnCount: logSummary?.warnLogCount,
    consoleMessages,
    webVitals: webVitals(pageSummary),
    avgPageLoadMs: pageSummary?.averagePageLoadTime ?? undefined,
  };
}

// ── 4. Privacy ──────────────────────────────────────────────────────────
function consentTool(input: RunInsightInputs, versions: OpTagVersion[]): OpPrivacyInsight['consentTool'] {
  const tags = input.runTags.filter(
    (t) => t.tagPresentPageCount > 0 && (CONSENT_TOOL.test(t.tagName) || /privacy & consent/i.test(t.tagCategoryName ?? '')),
  );
  const pick = tags.find((t) => /banner|cmp/i.test(t.tagName)) ?? tags[0];
  if (!pick) return undefined;
  const vendor = /^(\S+)/.exec(pick.tagName)?.[1] ?? pick.tagName;
  const version = versions.find((v) => v.tag.toLowerCase().startsWith(vendor.toLowerCase()) && /banner|cmp/i.test(v.tag))?.version;
  return { name: vendor === pick.tagName ? vendor : `${vendor} CMP`, version };
}

function googleConsentMode(input: RunInsightInputs): OpPrivacyInsight['googleConsentMode'] {
  const google = pageInstances(input.pageTags).filter((i) => GOOGLE_ADS_TAG.test(i.tag));
  if (!google.length) return undefined;
  const gcs = google.find((i) => i.vars.gcs)?.vars.gcs;
  const gcd = google.find((i) => i.vars.gcd)?.vars.gcd;
  return gcs || gcd ? { detected: true, gcs, gcd } : { detected: false };
}

export function buildPrivacy(input: RunInsightInputs, versions: OpTagVersion[] = []): OpPrivacyInsight | null {
  const { cookies, cookieSummary, requests, info } = input;
  if (!cookies && !cookieSummary && !requests) return null;
  const tagName = new Map((input.libraryTags ?? []).map((t) => [t.id, t.name]));
  for (const t of input.runTags) tagName.set(t.tagId, t.tagName);
  const list: OpCookieInfo[] = (cookies ?? []).map((c) => ({
    name: c.name,
    domain: c.domain,
    party: /3rd|third/i.test(c.partyType ?? '') ? '3rd' : '1st',
    durationDays: c.maxDurationInMinutes ? Math.round(c.maxDurationInMinutes / 1440) : undefined,
    initiatorTags: uniq((c.initiatorTagIds ?? []).map((id) => tagName.get(id) ?? `Tag #${id}`)),
  }));
  const topCookies = [...list]
    .sort((a, b) => (a.party === b.party ? 0 : a.party === '3rd' ? -1 : 1) || (b.durationDays ?? 0) - (a.durationDays ?? 0))
    .slice(0, TOP_COOKIES);
  const thirdParty = cookieSummary?.filteredThirdPartyCookieCount ?? list.filter((c) => c.party === '3rd').length;
  const firstParty = cookieSummary?.filteredFirstPartyCookieCount ?? list.filter((c) => c.party === '1st').length;

  let req: OpPrivacyInsight['requests'];
  if (requests) {
    const byCountry = new Map<string, { code: string; name: string; count: number; eu: boolean }>();
    const hosts: Array<{ host: string; country: string; count: number }> = [];
    let total = 0;
    let nonEu = 0;
    let nonEuThirdParty = 0;
    const site = siteDomain(input.sampledPage);
    for (const r of requests) {
      const code = (r.requestGeo?.countryCode ?? '??').toUpperCase();
      const count = r.requestCount ?? 0;
      const eu = EU_EEA.has(code);
      total += count;
      const entry = byCountry.get(code) ?? { code, name: r.requestGeo?.countryName ?? code, count: 0, eu };
      entry.count += count;
      byCountry.set(code, entry);
      if (!eu) {
        nonEu += count;
        if (!isSameSite(r.requestDomain, site)) {
          nonEuThirdParty += count;
          hosts.push({ host: r.requestDomain, country: code, count });
        }
      }
    }
    req = {
      total,
      nonEu,
      nonEuThirdParty,
      countries: [...byCountry.values()].sort((a, b) => b.count - a.count),
      topNonEuHosts: hosts.sort((a, b) => b.count - a.count).slice(0, 5),
    };
  }
  return {
    cookies: {
      total: cookieSummary?.filteredUniqueCookieCount ?? list.length,
      firstParty,
      thirdParty,
      nonSecure: cookieSummary?.filteredNonSecureCookieCount,
      sameSiteEmpty: cookieSummary?.filteredSameSiteEmptyCookieCount,
      longLived: list.filter((c) => (c.durationDays ?? 0) > LONG_LIVED_DAYS).length,
    },
    topCookies,
    consentTool: consentTool(input, versions),
    googleConsentMode: googleConsentMode(input),
    requests: req,
    runContext: {
      consentActions: info?.privacyConsentActions,
      gpcEnabled: info?.gpcEnabled,
      blockThirdPartyCookies: info?.blockThirdPartyCookies,
    },
  };
}

// ── Zusammenbau ─────────────────────────────────────────────────────────
export function buildInsights(input: RunInsightInputs, notes: string[] = [], now = new Date()): ObservePointInsights {
  const blocks = {
    versions: safe('Versions', notes, () => buildVersions(input)),
    adobeFootprint: safe('Adobe footprint', notes, () => buildAdobeFootprint(input)),
    quality: safe('Quality', notes, () => buildQuality(input)),
  };
  const privacy = safe('Privacy', notes, () => buildPrivacy(input, blocks.versions?.tags ?? []));
  const insights: ObservePointInsights = {
    generatedAt: now.toISOString(),
    runCompletedAt: input.run.completed ?? undefined,
    pages: input.run.totalUrl,
    consentAccepted: input.info?.privacyConsentActions,
    ...blocks,
    privacy,
    findings: [],
    notes,
  };
  insights.findings = deriveFindings(insights);
  return insights;
}

function safe<T>(label: string, notes: string[], fn: () => T | null): T | null {
  try {
    return fn();
  } catch (err) {
    notes.push(`${label}: could not be evaluated (${err instanceof Error ? err.message.slice(0, 80) : 'error'}).`);
    return null;
  }
}

/** Rohdaten eines Runs holen – jeder Call einzeln fehlertolerant, Fehler landen als Hinweis in notes. */
export async function fetchRunInsights(auditId: number, run: OpRun, runTags: OpRunTag[]): Promise<ObservePointInsights> {
  const notes: string[] = [];
  const attempt = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'request failed';
      notes.push(`${label} unavailable: ${msg}`);
      return undefined;
    }
  };
  const a = auditId;
  const r = run.id;
  const [info, pageSummary, pages, grid, health, dupes, logSummary, logs, cookieSummary, cookies, requests, library] = await Promise.all([
    attempt('Run info', () => getRunInfo(a, r)),
    attempt('Page summary', () => getPageSummary(a, r)),
    attempt('Page list', () => getPageSummaryPages(a, r)),
    attempt('Tag versions (grid)', () => getRunTagVersionsGrid(a, r)),
    attempt('Tag health', () => getTagHealthTags(a, r)),
    attempt('Tag duplicates', () => getTagDuplicateTags(a, r)),
    attempt('Browser log summary', () => getBrowserLogSummary(a, r)),
    attempt('Browser log messages', () => getBrowserLogMessages(a, r)),
    attempt('Cookie summary', () => getCookieSummary(a, r)),
    attempt('Cookies', () => getCookies(a, r)),
    attempt('Request geolocation', () => getRequestCompliance(a, r)),
    attempt('Tag library', () => getTagLibrary()),
  ]);
  const page = pages?.pages?.[0];
  const pageTags = page ? await attempt('Page tags', () => getPageTags(a, r, page.pageId)) : undefined;
  if (!page && pages) notes.push('Page tags unavailable: run has no pages.');
  return buildInsights(
    {
      run,
      runTags,
      info,
      pageSummary,
      pageTags,
      sampledPage: page?.finalPageUrl ?? page?.pageUrl,
      grid,
      tagHealthTags: health?.tags,
      duplicateTags: dupes?.tags,
      logSummary,
      logMessages: logs?.messages,
      cookieSummary,
      cookies: cookies?.cookies,
      requests: requests?.requests,
      libraryTags: library,
    },
    notes,
  );
}

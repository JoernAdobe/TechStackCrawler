/**
 * Baut einen PDF-Report aus den JSON-Ergebnissen von batch-analyze.ts.
 *
 *   npx tsx scripts/build-report.ts <inDir> <out.pdf> [logo.png]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

interface Det { name: string; categories: string[]; confidence: number; version?: string; weak?: boolean; evidence?: string[] }
interface Cat { category: string; currentTechnology: string; challengesAndPainPoints: string; adobeOpportunity: string }
interface UseCase { rank: number; title: string; description: string; adobeProducts: string[]; businessValue: string; quantifiedRoi?: string; effort?: string; impact?: string; timeToValue?: string }
interface Entry {
  account: string; url: string; analyzeSecs: number; error: string | null;
  analysis: { url: string; finalUrl?: string; analyzedAt: string; summary: string; categories: Cat[]; rawDetections: Det[]; pageContentExcerpt?: string } | null;
  useCases: { summary: string; useCases: UseCase[] } | null; useCaseError: string | null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const isAdobe = (n: string) => /adobe|\baem\b|marketo|magento|workfront|\bajo\b|\bcja\b|edge delivery/i.test(n);
const PRE = /^⚠/;
const BLOCKED = /performing security verification|verify you are (not a bot|human)|just a moment\.\.\.|attention required|access denied|enable javascript and cookies to continue|captcha/i;
const isBlocked = (e: Entry) => Boolean(e.analysis && BLOCKED.test(e.analysis.pageContentExcerpt ?? '') && e.analysis.rawDetections.length <= 3);

const MATRIX: Array<[string, RegExp]> = [
  ['CMS', /^(cms|content management)/i],
  ['Analytics', /^analytics$/i],
  ['Tag Mgmt', /tag manag/i],
  ['Personalization', /personali|optimi|a\/b|cro/i],
  ['CDP / DMP', /^(cdp|dmp|customer data)/i],
  ['Consent', /consent|privacy/i],
  ['Commerce', /commerce|e-?commerce|shop/i],
  ['CDN', /^cdn/i],
];

function topIn(dets: Det[], re: RegExp): Det[] {
  return dets.filter((d) => !d.weak && d.categories.some((c) => re.test(c))).sort((a, b) => b.confidence - a.confidence);
}

function cell(dets: Det[]): string {
  if (!dets.length) return '<span class="none">–</span>';
  return dets.slice(0, 2).map((d) => `<span class="${isAdobe(d.name) ? 'adobe' : ''}">${esc(d.name)}</span>`).join('<br>')
    + (dets.length > 2 ? `<span class="more"> +${dets.length - 2}</span>` : '');
}

function accountPage(e: Entry): string {
  if (!e.analysis) {
    return `<section class="page"><h2>${esc(e.account)}</h2><p class="url">${esc(e.url)}</p>
      <div class="callout warn"><b>Analysis not available.</b> ${esc(e.error)}</div></section>`;
  }
  const a = e.analysis;
  if (isBlocked(e)) {
    return `<section class="page"><div class="acc-head"><h2>${esc(e.account)}</h2><div class="url">${esc(a.finalUrl ?? a.url)} · analyzed ${esc(a.analyzedAt.slice(0, 10))}</div></div>
      <div class="callout warn"><b>Limited visibility — site blocked automated analysis.</b> The site served a bot-protection challenge (${esc(a.rawDetections.map((d) => d.name).join(', ') || 'unknown')}) instead of its content in two attempts. The absence of detected technologies does <b>not</b> mean the account has no marketing stack. AI recommendations were suppressed because they would rest on missing data.</div>
      <h3>Recommended next step</h3><p>Validate the stack manually (browser DevTools on the live site, or ask the account team), then re-run the analysis from an allow-listed network.</p></section>`;
  }
  const dets = [...a.rawDetections].sort((x, y) => (x.categories[0] ?? '').localeCompare(y.categories[0] ?? '') || y.confidence - x.confidence);
  const adobe = dets.filter((d) => isAdobe(d.name) && !d.weak);
  const pre = dets.filter((d) => d.evidence?.some((v) => PRE.test(v)));
  const rows = dets.map((d) => {
    const ev = (d.evidence ?? []).filter((v) => !PRE.test(v)).slice(0, 3);
    return `<tr class="${d.weak ? 'weak' : ''}">
      <td>${esc(d.categories.join(', '))}</td>
      <td class="${isAdobe(d.name) ? 'adobe' : ''}"><b>${esc(d.name)}</b>${d.version ? ` <span class="ver">${esc(d.version)}</span>` : ''}${d.evidence?.some((v) => PRE.test(v)) ? ' <span class="flag">pre-consent</span>' : ''}</td>
      <td class="num">${d.confidence}%${d.weak ? '<br><span class="muted">unverified</span>' : ''}</td>
      <td class="ev">${ev.map(esc).join('<br>')}</td></tr>`;
  }).join('');
  const opps = a.categories.filter((c) => c.adobeOpportunity).map((c) => `
      <div class="opp"><div class="opp-h">${esc(c.category)}</div>
      <div><span class="lbl">Today:</span> ${esc(c.currentTechnology)}</div>
      <div><span class="lbl">Adobe opportunity:</span> ${esc(c.adobeOpportunity)}</div></div>`).join('');
  const ucs = e.useCases?.useCases?.slice(0, 5).map((u) => `
      <div class="uc"><div class="uc-h"><span class="rank">${u.rank}</span> ${esc(u.title)}</div>
      <div class="uc-p">${u.adobeProducts.map((p) => `<span class="chip">${esc(p)}</span>`).join(' ')}</div>
      <div>${esc(u.description)}</div>
      <div class="uc-m">${u.quantifiedRoi ? `<b>ROI:</b> ${esc(u.quantifiedRoi)} · ` : ''}${u.impact ? `<b>Impact:</b> ${esc(u.impact)} · ` : ''}${u.effort ? `<b>Effort:</b> ${esc(u.effort)} · ` : ''}${u.timeToValue ? `<b>Time to value:</b> ${esc(u.timeToValue)}` : ''}</div></div>`).join('') ?? '';

  return `<section class="page">
    <div class="acc-head"><h2>${esc(e.account)}</h2><div class="url">${esc(a.finalUrl ?? a.url)} · analyzed ${esc(a.analyzedAt.slice(0, 10))}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="k">${dets.filter((d) => !d.weak).length}</div><div class="l">verified technologies</div></div>
      <div class="kpi"><div class="k">${adobe.length}</div><div class="l">Adobe solutions</div></div>
      <div class="kpi"><div class="k">${dets.filter((d) => d.evidence?.length).length}</div><div class="l">with hard evidence</div></div>
      <div class="kpi ${pre.length ? 'alert' : ''}"><div class="k">${pre.length}</div><div class="l">tags firing before consent</div></div>
    </div>
    <h3>Executive summary</h3><p>${esc(a.summary)}</p>
    ${pre.length ? `<div class="callout warn"><b>Privacy finding:</b> ${pre.map((d) => esc(d.name)).join(', ')} fired before the consent banner was accepted — a GDPR/ePrivacy and CCPA exposure and a natural entry point for consent-aware data collection (Adobe Experience Platform consent enforcement).</div>` : ''}
    <h3>Detected technology stack</h3>
    <table class="stack"><thead><tr><th>Category</th><th>Technology</th><th>Conf.</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>
    ${opps ? `<h3>Adobe opportunities by category</h3><div class="opps">${opps}</div>` : ''}
    ${ucs ? `<h3>AI use case discovery</h3>${e.useCases?.summary ? `<p>${esc(e.useCases.summary)}</p>` : ''}<div class="ucs">${ucs}</div>` : e.useCaseError ? `<p class="muted">Use case discovery unavailable: ${esc(e.useCaseError)}</p>` : ''}
  </section>`;
}

async function main() {
  const [inDir, outPdf, logoPath] = process.argv.slice(2);
  if (!inDir || !outPdf) throw new Error('Usage: build-report.ts <inDir> <out.pdf> [logo.png]');
  const entries: Entry[] = readdirSync(inDir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(inDir, f), 'utf8')) as Entry);
  const order = process.env.ORDER_FILE && existsSync(process.env.ORDER_FILE)
    ? readFileSync(process.env.ORDER_FILE, 'utf8').split('\n').map((l) => l.split('\t')[0].trim()).filter(Boolean) : [];
  entries.sort((a, b) => (order.indexOf(a.account) + 1 || 999) - (order.indexOf(b.account) + 1 || 999));

  const logo = logoPath && existsSync(logoPath) ? `data:image/png;base64,${readFileSync(logoPath).toString('base64')}` : '';
  const ok = entries.filter((e) => e.analysis && !isBlocked(e));
  const allDets = ok.flatMap((e) => e.analysis!.rawDetections.filter((d) => !d.weak));
  const adobeAccounts = ok.filter((e) => e.analysis!.rawDetections.some((d) => isAdobe(d.name) && !d.weak)).length;
  const preAccounts = ok.filter((e) => e.analysis!.rawDetections.some((d) => d.evidence?.some((v) => PRE.test(v)))).length;
  const date = new Date().toISOString().slice(0, 10);

  const matrix = entries.map((e) => {
    const dets = e.analysis?.rawDetections ?? [];
    const adobe = [...new Set(dets.filter((d) => isAdobe(d.name) && !d.weak).map((d) => d.name))];
    if (isBlocked(e)) return `<tr><td><b>${esc(e.account)}</b></td><td colspan="${MATRIX.length}" class="muted">blocked by bot protection — stack not visible</td><td class="num">–</td></tr>`;
    return `<tr><td><b>${esc(e.account)}</b></td>${e.analysis ? MATRIX.map(([, re]) => `<td>${cell(topIn(dets, re))}</td>`).join('') : `<td colspan="${MATRIX.length}" class="muted">not analyzed – ${esc((e.error ?? '').slice(0, 80))}</td>`}
      <td class="num">${adobe.length}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 14mm 14mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Adobe Clean', 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; color: #222; margin: 0; }
  .page { page-break-before: always; }
  .cover { height: 175mm; display: flex; flex-direction: column; justify-content: space-between; border-left: 6px solid #EB1000; padding: 4mm 0 0 10mm; }
  .cover img { width: 18mm; }
  .cover h1 { font-size: 34pt; font-weight: 800; margin: 0 0 4mm; line-height: 1.05; }
  .cover .sub { font-size: 14pt; color: #555; }
  .cover .meta { font-size: 10pt; color: #666; }
  h2 { font-size: 20pt; font-weight: 800; margin: 0; }
  h3 { font-size: 11.5pt; margin: 5mm 0 2mm; border-bottom: 1.5px solid #EB1000; padding-bottom: 1mm; }
  p { line-height: 1.4; margin: 0 0 2mm; }
  .acc-head { border-left: 4px solid #EB1000; padding-left: 4mm; margin-bottom: 3mm; }
  .url { color: #666; font-size: 9pt; margin-top: 1mm; }
  .kpis { display: flex; gap: 3mm; margin: 3mm 0; }
  .kpi { flex: 1; border: 1px solid #ddd; border-radius: 2mm; padding: 2.5mm 3mm; }
  .kpi .k { font-size: 20pt; font-weight: 800; }
  .kpi .l { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: .03em; }
  .kpi.alert { border-color: #EB1000; } .kpi.alert .k { color: #EB1000; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #000; color: #fff; text-align: left; font-size: 8pt; padding: 1.6mm 2mm; text-transform: uppercase; letter-spacing: .03em; }
  td { border-bottom: 1px solid #e6e6e6; padding: 1.4mm 2mm; vertical-align: top; font-size: 8.5pt; }
  tr { page-break-inside: avoid; }
  .matrix td { font-size: 8pt; }
  .num { text-align: right; white-space: nowrap; }
  .adobe { color: #EB1000; font-weight: 700; }
  .none, .muted { color: #999; }
  .more { color: #888; font-size: 7.5pt; }
  .ver { color: #666; font-weight: 400; font-size: 8pt; }
  .ev { font-family: 'Source Code Pro', Menlo, monospace; font-size: 7.2pt; color: #444; word-break: break-all; }
  tr.weak td { color: #999; }
  .flag { background: #EB1000; color: #fff; font-size: 7pt; padding: .3mm 1.2mm; border-radius: 1mm; font-weight: 700; }
  .callout { border-left: 4px solid #000; background: #f5f5f5; padding: 2.5mm 3.5mm; margin: 2.5mm 0; line-height: 1.4; }
  .callout.warn { border-color: #EB1000; background: #fff1f0; }
  .opps { columns: 2; column-gap: 6mm; }
  .opp { break-inside: avoid; margin-bottom: 2.5mm; line-height: 1.35; }
  .opp-h { font-weight: 800; }
  .lbl { color: #666; font-weight: 700; }
  .ucs { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .uc { border: 1px solid #ddd; border-top: 3px solid #EB1000; padding: 2.5mm 3mm; break-inside: avoid; line-height: 1.35; }
  .uc-h { font-weight: 800; font-size: 10pt; margin-bottom: 1mm; }
  .rank { display: inline-block; background: #000; color: #fff; width: 5mm; text-align: center; border-radius: 1mm; }
  .uc-p { margin: 1mm 0; }
  .chip { display: inline-block; border: 1px solid #EB1000; color: #EB1000; font-size: 7.2pt; padding: .2mm 1.5mm; border-radius: 3mm; margin: .3mm 0; }
  .uc-m { margin-top: 1.2mm; font-size: 8pt; color: #444; }
  ul { margin: 0; padding-left: 5mm; line-height: 1.45; }
  </style></head><body>
  <section class="cover">
    <div>${logo ? `<img src="${logo}">` : ''}</div>
    <div><h1>Tech Stack Intelligence<br>Account Report</h1>
      <div class="sub">${entries.length} target accounts · deterministic detection + AI opportunity analysis</div></div>
    <div class="meta">Generated ${date} with Adobe TechStack Analyzer · techstack.corp.adobe.com<br>Adobe internal — for account planning purposes</div>
  </section>

  <section class="page">
    <div class="acc-head"><h2>Portfolio overview</h2><div class="url">Key technologies per account (verified detections only; Adobe solutions in red)</div></div>
    <div class="kpis">
      <div class="kpi"><div class="k">${ok.length}/${entries.length}</div><div class="l">accounts analyzed</div></div>
      <div class="kpi"><div class="k">${ok.length ? Math.round(allDets.length / ok.length) : 0}</div><div class="l">avg. technologies / site</div></div>
      <div class="kpi"><div class="k">${adobeAccounts}</div><div class="l">accounts with Adobe footprint</div></div>
      <div class="kpi ${preAccounts ? 'alert' : ''}"><div class="k">${preAccounts}</div><div class="l">accounts with pre-consent tags</div></div>
    </div>
    <table class="matrix"><thead><tr><th>Account</th>${MATRIX.map(([h]) => `<th>${h}</th>`).join('')}<th>Adobe</th></tr></thead><tbody>${matrix}</tbody></table>
  </section>

  ${entries.map(accountPage).join('\n')}

  <section class="page">
    <div class="acc-head"><h2>Methodology</h2></div>
    <ul>
      <li><b>Crawling:</b> real browser session (Scrapling) on the homepage plus up to five representative subpages (product, cart, login, category, search …); cookie banner accepted automatically.</li>
      <li><b>Deterministic detection:</b> ~600 rules across HTML, scripts, cookies, HTTP headers, network requests (beacons) and runtime JavaScript globals, plus DNS/CNAME analysis of first-party hosts.</li>
      <li><b>Evidence:</b> concrete identifiers extracted from live traffic — e.g. Adobe Analytics report suites and tracking servers, IMS Org, Web SDK datastream, Launch property, Target client code, GTM/GA4 IDs, Meta Pixel, versions.</li>
      <li><b>Consent audit:</b> network requests and cookies captured <i>before</i> the banner was accepted; consent-relevant tags firing at that point are flagged as “pre-consent”.</li>
      <li><b>AI analysis:</b> Claude summarises the stack, pain points and Adobe opportunities per category; “AI use case discovery” ranks Adobe use cases with ROI, effort and time-to-value. AI text is a hypothesis for discovery, not a verified fact.</li>
      <li><b>Limitations:</b> server-side and back-office systems are only visible where they leave client-side traces; bot protection, geo-redirects or login walls can hide parts of the stack. “Unverified” rows rest on a single generic signal.</li>
    </ul>
  </section>
  </body></html>`;

  writeFileSync(outPdf.replace(/\.pdf$/, '.html'), html);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPdf, format: 'A4', landscape: true, printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:7pt;color:#888;width:100%;padding:0 14mm 0 18mm;display:flex;justify-content:space-between;font-family:Arial"><span>Tech Stack Intelligence · Adobe internal</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
  console.log(`PDF: ${outPdf} (${entries.length} Accounts, ${ok.length} erfolgreich)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

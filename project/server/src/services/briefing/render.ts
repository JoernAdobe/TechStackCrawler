/**
 * Client Pre-Briefing – powered by Chris Whitehead.
 * Rendert ein BriefingResult in EINE self-contained HTML-Datei nach dem Standard aus
 * assets/briefing/design/components.md (Shell, Section-Bar, Komponenten, Sources-Block).
 * Sämtlicher Text stammt aus LLM-/Web-Quellen und wird deshalb konsequent escaped.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  BRIEFING_CREDIT,
  BRIEFING_SECTIONS,
  BRIEFING_SECTION_IDS,
  type BriefingBlock,
  type BriefingResult,
  type BriefingSection,
  type BriefingSectionId,
  type BriefingSource,
  type ExecutiveSummary,
} from '../../types/briefing.js';

/** Pfad relativ zu src/services/briefing bzw. dist/services/briefing → server/assets/briefing. */
export function briefingAssetsPath(...parts: string[]): string {
  return fileURLToPath(new URL(['../../../assets/briefing', ...parts].join('/'), import.meta.url));
}

let cssCache: string | null = null;
export function stylesCss(): string {
  cssCache ??= readFileSync(briefingAssetsPath('design', 'styles.css'), 'utf8');
  return cssCache;
}

const META = new Map(BRIEFING_SECTIONS.map((s) => [s.id, s]));

/** Kurzlabels der Hamburger-Navigation exakt wie in der Shell von components.md. */
const NAV_LABELS: Record<BriefingSectionId, string> = {
  s01: 'Company Overview',
  s02: 'Products & Services',
  s03: 'Financial Performance',
  s04: 'Digital Transformation',
  s05: 'Marketing Strategy',
  s06: 'Social Media & Content',
  s07: 'SEO & Search',
  s08: 'Brand & Website Portfolio',
  s09: 'Competitive Landscape',
  s10: 'Customer & Market Profile',
  s11: 'Regulatory & Compliance',
  s12: 'Stakeholder Mapping',
  s13: 'Strategic Direction',
  s14: 'Adobe Opportunity',
};

/** Laut standard-sections.md nummerierte Step-Titel. */
const NUMBERED_SECTIONS = new Set<BriefingSectionId>(['s04', 's13', 's14']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const P_STYLE = 'font-size:13px;color:#333;line-height:1.65;';
const TH_STYLE =
  'padding:8px 12px;text-align:left;border-bottom:2px solid var(--red);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;';
const TD_STYLE = 'padding:8px 12px;';
const CLOSE_NAV = "document.getElementById('navMenu').style.display='none'";

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Ctx {
  included: Set<BriefingSectionId>;
  generated: Date;
}

function sectionName(id: BriefingSectionId): string {
  return META.get(id)?.title ?? id;
}

function xref(id: BriefingSectionId, ctx: Ctx): string {
  const name = escapeHtml(sectionName(id));
  return ctx.included.has(id) ? `<a class="xref" href="#${id}">${name}</a>` : name;
}

/** Escaped Text; Abschnitts-Codes („s04“) werden zu benannten xref-Links (Regel aus components.md). */
function text(value: unknown, ctx: Ctx): string {
  return escapeHtml(value).replace(/\bs(0[1-9]|1[0-4])\b/g, (code) => xref(code as BriefingSectionId, ctx));
}

function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function safeColor(color: string): string {
  const c = color.trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return c;
  if (/^[a-z]{3,20}$/i.test(c)) return c.toLowerCase();
  return '#6E6E6E';
}

function safeDomain(d: string): string | null {
  const host = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

function withPeriod(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

// ── Sources ─────────────────────────────────────────────────────────────────

function sourceAgeMonths(date: string, now: Date): number | null {
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})$/.exec(date.trim());
  if (!m) return null;
  return now.getUTCFullYear() * 12 + now.getUTCMonth() + 1 - (Number(m[2]) * 12 + MONTHS.indexOf(m[1]) + 1);
}

/** Validator erlaubt 2–5 Einträge und verlangt mindestens eine unabhängige Quelle. */
function pickSources(sources: BriefingSource[]): BriefingSource[] {
  const picked = sources.slice(0, 5);
  if (picked.length === 5 && !picked.some((s) => s.independent)) {
    const independent = sources.slice(5).find((s) => s.independent);
    if (independent) picked[4] = independent;
  }
  return picked;
}

function renderSource(s: BriefingSource, ctx: Ctx): string {
  const rawDate = s.date?.trim();
  const date =
    rawDate && rawDate !== 'n.d.'
      ? rawDate
      : `accessed ${MONTHS[ctx.generated.getUTCMonth()]} ${ctx.generated.getUTCFullYear()}`;
  const age = sourceAgeMonths(date, ctx.generated);
  const archival = age !== null && age > 24 && !/archival/i.test(date) ? ' (archival)' : '';
  const label = [
    escapeHtml(s.title),
    s.publisher ? ` — ${escapeHtml(s.publisher)}` : '',
    s.snippetOnly ? ', snippet only' : '',
    ` (${escapeHtml(date)})${archival}`,
  ].join('');
  const href = safeUrl(s.url);
  return href
    ? `      <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>`
    : `      <span class="no-link">${label}</span>`;
}

function renderSources(sources: BriefingSource[], ctx: Ctx): string {
  return [
    '    <div class="sources">',
    '      <span class="sources-label">Sources</span>',
    ...pickSources(sources).map((s) => renderSource(s, ctx)),
    '    </div>',
  ].join('\n');
}

// ── Blocks ──────────────────────────────────────────────────────────────────

type Card = { label: string; value: string; detail?: string };

function renderCard(c: Card, ctx: Ctx): string {
  return [
    '      <div class="feature-card">',
    `        <span class="tag-label">${text(c.label, ctx)}</span>`,
    `        <h4>${text(c.value, ctx)}</h4>`,
    ...(c.detail ? [`        <p>${text(c.detail, ctx)}</p>`] : []),
    '      </div>',
  ].join('\n');
}

function renderStep(title: string, body: string | undefined, ctx: Ctx): string {
  return [
    '    <div class="step">',
    '      <div class="step-body">',
    `        <strong>${text(title, ctx)}</strong>`,
    ...(body ? [`        <p>${text(body, ctx)}</p>`] : []),
    '      </div>',
    '    </div>',
  ].join('\n');
}

/** feature-grid nur mit 2 oder 4 Karten (Validator); ein ungerader Rest wird als Step gerendert. */
function renderFeatureGrid(cards: Card[], ctx: Ctx): string {
  const out: string[] = [];
  const even = cards.length - (cards.length % 2);
  for (let i = 0; i < even; ) {
    const size = even - i >= 4 ? 4 : 2;
    out.push(['    <div class="feature-grid">', ...cards.slice(i, i + size).map((c) => renderCard(c, ctx)), '    </div>'].join('\n'));
    i += size;
  }
  if (cards.length % 2) {
    const last = cards[cards.length - 1];
    out.push(renderStep(`${last.label}: ${last.value}`, last.detail, ctx));
  }
  return out.join('\n');
}

function renderTable(headers: string[], rows: string[][], ctx: Ctx): string {
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array<string>(Math.max(0, width - r.length)).fill('')];
  return [
    '    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">',
    '      <thead>',
    '        <tr style="background:var(--gray-light);">',
    ...pad(headers).map((h) => `          <th style="${TH_STYLE}">${text(h, ctx)}</th>`),
    '        </tr>',
    '      </thead>',
    '      <tbody>',
    ...rows.map((r) =>
      [
        '        <tr style="border-bottom:1px solid var(--gray-mid);">',
        ...pad(r).map((c) => `          <td style="${TD_STYLE}">${text(c, ctx)}</td>`),
        '        </tr>',
      ].join('\n'),
    ),
    '      </tbody>',
    '    </table>',
  ].join('\n');
}

function renderNote(title: string | undefined, body: string, ctx: Ctx): string {
  const label = title?.trim() ? `<strong>${text(title.trim().replace(/:$/, ''), ctx)}:</strong> ` : '';
  return `    <div class="note">${label}${text(body, ctx)}</div>`;
}

function renderBlock(block: BriefingBlock, sectionId: BriefingSectionId, ctx: Ctx, stepNo: { n: number }): string {
  switch (block.type) {
    case 'paragraph':
      return `    <p style="${P_STYLE}">${text(block.text, ctx)}</p>`;
    case 'feature-grid':
      return block.cards.length ? renderFeatureGrid(block.cards, ctx) : '';
    case 'steps':
      return block.items
        .map((item) => {
          stepNo.n += 1;
          const numbered = NUMBERED_SECTIONS.has(sectionId) && !/^\d+\./.test(item.title.trim());
          return renderStep(numbered ? `${stepNo.n}. ${item.title.trim()}` : item.title, item.body, ctx);
        })
        .join('\n');
    case 'note':
      return renderNote(block.title, block.text, ctx);
    case 'legend':
      return [
        '    <div class="color-legend">',
        ...block.items.map(
          (i) =>
            `      <div class="color-item"><div class="color-box" style="background:${escapeHtml(safeColor(i.color))};"></div><strong>${text(i.label, ctx)}:</strong>&nbsp; ${text(i.text, ctx)}</div>`,
        ),
        '    </div>',
      ].join('\n');
    case 'table':
      return renderTable(block.headers, block.rows, ctx);
    default:
      return '';
  }
}

const FALLBACK_PARAGRAPH: Record<BriefingSection['status'], string> = {
  done: '',
  thin: 'Only limited public information was available for this section.',
  skipped: 'This section could not be researched in this run.',
  error: 'Research for this section failed in this run.',
};

function renderSection(section: BriefingSection, ctx: Ctx, isLast: boolean): string {
  const meta = META.get(section.id);
  const title = section.title?.trim() || meta?.title || section.id;
  const eyebrow = section.eyebrow?.trim() || meta?.eyebrow || '';
  const stepNo = { n: 0 };
  const body = section.blocks.map((b) => renderBlock(b, section.id, ctx, stepNo)).filter(Boolean);
  if (!section.blocks.some((b) => b.type === 'paragraph')) {
    body.unshift(`    <p style="${P_STYLE}">${escapeHtml(FALLBACK_PARAGRAPH[section.status] || 'Summary not available.')}</p>`);
  }
  const gaps = section.gaps.filter((g) => g.trim());
  if (gaps.length) body.push(renderNote('Research gaps', gaps.join(' · '), ctx));
  else if (section.status !== 'done' && section.status !== 'thin') body.push(renderNote('Research gaps', 'Not publicly available.', ctx));

  return [
    `  <!-- Section: ${sectionName(section.id)} -->`,
    `  <div class="section" id="${section.id}">`,
    '    <div class="section-bar">',
    `      <span class="s-label">${escapeHtml(eyebrow)}</span>`,
    `      <h2>${escapeHtml(withPeriod(title))}</h2>`,
    '    </div>',
    ...body,
    renderSources(section.sources, ctx),
    '  </div>',
    ...(isLast ? [] : ['  <hr>']),
  ].join('\n');
}

// ── Executive Summary (Ergänzung des Pre-Briefings, steht vor s01) ─────────

const BAND_LABEL = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' } as const;
const CONFIDENCE_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

function sourceNote(s: BriefingSource | undefined): string {
  if (!s) return '';
  const label = `${escapeHtml(s.title)}${s.publisher ? ` — ${escapeHtml(s.publisher)}` : ''} (${escapeHtml(s.date || 'n.d.')})`;
  const href = safeUrl(s.url);
  return href
    ? ` Source: <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>.`
    : ` Source: ${label}.`;
}

function refs(ids: BriefingSectionId[], ctx: Ctx): string {
  const linked = ids.filter((id) => ctx.included.has(id));
  return linked.length ? ` See ${linked.map((id) => xref(id, ctx)).join(', ')}.` : '';
}

export function renderExecutiveSummary(exec: ExecutiveSummary, ctx: Ctx): string {
  const score = exec.overallScore;
  const assessed = exec.subScores.filter((s) => s.value !== null).length;
  const scoreHtml =
    score === null
      ? '<h4 style="font-size:34px;line-height:1.1;color:var(--gray-text);">n/a</h4>'
      : `<h4 style="font-size:34px;line-height:1.1;color:var(--red);">${Math.round(score)}<span style="font-size:14px;color:var(--gray-text);"> / 100</span></h4>`;
  const bullets = exec.bullets.map((b) =>
    [
      '    <div class="step">',
      '      <div class="step-body">',
      `        <strong>${text(b.label, ctx)}</strong>`,
      `        <p>${text(b.text, ctx)}${b.sectionRef ? refs([b.sectionRef], ctx) : ''}${sourceNote(b.source)}</p>`,
      '      </div>',
      '    </div>',
    ].join('\n'),
  );
  const subRows = exec.subScores.map((s) =>
    [
      '        <tr style="border-bottom:1px solid var(--gray-mid);">',
      `          <td style="${TD_STYLE}"><b>${text(s.label, ctx)}</b></td>`,
      `          <td style="${TD_STYLE}">${Math.round(s.weight * 100)}%</td>`,
      `          <td style="${TD_STYLE}">${s.kind === 'measured' ? 'Measured' : 'Rated'}</td>`,
      `          <td style="${TD_STYLE}">${s.value === null ? 'not assessed' : `${Math.round(s.value)} / 100${s.kind === 'rated' && s.rubricLevel ? ` (level ${s.rubricLevel}/5)` : ''}`}</td>`,
      `          <td style="${TD_STYLE}">${text(s.rationale, ctx)}${refs(s.sectionRefs, ctx)}</td>`,
      '        </tr>',
    ].join('\n'),
  );
  const plays = exec.topPlays.slice(0, 3).map((p, i) =>
    [
      '    <div class="step">',
      '      <div class="step-body">',
      `        <strong>${i + 1}. ${text(p.product, ctx)} — ${text(p.headline, ctx)}</strong>`,
      `        <p><b>Based on:</b> ${text(p.basedOn, ctx)}${refs([p.sectionRef], ctx)}</p>`,
      '      </div>',
      '    </div>',
    ].join('\n'),
  );
  return [
    '  <!-- Executive Summary (Client Pre-Briefing addition) -->',
    '  <div id="executive-summary" style="margin-bottom:52px;">',
    '    <div class="section-bar">',
    '      <span class="s-label">Client Pre-Briefing</span>',
    '      <h2>Executive Summary.</h2>',
    '    </div>',
    '    <div class="feature-grid">',
    '      <div class="feature-card">',
    '        <span class="tag-label">Overall Pre-Briefing Score</span>',
    `        ${scoreHtml}`,
    `        <p>${BAND_LABEL[exec.band] ?? ''} · Confidence: ${CONFIDENCE_LABEL[exec.confidence] ?? ''} · ${assessed} of ${exec.subScores.length} sub-scores assessed</p>`,
    '      </div>',
    '      <div class="feature-card">',
    '        <span class="tag-label">Verdict</span>',
    `        <h4>${text(exec.verdict, ctx)}</h4>`,
    '        <p>Sub-scores marked “not assessed” are excluded from the overall score.</p>',
    '      </div>',
    '    </div>',
    ...bullets,
    '    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">',
    '      <thead>',
    '        <tr style="background:var(--gray-light);">',
    ...['Sub-score', 'Weight', 'Type', 'Score', 'Rationale'].map((h) => `          <th style="${TH_STYLE}">${h}</th>`),
    '        </tr>',
    '      </thead>',
    '      <tbody>',
    ...subRows,
    '      </tbody>',
    '    </table>',
    ...(plays.length ? ['    <p style="font-size:13px;color:#333;line-height:1.65;margin-top:20px;"><b>Top Adobe plays</b></p>', ...plays] : []),
    '    <div class="note"><strong>Note:</strong> The score is a prioritisation aid, not a forecast. This briefing was researched and written by AI from public sources — review the sources before using it with the client.</div>',
    '  </div>',
  ].join('\n');
}

// ── Dokument ───────────────────────────────────────────────────────────────

export function renderBriefingHtml(result: BriefingResult): string {
  const byId = new Map(result.sections.map((s) => [s.id, s]));
  const sections = BRIEFING_SECTION_IDS.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const generated = new Date(result.generatedAt);
  const date = Number.isNaN(generated.getTime()) ? new Date() : generated;
  const ctx: Ctx = { included: new Set(sections.map((s) => s.id)), generated: date };
  const company = escapeHtml(result.companyName || result.domain || 'Client');
  const domains = [...new Set([result.domain, ...result.clientDomains].map((d) => safeDomain(d ?? '')).filter(Boolean))];
  const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = date.getUTCFullYear();

  return `<!DOCTYPE html>
<html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- client-domains: ${domains.join(', ')} -->
<title>${company} — Client Report</title>
<style>
${stylesCss()}
</style>
</head>
<body>

<header>
  <div class="eyebrow">Adobe &nbsp;|&nbsp; Client Intelligence</div>
  <h1>${company}</h1>
  <p class="sub">Account Overview &nbsp;|&nbsp; Updated: ${month} ${year}</p>
</header>

<div class="container">

  <div class="toc">
    <div class="toc-title">Contents</div>
    <ol>
${sections.map((s) => `      <li><a href="#${s.id}">${escapeHtml(sectionName(s.id))}</a></li>`).join('\n')}
    </ol>
  </div>

${renderExecutiveSummary(result.executive, ctx)}

${sections.map((s, i) => renderSection(s, ctx, i === sections.length - 1)).join('\n\n')}

  <footer>
    <p>© ${year} Adobe. Adobe Internal Only. &nbsp;|&nbsp; Prepared by Adobe Account Intelligence</p>
    <p>${escapeHtml(BRIEFING_CREDIT)}</p>
  </footer>

</div>

<div id="navMenu" style="display:none;">
  <div class="nh">Jump to section</div>
${sections.map((s) => `  <a href="#${s.id}" onclick="${CLOSE_NAV}">${escapeHtml(NAV_LABELS[s.id])}</a>`).join('\n')}
</div>
<button id="navBtn" type="button" aria-label="Jump to section" aria-controls="navMenu" onclick="var m=document.getElementById('navMenu');m.style.display=m.style.display==='block'?'none':'block';">☰</button>

<script>
document.addEventListener('click', function (e) {
  if (!e.target.closest('#navMenu, #navBtn')) document.getElementById('navMenu').style.display = 'none';
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.getElementById('navMenu').style.display = 'none';
});
</script>

</body>
</html>
`;
}

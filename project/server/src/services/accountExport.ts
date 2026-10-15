/**
 * Export der Account-Sicht: tabellarische Sektionen für CSV (an batchToCsv angehängt)
 * und ein Markdown-Bericht (GET /api/batches/:id/export.md).
 */
import type { BatchJob } from '../types/parity.js';
import type { AccountView } from '../types/batchAccount.js';
import type { BatchExportTable } from './batchExport.js';

export interface NamedTable extends BatchExportTable {
  name: string;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '' : `${Math.round(v)}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const list = (v: string[], max = 8) => v.slice(0, max).join(', ') + (v.length > max ? ` +${v.length - max}` : '');

/** Alle nicht-leeren Account-Tabellen (leere Quellen entfallen). */
export function accountTables(view: AccountView): NamedTable[] {
  const hosts = view.domains.map((d) => d.host);
  const tables: NamedTable[] = [
    {
      name: 'Account Domains',
      header: ['Domain', 'Label', 'Traffic score', 'Tranco rank', 'Visits (Semrush)', 'Technologies', 'Adobe', 'Mobile perf.', 'GEO score', 'OP agreement', 'Mobile apps'],
      rows: [...view.domains]
        .sort((a, b) => (b.trafficScore ?? -1) - (a.trafficScore ?? -1))
        .map((d) => [
          d.host,
          d.label ?? '',
          num(d.trafficScore),
          num(d.trancoRank),
          num(d.visits),
          String(d.techCount),
          String(d.adobeCount),
          num(d.mobilePerformance),
          num(d.geoScore),
          pct(d.opAgreement),
          num(d.mobileApps),
        ]),
    },
    {
      name: 'Top Account Opportunities',
      header: ['Priority', 'Building block', 'Adobe product', 'Gap', 'Competitors', 'Domains', 'Rationale'],
      rows: view.opportunities.map((o) => [String(o.score), o.buildingBlock, o.adobeProduct, o.gap, list(o.competitors), list(o.domains), o.rationale]),
    },
    {
      name: 'Adobe Footprint vs. Competition',
      header: ['Building block', 'Status', 'Adobe', 'Domains with Adobe', 'Competitors', 'Domains with competitors'],
      rows: view.footprint
        .filter((f) => f.status !== 'none')
        .map((f) => [f.buildingBlock, f.status, list(f.adobe), String(f.adobeDomains), list(f.competitors), String(f.competitorDomains)]),
    },
    {
      name: 'Fragmentation',
      header: ['Building block', '# solutions', 'Solutions (domains)'],
      rows: view.fragmentation.map((f) => [
        f.buildingBlock,
        String(f.solutions.length),
        f.solutions.map((s) => `${s.name} (${s.domains})`).join(', '),
      ]),
    },
    {
      name: 'Tech Matrix',
      header: ['Technology', 'Building block', 'Adobe', 'Domains', ...hosts],
      rows: view.techMatrix.map((t) => [
        t.technology,
        t.buildingBlock ?? '',
        t.isAdobe ? 'yes' : '',
        String(t.count),
        ...t.presence.map((p) => (p ? 'x' : '')),
      ]),
    },
    {
      name: 'Performance (Lighthouse)',
      header: ['Domain', 'Mobile', 'Desktop', 'LCP (ms)', 'CLS', 'Field data'],
      rows: view.performanceRanking.map((p) => [p.host, num(p.mobile), num(p.desktop), num(p.lcpMs), num(p.cls), p.fieldCategory ?? '']),
    },
    {
      name: 'GEO Score',
      header: ['Domain', 'Brand', 'GEO score', 'AI visibility', 'Market position'],
      rows: view.geoRanking.map((g) => [g.host, g.brand, String(g.geoScore), String(g.aiVisibility), g.marketPosition]),
    },
    {
      name: 'ObservePoint Agreement',
      header: ['Domain', 'Status', 'Agreement', 'Confirmed', 'TechStack only', 'ObservePoint only', 'Pages', 'Conflicts'],
      rows: view.observepoint.map((o) => [
        o.host,
        o.status,
        pct(o.agreementRate),
        String(o.confirmed),
        String(o.techstackOnly),
        String(o.observepointOnly),
        num(o.pagesScanned),
        o.conflicts.join(', '),
      ]),
    },
    {
      name: 'Privacy & Technical Findings',
      header: ['Severity', 'Kind', 'Source', 'Finding', 'Domains', 'Detail'],
      rows: view.findings.map((f) => [f.severity, f.kind, f.source, f.title, list(f.domains), f.detail ?? '']),
    },
    {
      name: 'Account Use Cases',
      header: ['Priority', 'Use case', 'Adobe products', 'Domains'],
      rows: view.useCases.map((u) => [String(u.score), u.title, list(u.adobeProducts), list(u.domains)]),
    },
  ];
  return tables.filter((t) => t.rows.length > 0);
}

function mdCell(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function mdTable(t: BatchExportTable, maxCols?: number): string {
  const cut = (r: string[]) => (maxCols ? r.slice(0, maxCols) : r);
  const header = cut(t.header);
  return [
    `| ${header.map(mdCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...t.rows.map((r) => `| ${cut(r).map(mdCell).join(' | ')} |`),
  ].join('\n');
}

/** Markdown-Bericht für Account-/Bulk-Assessments (Account-Sicht + Key Findings). */
export function batchToMarkdown(batch: BatchJob): string {
  const view = batch.accountView;
  const lines: string[] = [`# ${batch.title}`, ''];
  const meta = [
    batch.accountName && `**Account:** ${batch.accountName}`,
    batch.industry && `**Industry:** ${batch.industry}`,
    batch.lens && `**Lens:** ${batch.lens}`,
    `**Domains:** ${batch.done}/${batch.total} analysed${batch.failed ? `, ${batch.failed} failed` : ''}`,
    `**Status:** ${batch.status}`,
  ].filter(Boolean);
  lines.push(meta.join(' · '), '');
  if (!view) {
    lines.push('_No finished items yet._', '');
    return lines.join('\n');
  }
  const covered = Object.entries(view.coverage)
    .filter(([k, v]) => k !== 'detections' && (v ?? 0) > 0)
    .map(([k, v]) => `${k} ${v}/${view.domains.length}`);
  if (covered.length) lines.push(`**Data sources:** detections ${view.domains.length}, ${covered.join(', ')}`, '');

  for (const t of accountTables(view)) {
    lines.push(`## ${t.name}`, '');
    // Die Tech-Matrix kann sehr breit werden – im Markdown max. 12 Domains.
    lines.push(mdTable(t, t.name === 'Tech Matrix' ? 4 + 12 : undefined), '');
  }
  if (batch.matrix?.keyFindings.length) {
    lines.push('## Key Findings', '');
    for (const k of batch.matrix.keyFindings) lines.push(`- **${k.buildingBlock}:** ${k.findings.join(' ')}`);
    lines.push('');
  }
  if (view.sourceIssues.length) {
    lines.push('## Source notes', '');
    for (const s of view.sourceIssues) {
      lines.push(`- **${s.source}:** ${s.errors} error(s), ${s.skipped} skipped${s.sample ? ` – e.g. "${s.sample}"` : ''}`);
    }
    lines.push('');
  }
  lines.push(`_Generated ${view.generatedAt} by TechStack Analyzer._`, '');
  return lines.join('\n');
}

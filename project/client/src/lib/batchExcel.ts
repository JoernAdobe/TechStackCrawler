/**
 * XLSX-Export eines Account-/Bulk-Assessments (clientseitig, Paket `xlsx`):
 * Solution Mapping, Key Findings, URLs und – falls vorhanden – die Account-Sicht.
 */
import * as XLSX from 'xlsx';
import type { BatchJob } from '../types/parity';
import type { AccountView } from '../types/batchAccount';

type Row = Record<string, string | number>;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '' : Math.round(v));
const val = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);

/** Account-Sheets (nur solche mit Daten); Sheet-Namen ≤ 31 Zeichen. */
export function accountSheets(view: AccountView): Array<[string, Row[]]> {
  const hosts = view.domains.map((d) => d.label || d.host);
  const sheets: Array<[string, Row[]]> = [
    [
      'Account Domains',
      [...view.domains]
        .sort((a, b) => (b.trafficScore ?? -1) - (a.trafficScore ?? -1))
        .map((d) => ({
          Domain: d.host,
          Label: d.label ?? '',
          'Traffic score': val(d.trafficScore),
          'Tranco rank': val(d.trancoRank),
          'Visits (Semrush)': val(d.visits),
          Technologies: d.techCount,
          Adobe: d.adobeCount,
          'Mobile perf.': val(d.mobilePerformance),
          'GEO score': val(d.geoScore),
          'OP agreement %': pct(d.opAgreement),
          'Mobile apps': val(d.mobileApps),
        })),
    ],
    [
      'Opportunities',
      view.opportunities.map((o) => ({
        Priority: o.score,
        'Building block': o.buildingBlock,
        'Adobe product': o.adobeProduct,
        Gap: o.gap,
        Competitors: o.competitors.join(', '),
        Domains: o.domains.join(', '),
        Rationale: o.rationale,
      })),
    ],
    [
      'Adobe Footprint',
      view.footprint
        .filter((f) => f.status !== 'none')
        .map((f) => ({
          'Building block': f.buildingBlock,
          Status: f.status,
          Adobe: f.adobe.join(', '),
          'Domains with Adobe': f.adobeDomains,
          Competitors: f.competitors.join(', '),
          'Domains with competitors': f.competitorDomains,
        })),
    ],
    [
      'Fragmentation',
      view.fragmentation.map((f) => ({
        'Building block': f.buildingBlock,
        '# solutions': f.solutions.length,
        Solutions: f.solutions.map((s) => `${s.name} (${s.domains})`).join(', '),
      })),
    ],
    [
      'Tech Matrix',
      view.techMatrix.map((t) => {
        const row: Row = { Technology: t.technology, 'Building block': t.buildingBlock ?? '', Adobe: t.isAdobe ? 'yes' : '', Domains: t.count };
        t.presence.forEach((p, i) => {
          row[hosts[i]] = p ? 'x' : '';
        });
        return row;
      }),
    ],
    [
      'Performance',
      view.performanceRanking.map((p) => ({ Domain: p.host, Mobile: val(p.mobile), Desktop: val(p.desktop), 'LCP ms': val(p.lcpMs), CLS: val(p.cls) })),
    ],
    [
      'GEO Score',
      view.geoRanking.map((g) => ({ Domain: g.host, Brand: g.brand, 'GEO score': g.geoScore, 'AI visibility': g.aiVisibility, 'Market position': g.marketPosition })),
    ],
    [
      'ObservePoint',
      view.observepoint.map((o) => ({
        Domain: o.host,
        Status: o.status,
        'Agreement %': pct(o.agreementRate),
        Confirmed: o.confirmed,
        'TechStack only': o.techstackOnly,
        'ObservePoint only': o.observepointOnly,
        Pages: val(o.pagesScanned),
        Conflicts: o.conflicts.join(', '),
      })),
    ],
    [
      'Findings',
      view.findings.map((f) => ({ Severity: f.severity, Kind: f.kind, Source: f.source, Finding: f.title, Domains: f.domains.join(', '), Detail: f.detail ?? '' })),
    ],
    [
      'Use Cases',
      view.useCases.map((u) => ({ Priority: u.score, 'Use case': u.title, 'Adobe products': u.adobeProducts.join(', '), Domains: u.domains.join(', ') })),
    ],
  ];
  return sheets.filter(([, rows]) => rows.length > 0);
}

export function downloadBatchXlsx(batch: BatchJob): void {
  const wb = XLSX.utils.book_new();
  const matrix = batch.matrix;
  if (matrix) {
    const mapping = matrix.columns.map((col, i) => {
      const row: Record<string, string> = { URL: col.url, Label: col.label ?? '' };
      for (const r of matrix.rows) {
        row[r.buildingBlock] = r.cells[i].solutions.map((s) => (s.weak ? `${s.name} (unverified)` : s.name)).join(' | ');
      }
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapping), 'Solution Mapping');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        matrix.keyFindings.map((k) => ({
          'Building Block': k.buildingBlock,
          Code: k.code,
          Solutions: k.solutions.join(' | '),
          Findings: k.findings.join(' '),
        })),
      ),
      'Key Findings',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(matrix.otherTechnologies.map((t) => ({ Technology: t }))),
      'Other Technologies',
    );
  }
  if (batch.accountView) {
    for (const [name, rows] of accountSheets(batch.accountView)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (batch.items ?? []).map((it) => ({
        URL: it.url,
        Label: it.label ?? '',
        Status: it.status,
        'Analysis ID': it.analysisId ?? '',
        'Tranco rank': it.enrichments?.traffic?.trancoRank ?? '',
        'Mobile perf.': it.enrichments?.lighthouse?.mobilePerformance ?? '',
        'GEO score': it.enrichments?.geo?.geoScore ?? '',
        'Source errors': Object.values(it.enrichments?.errors ?? {}).join(' | '),
        Error: it.error ?? '',
      })),
    ),
    'URLs',
  );
  const base = (batch.accountName || batch.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  XLSX.writeFile(wb, `assessment-${base || batch.id}-${batch.id}.xlsx`);
}

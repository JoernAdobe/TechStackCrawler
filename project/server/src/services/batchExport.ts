/**
 * CSV-Export eines Batches (EAA "Solution Mapping" + "Key Findings").
 * XLSX wird clientseitig erzeugt (Paket `xlsx` ist nur im Client vorhanden).
 */
import { buildingBlocksFor } from '../data/buildingBlocks.js';
import type { BatchJob, SolutionMappingMatrix } from '../types/parity.js';
import { accountTables } from './accountExport.js';

const SOLUTION_SEPARATOR = ' | ';

export interface BatchExportTable {
  header: string[];
  rows: string[][];
}

/** Escaping inkl. Schutz vor CSV-/Formel-Injection (=, +, -, @ am Zellanfang). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function blockOrder(matrix?: SolutionMappingMatrix): string[] {
  return matrix ? matrix.rows.map((r) => r.buildingBlock) : [];
}

/** Eine Zeile pro URL, Spalten = Building Blocks, Zellen = Lösungen (" | "-getrennt), plus "Other". */
export function buildSolutionTable(batch: BatchJob): BatchExportTable {
  const blocks = blockOrder(batch.matrix);
  const header = ['URL', 'Label', 'Status', 'Analysis ID', ...blocks, 'Other', 'Error'];
  const rows: string[][] = [];

  for (const item of batch.items ?? []) {
    const perBlock = new Map<string, string[]>(blocks.map((b) => [b, []]));
    const other: string[] = [];
    for (const d of item.detections ?? []) {
      const name = d.weak ? `${d.name} (unverified)` : d.name;
      const mapped = buildingBlocksFor(d.name, d.categories);
      if (mapped.length === 0) {
        if (!other.includes(name)) other.push(name);
        continue;
      }
      for (const b of mapped) {
        const list = perBlock.get(b);
        if (list && !list.includes(name)) list.push(name);
      }
    }
    rows.push([
      item.url,
      item.label ?? '',
      item.status,
      item.analysisId ? String(item.analysisId) : '',
      ...blocks.map((b) => (perBlock.get(b) ?? []).join(SOLUTION_SEPARATOR)),
      other.sort().join(SOLUTION_SEPARATOR),
      item.error ?? '',
    ]);
  }
  return { header, rows };
}

export function buildKeyFindingsTable(matrix?: SolutionMappingMatrix): BatchExportTable {
  const header = ['Building Block', 'Code', 'Solutions', 'Findings'];
  const rows = (matrix?.keyFindings ?? []).map((k) => [
    k.buildingBlock,
    String(k.code),
    k.solutions.join(SOLUTION_SEPARATOR),
    k.findings.join(' '),
  ]);
  return { header, rows };
}

/** Vollständiger CSV-Export (UTF-8 mit BOM für Excel): Solution Mapping, danach Key Findings. */
export function batchToCsv(batch: BatchJob): string {
  const solution = buildSolutionTable(batch);
  const findings = buildKeyFindingsTable(batch.matrix);
  const parts: unknown[][] = [
    [`Assessment: ${batch.title}`],
    ...(batch.accountName ? [[`Account: ${batch.accountName}`]] : []),
    ...(batch.lens ? [[`Lens: ${batch.lens}`]] : []),
    [],
    solution.header,
    ...solution.rows,
    [],
    ['Key Findings (1 = consistent, 2 = multiple, -1 = inconsistent, -2 = different, 0 = none)'],
    findings.header,
    ...findings.rows,
  ];
  if (batch.matrix?.otherTechnologies.length) {
    parts.push([], ['Other Technologies'], ...batch.matrix.otherTechnologies.map((t) => [t]));
  }
  // Account-Sicht (nur Sektionen mit Daten).
  for (const t of batch.accountView ? accountTables(batch.accountView) : []) {
    parts.push([], [t.name], t.header, ...t.rows);
  }
  return '\uFEFF' + toCsv(parts) + '\r\n';
}

export function exportFilename(batch: BatchJob, ext: 'csv' | 'xlsx' | 'md'): string {
  const base = (batch.accountName || batch.title || `batch-${batch.id}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `assessment-${base || batch.id}-${batch.id}.${ext}`;
}

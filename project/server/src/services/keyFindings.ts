/**
 * Solution-Mapping-Matrix + Key Findings (EAA "generate_key_findings" / "create_solution_category_mapping").
 */
import type { DetectedTechnology } from '../types/analysis.js';
import type { ConsistencyCode, KeyFinding, SolutionMappingMatrix } from '../types/parity.js';
import { BUILDING_BLOCKS, buildingBlocksFor, insightsFor, isAdobeSolution } from '../data/buildingBlocks.js';

export interface MatrixColumnInput {
  url: string;
  label?: string;
  analysisId?: number;
  detections: Array<Pick<DetectedTechnology, 'name' | 'categories' | 'confidence' | 'weak'>>;
}

/** Konsistenz-Code nach EAA-Logik für eine Zeile (Lösungsmengen je Spalte). */
export function consistencyCode(columns: string[][]): ConsistencyCode {
  const filled = columns.filter((c) => c.length > 0);
  if (filled.length === 0) return 0;
  if (filled.some((c) => c.length > 1)) return 2;
  const distinct = new Set(filled.map((c) => c[0]));
  if (distinct.size > 1) return -2;
  return filled.length === columns.length ? 1 : -1;
}

export function buildSolutionMatrix(inputs: MatrixColumnInput[], opts: { includeEmptyBlocks?: boolean } = {}): SolutionMappingMatrix {
  const columns = inputs.map(({ url, label, analysisId }) => ({ url, label, analysisId }));
  const perBlock = new Map<string, Array<Map<string, { name: string; isAdobe: boolean; weak?: boolean }>>>();
  for (const b of BUILDING_BLOCKS) perBlock.set(b, inputs.map(() => new Map()));
  const other = new Set<string>();

  inputs.forEach((col, i) => {
    for (const d of col.detections) {
      const blocks = buildingBlocksFor(d.name, d.categories);
      if (blocks.length === 0) {
        other.add(d.name);
        continue;
      }
      for (const b of blocks) {
        const cell = perBlock.get(b)![i];
        if (!cell.has(d.name)) cell.set(d.name, { name: d.name, isAdobe: isAdobeSolution(d.name), weak: d.weak || undefined });
      }
    }
  });

  const rows: SolutionMappingMatrix['rows'] = [];
  const keyFindings: KeyFinding[] = [];
  for (const block of BUILDING_BLOCKS) {
    const cells = perBlock.get(block)!.map((m) => ({ solutions: [...m.values()] }));
    const anyFilled = cells.some((c) => c.solutions.length > 0);
    if (!anyFilled && block === 'Digital Signature') continue;
    if (!anyFilled && !opts.includeEmptyBlocks && !['CMS', 'Analytics', 'Tag Management', 'Personalization & Optimization', 'Campaign Orchestration', 'DMP', 'CDP', 'Profile Resolution', '3rd Party Data', 'Advertising', 'E-Commerce'].includes(block)) continue;
    rows.push({ buildingBlock: block, cells });
    // Schwache (unverifizierte) Signale fließen nicht in die Konsistenz-Bewertung ein.
    const solutionSets = cells.map((c) => c.solutions.filter((s) => !s.weak).map((s) => s.name).sort());
    const code = consistencyCode(solutionSets);
    const solutions = [...new Set(solutionSets.flat())];
    keyFindings.push({ buildingBlock: block, code, solutions, findings: insightsFor(block, code, solutions) });
  }

  return { columns, rows, keyFindings, otherTechnologies: [...other].sort() };
}

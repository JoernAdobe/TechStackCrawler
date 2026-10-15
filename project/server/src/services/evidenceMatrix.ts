import type { DetectedTechnology } from '../types/analysis.js';
import type {
  BuildingBlockAgreement,
  ConsensusStatus,
  EvidenceMatrix,
  EvidenceMatrixRow,
  ObservePointResult,
} from '../types/parity.js';
import { buildingBlocksFor, isAdobeSolution } from '../data/buildingBlocks.js';
import { DETECTION_RULES } from './customDetectors.js';
import { TechstackNameIndex, buildingBlockForOpCategory, isIgnoredOpTag } from './observepoint/canonicalNames.js';

/**
 * Evidence Matrix: Technologie × Quelle mit Konsens-Status und kombinierter Konfidenz.
 * Vergleichbar ist eine Technologie nur, wenn beide Quellen sie grundsätzlich erkennen können
 * (TechStack-Regel vorhanden UND Tag in der ObservePoint-Bibliothek). Sonst "not-comparable",
 * damit fehlende Abdeckung nicht als Widerspruch zählt.
 */

/** Zuverlässigkeit einer ObservePoint-Tag-Erkennung (Request-basiert, sehr präzise). */
const OP_RELIABILITY = 0.9;
/** Zuverlässigkeit einer schwachen TechStack-Erkennung (ein generisches HTML-Signal). */
const WEAK_RELIABILITY = 0.35;
/** Dämpfung, wenn die andere Quelle die Technologie erkennen könnte, sie aber nicht sieht. */
const MISSING_PENALTY = 0.7;

let defaultIndex: TechstackNameIndex | undefined;
export function techstackIndex(): TechstackNameIndex {
  defaultIndex ??= new TechstackNameIndex(DETECTION_RULES.map((r) => r.name));
  return defaultIndex;
}

/**
 * OP-Kategorien, deren Erkennung nur bei separat geladenen Dateien greift (z. B. Bootstrap aus einem CDN).
 * Gebündelte Libraries (AEM-Clientlibs, Webpack) sieht OP nicht – ein Fehlen ist dort kein Widerspruch.
 */
const UNRELIABLE_OP_CATEGORIES = new Set(['JavaScript Libraries']);

/** Schlüssel aller Technologien, die ObservePoint laut Tag-Bibliothek verlässlich erkennen kann. */
export function observePointCoverage(
  library: Iterable<string | { name: string; category?: { name?: string } }>,
  index = techstackIndex(),
): Set<string> {
  const keys = new Set<string>();
  for (const entry of library) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const category = typeof entry === 'string' ? undefined : entry.category?.name;
    if (isIgnoredOpTag(name) || (category && UNRELIABLE_OP_CATEGORIES.has(category))) continue;
    keys.add(index.resolveObservePoint(name));
  }
  return keys;
}

function noisyOr(probabilities: number[]): number {
  return 1 - probabilities.reduce((acc, p) => acc * (1 - Math.max(0, Math.min(1, p))), 1);
}

function verdict(ts: string[], op: string[]): BuildingBlockAgreement['verdict'] {
  if (!ts.length || !op.length) return 'single';
  const a = new Set(ts);
  const overlap = op.filter((n) => a.has(n)).length;
  if (overlap === 0) return 'conflict';
  return overlap === a.size && overlap === op.length ? 'agree' : 'partial';
}

export interface EvidenceMatrixInput {
  detections: DetectedTechnology[];
  observepoint?: ObservePointResult;
  /** Ergebnis von observePointCoverage(); ohne Bibliothek gelten TechStack-Funde als nicht vergleichbar. */
  opCoverage?: Set<string>;
  index?: TechstackNameIndex;
  now?: Date;
}

export function buildEvidenceMatrix(input: EvidenceMatrixInput): EvidenceMatrix {
  const index = input.index ?? techstackIndex();
  const op = input.observepoint?.status === 'done' ? input.observepoint : undefined;
  const coverage = input.opCoverage ?? new Set<string>();
  const rows = new Map<string, EvidenceMatrixRow>();
  const blockOf = new Map<string, string | undefined>();

  for (const d of input.detections) {
    const key = index.resolveTechstack(d.name);
    const existing = rows.get(key);
    const prev = existing?.sources.techstack;
    if (prev && !prev.weak && d.weak) continue;
    const row: EvidenceMatrixRow = existing ?? {
      key,
      technology: d.name,
      isAdobe: isAdobeSolution(d.name),
      status: 'not-comparable',
      confidence: 0,
      sources: {},
    };
    row.sources.techstack = {
      name: d.name,
      confidence: d.confidence,
      weak: d.weak || undefined,
      category: d.categories[0],
      evidence: d.evidence?.slice(0, 5),
    };
    if (!blockOf.get(key)) blockOf.set(key, buildingBlocksFor(d.name, d.categories)[0]);
    rows.set(key, row);
  }

  for (const tag of op?.tags ?? []) {
    const key = index.resolveObservePoint(tag.name);
    const display = index.displayName(key) ?? tag.name;
    const row = rows.get(key) ?? {
      key,
      technology: display,
      isAdobe: isAdobeSolution(display) || isAdobeSolution(tag.name),
      status: 'not-comparable' as ConsensusStatus,
      confidence: 0,
      sources: {},
    };
    const prev = row.sources.observepoint;
    if (prev) {
      // Mehrere OP-Tags auf denselben Schlüssel (z. B. Facebook-Plugins) zusammenfassen.
      prev.pagesPresent = Math.max(prev.pagesPresent ?? 0, tag.pagesPresent);
      const accounts = [...new Set([...(prev.accounts ?? []), ...(tag.accounts ?? [])])];
      if (accounts.length) prev.accounts = accounts.slice(0, 10);
      if (!prev.name.split(' + ').includes(tag.name)) prev.name = `${prev.name} + ${tag.name}`;
    } else {
      row.sources.observepoint = {
        name: tag.name,
        category: tag.category,
        pagesPresent: tag.pagesPresent,
        pagesScanned: op?.pagesScanned,
        accounts: tag.accounts,
      };
    }
    if (!blockOf.get(key)) blockOf.set(key, buildingBlockForOpCategory(tag.category));
    rows.set(key, row);
  }

  for (const row of rows.values()) {
    const ts = row.sources.techstack;
    const opCell = row.sources.observepoint;
    row.buildingBlock = blockOf.get(row.key);
    const pTs = ts ? (ts.weak ? WEAK_RELIABILITY : Math.min(1, (ts.confidence ?? 0) / 100)) : 0;
    const pOp = opCell ? OP_RELIABILITY : 0;
    if (ts && opCell) {
      row.status = 'confirmed';
      if (ts.weak) row.upgradedFromWeak = true;
      row.confidence = noisyOr([pTs, pOp]);
    } else if (ts) {
      row.status = op && coverage.has(row.key) ? 'techstack-only' : 'not-comparable';
      row.confidence = pTs * (row.status === 'techstack-only' ? MISSING_PENALTY : 1);
    } else {
      row.status = index.knows(row.key) ? 'observepoint-only' : 'not-comparable';
      row.confidence = pOp * (row.status === 'observepoint-only' ? MISSING_PENALTY : 1);
    }
    row.confidence = Math.round(row.confidence * 100) / 100;
  }

  const order: Record<ConsensusStatus, number> = {
    'techstack-only': 0,
    'observepoint-only': 1,
    confirmed: 2,
    'not-comparable': 3,
  };
  const sorted = [...rows.values()].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      Number(b.isAdobe) - Number(a.isAdobe) ||
      a.technology.localeCompare(b.technology),
  );

  const byBlock = new Map<string, { ts: string[]; op: string[] }>();
  for (const row of sorted) {
    if (!row.buildingBlock || row.status === 'not-comparable') continue;
    const entry = byBlock.get(row.buildingBlock) ?? { ts: [], op: [] };
    if (row.sources.techstack) entry.ts.push(row.technology);
    if (row.sources.observepoint) entry.op.push(row.technology);
    byBlock.set(row.buildingBlock, entry);
  }
  const blocks: BuildingBlockAgreement[] = [...byBlock.entries()]
    .map(([buildingBlock, e]) => ({
      buildingBlock,
      techstack: e.ts,
      observepoint: e.op,
      verdict: verdict(e.ts, e.op),
    }))
    .sort((a, b) => a.buildingBlock.localeCompare(b.buildingBlock));

  const count = (s: ConsensusStatus) => sorted.filter((r) => r.status === s).length;
  const confirmed = count('confirmed');
  const techstackOnly = count('techstack-only');
  const observepointOnly = count('observepoint-only');
  const comparable = confirmed + techstackOnly + observepointOnly;

  const opSource = input.observepoint;
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    sources: [
      { id: 'techstack', label: 'TechStack Analyzer', available: true, detail: `${input.detections.length} detections` },
      {
        id: 'observepoint',
        label: 'ObservePoint',
        available: !!op,
        detail: op
          ? `Audit ${op.auditId} · Run ${op.runId} · ${op.pagesScanned ?? '?'} page${op.pagesScanned === 1 ? '' : 's'}`
          : (opSource?.note ?? 'not fetched'),
      },
    ],
    rows: sorted,
    blocks,
    stats: {
      comparable,
      confirmed,
      techstackOnly,
      observepointOnly,
      notComparable: count('not-comparable'),
      agreementRate: comparable ? Math.round((confirmed / comparable) * 100) : null,
    },
  };
}

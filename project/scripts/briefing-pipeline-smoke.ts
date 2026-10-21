/**
 * Opt-in Live-Smoke für die Client-Pre-Briefing-Pipeline (echtes Bedrock + echte Recherche).
 *
 *   cd project && npx dotenv -e .env -- tsx scripts/briefing-pipeline-smoke.ts [analysisId | --url https://www.porsche.com]
 *
 * Lädt eine Analyse aus der lokalen SQLite-DB (Default: neueste) und schreibt das Ergebnis-JSON nach
 * server/data/briefing-smoke-<id>.json. Abschnitte per Env: BRIEFING_SMOKE_SECTIONS=s03,s04 (s14 kommt immer dazu).
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBriefingPipeline } from '../server/src/services/briefing/pipeline.js';
import type { AnalysisResult } from '../server/src/types/analysis.js';
import type { BriefingSectionId } from '../server/src/types/briefing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(here, '../server/data/techstack.db');
const arg = process.argv[2];

/** `--url https://…` = minimale Analyse ohne DB (nur URL, keine Detections). */
function loadAnalysis(): { id: number | string; analysis: AnalysisResult } {
  if (arg === '--url' && process.argv[3]) {
    const url = process.argv[3];
    return { id: new URL(url).hostname, analysis: { url, analyzedAt: new Date().toISOString(), summary: '', categories: [], rawDetections: [] } };
  }
  const idArg = arg ? Number(arg) : null;
  const db = new Database(dbPath, { readonly: true });
  const row = (idArg
    ? db.prepare('SELECT id, result_json FROM analyses WHERE id = ?').get(idArg)
    : db.prepare('SELECT id, result_json FROM analyses ORDER BY id DESC LIMIT 1').get()) as { id: number; result_json: string } | undefined;
  db.close();
  if (!row) {
    console.error(`No analysis found in ${dbPath}${idArg ? ` with id ${idArg}` : ''}.`);
    process.exit(1);
  }
  return { id: row.id, analysis: JSON.parse(row.result_json) as AnalysisResult };
}

const row = loadAnalysis();
const analysis = row.analysis;
async function main(): Promise<void> {
  const sections = [...(process.env.BRIEFING_SMOKE_SECTIONS ?? 's03,s04').split(',').map((s) => s.trim()), 's14'] as BriefingSectionId[];
  const started = Date.now();
  const ts = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s`;
  console.log(`Analysis #${row.id} ${analysis.url} – sections ${sections.join(', ')}`);

  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort(new Error('aborted (SIGINT)')));

  const out = await runBriefingPipeline({
    jobId: 0,
    analysis,
    sections: [...new Set(sections)],
    signal: controller.signal,
    onProgress: (p) => console.log(`${ts()} ${p.step.padEnd(9)} ${p.state}${p.message ? ` – ${p.message}` : ''}`),
  });

  const file = path.join(here, `../server/data/briefing-smoke-${row.id}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nDone in ${ts().trim()} – ${out.companyName} (${out.domain}); client domains: ${out.clientDomains.join(', ')}`);
  for (const s of out.sections) {
    console.log(`\n[${s.id}] ${s.title} – ${s.status}, ${s.blocks.length} blocks, ${s.sources.length} sources`);
    for (const src of s.sources) console.log(`   ${src.independent ? 'IND' : 'OWN'} ${src.date.padEnd(8)} ${src.snippetOnly ? '(snippet) ' : ''}${src.publisher} – ${src.url}`);
    for (const g of s.gaps) console.log(`   gap: ${g}`);
  }
  const ex = out.executive;
  console.log(`\nExecutive: score ${ex.overallScore ?? 'n/a'} (${ex.band}, ${ex.confidence} confidence) – ${ex.verdict}`);
  for (const sub of ex.subScores) console.log(`   ${sub.label.padEnd(20)} ${String(sub.value ?? '–').padStart(3)}  ${sub.rationale.slice(0, 140)}`);
  for (const b of ex.bullets) console.log(`   ${b.label}: ${b.text}`);
  for (const p of ex.topPlays) console.log(`   Play: ${p.product} – ${p.headline} (based on: ${p.basedOn})`);
  console.log(`\nUsage: ${JSON.stringify(out.usage)}\nJSON: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

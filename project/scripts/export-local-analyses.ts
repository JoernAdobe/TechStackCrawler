/**
 * Exportiert lokale SQLite-Analysen für Deploy-Migration.
 * Ausgabe: techstack_local_export.json
 * Nutzung: npm run export-for-deploy (vor make deploy)
 */
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../server/data/techstack.db');
const outPath = path.join(__dirname, '../server/techstack_local_export.json');

if (!existsSync(dbPath)) {
  console.log('Keine lokale SQLite-DB gefunden, überspringe Export.');
  process.exit(0);
}

const db = new Database(dbPath);
const rows = db.prepare('SELECT id, url, result_json, analyzed_at, created_at FROM analyses').all() as Array<{
  id: number;
  url: string;
  result_json: string;
  analyzed_at: string;
  created_at: string;
}>;
db.close();

if (rows.length === 0) {
  console.log('Keine Analysen in lokaler DB.');
  process.exit(0);
}

writeFileSync(outPath, JSON.stringify(rows, null, 0));
console.log(`Export: ${rows.length} Analysen → server/techstack_local_export.json`);

/**
 * Muss als erstes geladen werden, damit process.env gesetzt ist,
 * bevor config.js gelesen wird (ES-Module laden Imports vor dem Body).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../.env'),
];
for (const p of envPaths) {
  const r = dotenv.config({ path: p });
  if (!r.error) {
    console.log('[env] Geladen:', p);
    break;
  }
}

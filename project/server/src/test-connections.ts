/**
 * Testet alle externen Verbindungen einzeln.
 * Ausführen: npm run test:connections (im project-Verzeichnis)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { config } from './config.js';
import { getPool } from './db/index.js';
import { textToSpeech, isTtsAvailable } from './services/tts.js';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import puppeteer from 'puppeteer';

type TestResult = { ok: boolean; message: string; detail?: string };

async function testBedrock(): Promise<TestResult> {
  if (!config.bedrock.apiKey || !config.bedrock.endpoint) {
    return { ok: false, message: 'Nicht konfiguriert', detail: 'BEDROCK_API_KEY und BEDROCK_ENDPOINT fehlen' };
  }

  const useApiKey = config.bedrock.apiKey && config.bedrock.endpoint;
  const client = new AnthropicBedrock(
    (useApiKey
      ? {
          skipAuth: true,
          baseURL: config.bedrock.endpoint,
          defaultHeaders: { Authorization: `Bearer ${config.bedrock.apiKey}` },
          awsRegion: config.bedrock.awsRegion,
        }
      : {
          awsAccessKey: config.bedrock.awsAccessKeyId || undefined,
          awsSecretKey: config.bedrock.awsSecretAccessKey || undefined,
          awsRegion: config.bedrock.awsRegion,
          baseURL: config.bedrock.endpoint || undefined,
        }) as never,
  );

  try {
    const stream = await client.messages.stream({
      model: config.bedrock.model,
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
    });
    let chars = 0;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event as { delta?: { type?: string; text?: string } }).delta) {
        const d = (event as { delta: { type?: string; text?: string } }).delta;
        if (d.type === 'text_delta' && d.text) chars += d.text.length;
      }
    }
    return { ok: true, message: `OK – Antwort erhalten (${chars} Zeichen)` };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('403') || msg.includes('expired')) {
      return { ok: false, message: 'API-Key abgelaufen oder ungültig', detail: msg };
    }
    if (msg.includes('401')) {
      return { ok: false, message: 'Nicht autorisiert', detail: msg };
    }
    return { ok: false, message: 'Verbindungsfehler', detail: msg };
  }
}

async function testElevenLabs(): Promise<TestResult> {
  if (!isTtsAvailable()) {
    return { ok: false, message: 'Nicht konfiguriert', detail: 'ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID fehlen' };
  }

  try {
    const audio = await textToSpeech('Test.');
    if (audio && audio.length > 0) {
      return { ok: true, message: `OK – Audio erzeugt (${audio.length} Bytes)` };
    }
    return { ok: false, message: 'Keine Audiodaten erhalten' };
  } catch (e) {
    return { ok: false, message: 'Verbindungsfehler', detail: (e as Error).message };
  }
}

async function testDatabase(): Promise<TestResult> {
  const db = getPool();
  if (!db) {
    return { ok: false, message: 'Nicht konfiguriert', detail: 'DB_PATH (SQLite) oder DB_PASSWORD (MariaDB) fehlt' };
  }

  try {
    await db.execute('SELECT 1');
    const dbType = db.dialect === 'sqlite' ? 'SQLite' : 'MariaDB';
    return { ok: true, message: `OK – ${dbType} Verbindung erfolgreich` };
  } catch (e) {
    const msg = (e as Error).message;
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
      return { ok: false, message: 'MariaDB nicht erreichbar', detail: 'Läuft MariaDB? (z.B. make docker-up)' };
    }
    return { ok: false, message: 'Verbindungsfehler', detail: msg };
  }
}

async function testPuppeteer(): Promise<TestResult> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: config.puppeteer.executablePath,
    });
    await browser.close();
    return { ok: true, message: 'OK – Chromium gestartet' };
  } catch (e) {
    return { ok: false, message: 'Chromium-Fehler', detail: (e as Error).message };
  }
}

async function main() {
  console.log('\n=== TechStackCrawler – Verbindungstests ===\n');

  const results: Record<string, TestResult> = {};

  console.log('1. Bedrock (Claude AI)...');
  results.bedrock = await testBedrock();
  console.log(`   ${results.bedrock.ok ? '✓' : '✗'} ${results.bedrock.message}`);
  if (results.bedrock.detail) console.log(`   → ${results.bedrock.detail}`);

  console.log('\n2. ElevenLabs (TTS)...');
  results.elevenlabs = await testElevenLabs();
  console.log(`   ${results.elevenlabs.ok ? '✓' : '✗'} ${results.elevenlabs.message}`);
  if (results.elevenlabs.detail) console.log(`   → ${results.elevenlabs.detail}`);

  console.log('\n3. Datenbank (SQLite/MariaDB)...');
  results.database = await testDatabase();
  console.log(`   ${results.database.ok ? '✓' : '✗'} ${results.database.message}`);
  if (results.database.detail) console.log(`   → ${results.database.detail}`);

  console.log('\n4. Puppeteer (Chromium)...');
  results.puppeteer = await testPuppeteer();
  console.log(`   ${results.puppeteer.ok ? '✓' : '✗'} ${results.puppeteer.message}`);
  if (results.puppeteer.detail) console.log(`   → ${results.puppeteer.detail}`);

  console.log('\n=== Zusammenfassung ===');
  const ok = Object.values(results).filter((r) => r.ok).length;
  const total = Object.keys(results).length;
  console.log(`${ok}/${total} Tests erfolgreich\n`);
}

main().catch(console.error);

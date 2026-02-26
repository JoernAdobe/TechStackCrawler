#!/usr/bin/env npx tsx
/**
 * Einfacher Test: Nur Bedrock API-Key prüfen.
 * Kein Scraping, keine Analyse – nur ein minimaler Claude-Aufruf.
 *
 * Ausführen: npm run test-bedrock-key (im project-Verzeichnis)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.BEDROCK_API_KEY;
const endpoint = process.env.BEDROCK_ENDPOINT || 'https://bedrock-runtime.us-west-2.amazonaws.com';
const model = process.env.BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-4-6';
const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2';

async function main() {
  console.log('Bedrock API-Key Test');
  console.log('--------------------');
  console.log('Endpoint:', endpoint);
  console.log('Model:', model);
  console.log('Key:', apiKey ? `${apiKey.slice(0, 12)}...` : '(nicht gesetzt)');
  console.log('');

  if (!apiKey) {
    console.error('Fehler: BEDROCK_API_KEY nicht in .env');
    process.exit(1);
  }

  const client = new AnthropicBedrock({
    skipAuth: true,
    baseURL: endpoint,
    defaultHeaders: { Authorization: `Bearer ${apiKey}` },
    awsRegion: region,
  } as never);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
    });

    const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    console.log('Erfolg:', text.trim() || '(leere Antwort)');
    console.log('');
    console.log('Bedrock API-Key ist gültig.');
    process.exit(0);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('Fehler:', msg);
    if (msg.includes('403') || msg.includes('expired')) {
      console.error('');
      console.error('Key abgelaufen. Neuen Key in .env oder via npm run rotate-bedrock-key');
    }
    process.exit(1);
  }
}

main();

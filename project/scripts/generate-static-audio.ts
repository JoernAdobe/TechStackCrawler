/**
 * Generiert statische MP3-Dateien für Welcome und Analysis-Complete.
 * Einmal ausführen (mit ELEVENLABS_API_KEY in .env), dann committen.
 * Live-Deploy braucht keinen ElevenLabs-Key – die Dateien sind statisch.
 *
 * npm run generate-static-audio
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEXTS: Record<string, string> = {
  welcome:
    "[warmly] Welcome! I'm Javlyn, and I'm here to help you with your research. [excited] Enter a URL to analyze any website's technology stack.",
  'analysis-complete':
    "[happily] Your analysis is complete. I've identified the technologies and opportunities for you. [warmly] Take a look at the results.",
};

const outDir = path.join(__dirname, '../client/public/audio');

async function main() {
  const { textToSpeech } = await import('../server/src/services/tts.js');
  const { config } = await import('../server/src/config.js');

  if (!config.elevenlabs.apiKey || !config.elevenlabs.voiceId) {
    console.log('ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID in .env setzen.');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  for (const [name, text] of Object.entries(TEXTS)) {
    const audio = await textToSpeech(text);
    if (!audio || audio.length === 0) {
      console.error(`Fehler: Kein Audio für "${name}"`);
      process.exit(1);
    }
    const outPath = path.join(outDir, `${name}.mp3`);
    writeFileSync(outPath, audio);
    console.log(`  ${name}.mp3 (${(audio.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nStatische Audio-Dateien in client/public/audio/ erstellt.`);
  console.log('Diese Dateien committen – Live-Deploy braucht keinen ElevenLabs-Key.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

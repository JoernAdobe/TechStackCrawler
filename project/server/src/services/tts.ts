import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { config } from '../config.js';
import { getPool } from '../db/index.js';
import {
  getCachedAudio,
  saveCachedAudio,
  getCacheKey,
} from '../db/audioCache.js';

let client: ElevenLabsClient | null = null;

const MAX_CACHE_ENTRIES = 100;
const memoryCache = new Map<string, Buffer>();

function memoryCacheSet(key: string, value: Buffer) {
  if (memoryCache.has(key)) memoryCache.delete(key);
  memoryCache.set(key, value);
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    const oldest = memoryCache.keys().next().value!;
    memoryCache.delete(oldest);
  }
}

function memoryCacheGet(key: string): Buffer | undefined {
  const value = memoryCache.get(key);
  if (value !== undefined) {
    memoryCache.delete(key);
    memoryCache.set(key, value);
  }
  return value;
}

let lastDbWarn = 0;
function warnDbUnavailable(msg: string) {
  const now = Date.now();
  if (now - lastDbWarn > 60_000) {
    lastDbWarn = now;
    console.warn(msg);
  }
}

function getClient(): ElevenLabsClient | null {
  if (!config.elevenlabs.apiKey || !config.elevenlabs.voiceId) {
    return null;
  }
  if (!client) {
    client = new ElevenLabsClient({
      apiKey: config.elevenlabs.apiKey,
    });
  }
  return client;
}

export async function textToSpeech(text: string): Promise<Buffer | null> {
  const voiceId = config.elevenlabs.voiceId || '';
  const modelId = config.elevenlabs.modelId || 'eleven_v3';
  const cacheKey = getCacheKey(text, voiceId, modelId);

  const memCached = memoryCacheGet(cacheKey);
  if (memCached) return memCached;

  // 2. DB-Cache (wenn MariaDB konfiguriert)
  const pool = getPool();
  if (pool) {
    try {
      const cached = await getCachedAudio(pool, text, voiceId, modelId);
      if (cached) {
        memoryCacheSet(cacheKey, cached);
        return cached;
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
        warnDbUnavailable('Audio cache: DB nicht erreichbar (MariaDB mit make docker-up starten)');
      } else {
        console.error('Audio cache read error:', err);
      }
    }
  }

  // 3. ElevenLabs API – nur wenn nicht gecacht
  const elevenlabs = getClient();
  if (!elevenlabs) return null;

  try {
    const stream = await elevenlabs.textToSpeech.convert(
      config.elevenlabs.voiceId,
      {
        text,
        modelId: config.elevenlabs.modelId,
        outputFormat: 'mp3_44100_128',
      },
    );

    if (!stream || typeof stream.getReader !== 'function') {
      return null;
    }

    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const audio = Buffer.concat(chunks);

    // 4. Speichern: In-Memory + DB
    if (audio.length > 0) {
      memoryCacheSet(cacheKey, audio);
      if (pool) {
        try {
          await saveCachedAudio(pool, text, voiceId, modelId, audio);
        } catch (err) {
          const e = err as NodeJS.ErrnoException;
          if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
            warnDbUnavailable('Audio cache: DB nicht erreichbar (MariaDB mit make docker-up starten)');
          } else {
            console.error('Audio cache write error:', err);
          }
        }
      }
    }

    return audio;
  } catch (err) {
    console.error('TTS error:', err);
    return null;
  }
}

export function isTtsAvailable(): boolean {
  return !!(config.elevenlabs.apiKey && config.elevenlabs.voiceId);
}

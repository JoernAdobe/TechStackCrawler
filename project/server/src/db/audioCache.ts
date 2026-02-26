import type { DbHandle } from './types.js';
import { createHash } from 'crypto';

/** Cache-Key: hash(text + voiceId + modelId) – gleicher Text mit anderer Stimme = anderer Cache */
export function getCacheKey(text: string, voiceId: string, modelId: string): string {
  return createHash('sha256')
    .update(text + '|' + voiceId + '|' + modelId)
    .digest('hex');
}

export async function getCachedAudio(
  db: DbHandle,
  text: string,
  voiceId: string,
  modelId: string,
): Promise<Buffer | null> {
  const hash = getCacheKey(text, voiceId, modelId);
  const { rows } = await db.execute(
    `SELECT audio_data FROM audio_cache WHERE text_hash = ?`,
    [hash],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as { audio_data: Buffer } | null;
  return row ? Buffer.from(row.audio_data) : null;
}

export async function saveCachedAudio(
  db: DbHandle,
  text: string,
  voiceId: string,
  modelId: string,
  audio: Buffer,
): Promise<void> {
  const hash = getCacheKey(text, voiceId, modelId);
  if (db.dialect === 'sqlite') {
    await db.execute(
      `INSERT INTO audio_cache (text_hash, audio_data) VALUES (?, ?)
       ON CONFLICT(text_hash) DO UPDATE SET audio_data = excluded.audio_data, created_at = datetime('now')`,
      [hash, audio],
    );
  } else {
    await db.execute(
      `INSERT INTO audio_cache (text_hash, audio_data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE audio_data = VALUES(audio_data), created_at = CURRENT_TIMESTAMP`,
      [hash, audio],
    );
  }
}

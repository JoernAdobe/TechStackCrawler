import type { Request, Response } from 'express';
import { z } from 'zod';
import { textToSpeech, isTtsAvailable } from '../services/tts.js';
import { AppError, ServiceUnavailableError, parseBody } from '../utils/http.js';

/** Obergrenze pro Anfrage — schützt vor unnötigem ElevenLabs-Verbrauch. */
const MAX_TTS_CHARS = 5000;

const ttsSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(MAX_TTS_CHARS, `Text too long (max ${MAX_TTS_CHARS} characters)`),
});

export async function ttsRoute(req: Request, res: Response) {
  if (!isTtsAvailable()) {
    throw new ServiceUnavailableError(
      'TTS not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.',
    );
  }

  const { text } = parseBody(ttsSchema, req.body);

  const audio = await textToSpeech(text);
  if (!audio) {
    throw new AppError(502, 'tts_failed', 'Failed to generate speech');
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', audio.length);
  res.send(audio);
}
